import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Recorder } from "@/components/Recorder";
import { Sparkles, Zap, FileText, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-10 py-12">
        <div className="max-w-3xl mx-auto flex flex-col gap-10">
          <header className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full glass text-xs text-muted-foreground">
              <Sparkles className="size-3 text-primary" />
              AI-powered meeting & lecture intelligence
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance">
              Capture every word.<br />
              <span className="text-gradient-aura">Crystallize</span> what matters.
            </h1>
            <p className="text-muted-foreground text-pretty max-w-xl">
              Record any meeting or lecture. Get an instant transcript, TLDR, key decisions, and action items —
              automatically extracted by AI.
            </p>
          </header>

          <Recorder />

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Feature
              icon={<Zap className="size-4 text-primary" />}
              title="Live transcription"
              body="Speaker-labeled, timestamped transcripts in seconds."
            />
            <Feature
              icon={<FileText className="size-4 text-primary" />}
              title="Smart summaries"
              body="TLDR, narrative summary, and key decisions surfaced for you."
            />
            <Feature
              icon={<CheckCircle2 className="size-4 text-primary" />}
              title="Action items"
              body="Tasks and assignees extracted, ready to export."
            />
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-2">
      <div className="size-8 rounded-lg bg-surface-2 flex items-center justify-center">{icon}</div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
