import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Plus, Mic, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type MeetingRow = {
  id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
};

export function Sidebar({ activeId }: { activeId?: string }) {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id, title, status, duration_seconds, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted && data) setMeetings(data as MeetingRow[]);
    };
    load();

    const channel = supabase
      .channel("meetings-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => load())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [location.pathname]);

  const activeMeeting = meetings.find((m) => m.status === "processing" || m.status === "recording");

  return (
    <aside className="w-72 border-r border-border flex flex-col bg-background/40 backdrop-blur-3xl shrink-0 z-10 h-full">
      <div className="p-6 flex items-center gap-3">
        <div className="size-7 rounded-full bg-[var(--gradient-aura)] shadow-[var(--shadow-glow)]" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide text-crystallized">Nodus</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">AI Notes</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link
          to="/"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--gradient-aura)] text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity shadow-[var(--shadow-glow)]"
        >
          <Plus className="size-4" />
          New Recording
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-6">
        {activeMeeting && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3 px-2">
              Active
            </h3>
            <Link
              to="/meeting/$id"
              params={{ id: activeMeeting.id }}
              className="block p-3 rounded-xl glass hover:bg-surface-2 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                {activeMeeting.status === "processing" ? (
                  <>
                    <Loader2 className="size-3 text-primary animate-spin" />
                    <span className="text-xs text-primary font-medium">Processing</span>
                  </>
                ) : (
                  <>
                    <div className="size-2 rounded-full bg-rec pulse-rec" />
                    <span className="text-xs text-rec font-medium">Recording</span>
                  </>
                )}
              </div>
              <p className="text-sm text-foreground font-medium truncate">{activeMeeting.title}</p>
            </Link>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3 px-2">
            Crystallized
          </h3>
          <ul className="flex flex-col gap-0.5">
            {meetings
              .filter((m) => m.status === "ready")
              .map((m) => (
                <li key={m.id}>
                  <Link
                    to="/meeting/$id"
                    params={{ id: m.id }}
                    className={`block px-3 py-2.5 rounded-lg transition-colors ${
                      activeId === m.id
                        ? "bg-surface-2 border border-border"
                        : "hover:bg-surface"
                    }`}
                  >
                    <p className="text-sm text-foreground/80 truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                </li>
              ))}
            {meetings.filter((m) => m.status === "ready").length === 0 && !activeMeeting && (
              <li className="px-3 py-6 text-xs text-muted-foreground text-center">
                <Mic className="size-5 mx-auto mb-2 opacity-50" />
                No recordings yet
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          <span>Powered by Lovable AI</span>
        </div>
      </div>
    </aside>
  );
}
