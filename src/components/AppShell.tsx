import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children, activeId }: { children: React.ReactNode; activeId?: string }) {
  return (
    <div className="flex h-screen aurora-bg overflow-hidden">
      <Sidebar activeId={activeId} />
      <main className="flex-1 flex flex-col min-w-0 z-10 overflow-hidden">{children}</main>
    </div>
  );
}
