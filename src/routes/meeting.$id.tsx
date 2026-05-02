import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trash2, Download, Copy, Check, Clock, FileText, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type ActionItem = { task: string; assignee: string };
type Segment = { speaker: string; timestamp: string; text: string };

type Meeting = {
  id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  transcript: Segment[] | null;
  tldr: string | null;
  summary: string | null;
  key_decisions: string[] | null;
  action_items: ActionItem[] | null;
  created_at: string;
};

export const Route = createFileRoute("/meeting/$id")({
  component: MeetingPage,
});

function speakerColor(speaker: string) {
  const palette = ["text-primary", "text-accent", "text-emerald-300", "text-amber-300", "text-rose-300"];
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function formatDuration(s: number | null) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function MeetingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.from("meetings").select("*").eq("id", id).single();
      if (!mounted) return;
      if (error || !data) {
        toast.error("Meeting not found");
        navigate({ to: "/" });
        return;
      }
      setMeeting(data as unknown as Meeting);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`meeting-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${id}` },
        (payload) => {
          setMeeting(payload.new as unknown as Meeting);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  const onDelete = async () => {
    if (!confirm("Delete this meeting? This cannot be undone.")) return;
    await supabase.from("meetings").delete().eq("id", id);
    toast.success("Meeting deleted");
    navigate({ to: "/" });
  };

  const buildMarkdown = (m: Meeting) => {
    const lines: string[] = [];
    lines.push(`# ${m.title}`);
    lines.push("");
    lines.push(`*${new Date(m.created_at).toLocaleString()} · ${formatDuration(m.duration_seconds)}*`);
    lines.push("");
    if (m.tldr) {
      lines.push("## TLDR");
      lines.push(m.tldr);
      lines.push("");
    }
    if (m.summary) {
      lines.push("## Summary");
      lines.push(m.summary);
      lines.push("");
    }
    if (m.key_decisions?.length) {
      lines.push("## Key Decisions");
      m.key_decisions.forEach((d) => lines.push(`- ${d}`));
      lines.push("");
    }
    if (m.action_items?.length) {
      lines.push("## Action Items");
      m.action_items.forEach((a) => lines.push(`- [ ] **${a.assignee}** — ${a.task}`));
      lines.push("");
    }
    if (m.transcript?.length) {
      lines.push("## Transcript");
      m.transcript.forEach((s) => lines.push(`**[${s.timestamp}] ${s.speaker}:** ${s.text}`));
    }
    return lines.join("\n");
  };

  const onCopy = async () => {
    if (!meeting) return;
    await navigator.clipboard.writeText(buildMarkdown(meeting));
    setCopied(true);
    toast.success("Copied as Markdown — paste into Notion or Google Docs");
    setTimeout(() => setCopied(false), 2000);
  };

  const onDownload = () => {
    if (!meeting) return;
    const md = buildMarkdown(meeting);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meeting.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !meeting) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  const isProcessing = meeting.status === "processing";
  const isError = meeting.status === "error";

  return (
    <AppShell activeId={meeting.id}>
      <header className="h-20 border-b border-border px-10 flex items-center justify-between shrink-0 bg-background/40 backdrop-blur-md">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-crystallized tracking-tight truncate">
            {isProcessing ? "Processing…" : meeting.title}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>{new Date(meeting.created_at).toLocaleString()}</span>
            <span className="opacity-40">•</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {formatDuration(meeting.duration_seconds)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onCopy}
            disabled={isProcessing}
            className="px-3 py-2 rounded-lg glass text-sm hover:bg-surface-2 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy as Markdown"}</span>
          </button>
          <button
            onClick={onDownload}
            disabled={isProcessing}
            className="px-3 py-2 rounded-lg glass text-sm hover:bg-surface-2 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={onDelete}
            className="size-9 rounded-lg glass hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
            aria-label="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      {isError ? (
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="glass rounded-2xl p-10 max-w-md text-center flex flex-col gap-3">
            <p className="text-foreground font-medium">Processing failed</p>
            <p className="text-sm text-muted-foreground">
              The audio couldn't be transcribed. This may be a rate limit, missing AI credits, or unsupported file.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-2 px-4 py-2 rounded-lg bg-[var(--gradient-aura)] text-primary-foreground text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      ) : isProcessing ? (
        <ProcessingState />
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] overflow-hidden">
          {/* Transcript */}
          <article className="overflow-y-auto p-10">
            <div className="max-w-2xl flex flex-col gap-6">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Transcript</h2>
              {(meeting.transcript || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No speech detected in audio.</p>
              ) : (
                (meeting.transcript || []).map((seg, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-14 shrink-0 text-xs text-muted-foreground/60 tabular-nums pt-1">
                      {seg.timestamp}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium block mb-1 ${speakerColor(seg.speaker)}`}>
                        {seg.speaker}
                      </span>
                      <p className="text-sm text-foreground/80 leading-relaxed text-pretty">{seg.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          {/* AI Insights */}
          <aside className="lg:border-l border-border bg-background/50 p-8 overflow-y-auto flex flex-col gap-5 relative">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-primary" />
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                AI Synthesis
              </h2>
            </div>

            {meeting.tldr && (
              <Card>
                <CardTitle>TLDR</CardTitle>
                <p className="text-sm text-foreground/85 leading-relaxed text-pretty">{meeting.tldr}</p>
              </Card>
            )}

            {meeting.summary && (
              <Card>
                <CardTitle icon={<FileText className="size-3.5" />}>Summary</CardTitle>
                <p className="text-sm text-foreground/75 leading-relaxed text-pretty">{meeting.summary}</p>
              </Card>
            )}

            {!!meeting.key_decisions?.length && (
              <Card accent>
                <CardTitle>Key Decisions</CardTitle>
                <ul className="flex flex-col gap-3">
                  {meeting.key_decisions.map((d, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <div className="size-1.5 rounded-full bg-[var(--gradient-aura)] mt-2 shrink-0" />
                      <p className="text-sm text-foreground/85 leading-snug text-pretty">{d}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {!!meeting.action_items?.length && (
              <Card>
                <CardTitle icon={<CheckCircle2 className="size-3.5" />}>Action Items</CardTitle>
                <div className="flex flex-col gap-3">
                  {meeting.action_items.map((a, i) => (
                    <label
                      key={i}
                      className="flex gap-3 items-start group cursor-pointer p-2 -mx-2 rounded-lg hover:bg-surface-2 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 rounded border-border bg-transparent accent-[oklch(0.85_0.10_210)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/90 leading-snug">{a.task}</p>
                        <p className="text-xs text-muted-foreground mt-1">Assigned to {a.assignee}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`relative bg-surface border border-border rounded-2xl p-5 backdrop-blur-xl overflow-hidden ${
        accent ? "shadow-[var(--shadow-card)]" : ""
      }`}
    >
      {accent && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--gradient-aura)] opacity-60" />
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function CardTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-crystallized flex items-center gap-2">
      {icon}
      {children}
    </h3>
  );
}

function ProcessingState() {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] overflow-hidden">
      <div className="p-10 flex flex-col gap-6">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Transcript</h2>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="w-14 h-3 rounded shimmer bg-surface" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3 w-24 rounded shimmer bg-surface" />
              <div className="h-3 w-full rounded shimmer bg-surface" />
              <div className="h-3 w-4/5 rounded shimmer bg-surface" />
            </div>
          </div>
        ))}
      </div>
      <aside className="lg:border-l border-border bg-background/50 p-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="size-3.5 text-primary animate-spin" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest">Crystallizing…</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="h-3 w-24 rounded shimmer bg-surface-2" />
            <div className="h-3 w-full rounded shimmer bg-surface-2" />
            <div className="h-3 w-3/4 rounded shimmer bg-surface-2" />
          </div>
        ))}
      </aside>
    </div>
  );
}
