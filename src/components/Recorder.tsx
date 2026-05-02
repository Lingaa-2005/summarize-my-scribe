import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, AudioLines } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(binary);
}

export function Recorder() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(0.1));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const startVisualizer = (stream: MediaStream) => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const next = Array.from(data.slice(0, 32)).map((v) => Math.max(0.08, v / 255));
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob, "audio/webm");
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      startedAtRef.current = Date.now();
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
      startVisualizer(stream);
      setRecording(true);
    } catch (e) {
      console.error(e);
      toast.error("Microphone access denied. Please enable it and try again.");
    }
  };

  const stop = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setRecording(false);
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const processAudio = async (blob: Blob, mimeType: string) => {
    setProcessing(true);
    try {
      const duration = elapsed;
      const { data: meeting, error: insertErr } = await supabase
        .from("meetings")
        .insert({ title: "Processing…", status: "processing", duration_seconds: duration })
        .select()
        .single();
      if (insertErr || !meeting) throw insertErr || new Error("Failed to create meeting");

      navigate({ to: "/meeting/$id", params: { id: meeting.id } });

      const audioBase64 = await blobToBase64(blob);
      const { error: fnErr } = await supabase.functions.invoke("process-audio", {
        body: { meetingId: meeting.id, audioBase64, mimeType },
      });
      if (fnErr) {
        toast.error(fnErr.message || "Failed to process audio");
        await supabase.from("meetings").update({ status: "error" }).eq("id", meeting.id);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to process recording");
    } finally {
      setProcessing(false);
      cleanup();
      setElapsed(0);
      setLevels(Array(32).fill(0.1));
    }
  };

  const onUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20 MB).");
      return;
    }
    await processAudio(file, file.type || "audio/mpeg");
  };

  if (processing) {
    return (
      <div className="glass rounded-2xl p-12 flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 text-primary animate-spin" />
        <p className="text-foreground font-medium">Crystallizing your audio…</p>
        <p className="text-sm text-muted-foreground">Transcribing & extracting insights</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-10 flex flex-col items-center gap-8">
      {/* Visualizer */}
      <div className="h-24 w-full max-w-md flex items-center justify-center gap-1">
        {levels.map((l, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-[var(--gradient-aura)] transition-all duration-75"
            style={{
              height: `${recording ? Math.max(8, l * 96) : 8}px`,
              opacity: recording ? 0.4 + l * 0.6 : 0.3,
            }}
          />
        ))}
      </div>

      <div className="text-center">
        <div className="text-4xl font-semibold tabular-nums text-crystallized tracking-tight">
          {formatDuration(elapsed)}
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-widest mt-2">
          {recording ? (
            <span className="flex items-center gap-2 justify-center">
              <span className="size-1.5 rounded-full bg-rec pulse-rec" />
              Recording
            </span>
          ) : (
            "Ready to capture"
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            onClick={start}
            className="size-16 rounded-full bg-[var(--gradient-aura)] flex items-center justify-center text-primary-foreground hover:scale-105 transition-transform shadow-[var(--shadow-glow)]"
            aria-label="Start recording"
          >
            <Mic className="size-7" />
          </button>
        ) : (
          <button
            onClick={stop}
            className="size-16 rounded-full bg-rec flex items-center justify-center text-white hover:scale-105 transition-transform pulse-rec"
            aria-label="Stop recording"
          >
            <Square className="size-6 fill-current" />
          </button>
        )}

        <label className="size-12 rounded-full bg-surface-2 border border-border flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-surface-2/80 cursor-pointer transition-colors">
          <Upload className="size-5" />
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AudioLines className="size-3.5" />
        <span>Record live or upload an audio file (mp3, wav, m4a, webm)</span>
      </div>
    </div>
  );
}
