import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CheckSquare,
  Clock,
  Dumbbell,
  Heart,
  History,
  Languages,
  ListChecks,
  LogOut,
  Plus,
  Receipt,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type Tab = {
  to: string;
  label: string;
  icon: typeof ListChecks;
  end?: boolean;
};

const tabs: readonly Tab[] = [
  { to: "/", label: "Today", icon: ListChecks, end: true },
  { to: "/tdl", label: "TDL", icon: CheckSquare },
  { to: "/history", label: "History", icon: History },
  { to: "/dashboard", label: "Stats", icon: BarChart3 },
  { to: "/time", label: "Time", icon: Clock },
  { to: "/venmo", label: "Split", icon: Receipt },
  { to: "/shares", label: "Shares", icon: TrendingUp },
  { to: "/french", label: "French", icon: Languages },
  { to: "/reading", label: "Reading", icon: BookOpen },
];

export function AppLayout() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? "";
  const [logOpen, setLogOpen] = useState(false);
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) {
        setLogOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [logOpen]);

  function go(to: string) {
    setLogOpen(false);
    navigate(to);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-line bg-bg px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden />
          <span className="text-muted">Signed in as</span>
          <span className="font-medium">{email}</span>
        </div>
        <button
          onClick={signOut}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 overflow-x-hidden overflow-y-auto pb-32">
        <Outlet />
      </main>

      <div ref={popoverRef} className="fixed bottom-24 right-4 z-20 flex flex-col items-end gap-3">
        {logOpen && (
          <>
            <button
              onClick={() => go("/add-cardio")}
              className="flex h-14 items-center gap-3 rounded-full bg-surface px-5 text-base font-medium text-text shadow-lg ring-1 ring-line transition active:scale-[0.98]"
            >
              <Heart className="h-5 w-5 text-accent" />
              Cardio
            </button>
            <button
              onClick={() => go("/add")}
              className="flex h-14 items-center gap-3 rounded-full bg-surface px-5 text-base font-medium text-text shadow-lg ring-1 ring-line transition active:scale-[0.98]"
            >
              <Dumbbell className="h-5 w-5 text-accent" />
              Set
            </button>
          </>
        )}
        <button
          onClick={() => setLogOpen((o) => !o)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-bg shadow-lg shadow-accent/30 transition active:scale-[0.96]"
          aria-label={logOpen ? "Close log menu" : "Log activity"}
          aria-expanded={logOpen}
        >
          {logOpen ? <X className="h-7 w-7" /> : <Plus className="h-7 w-7" />}
        </button>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-9 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs",
                  isActive ? "text-accent" : "text-muted",
                )
              }
            >
              <Icon className="h-6 w-6" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
