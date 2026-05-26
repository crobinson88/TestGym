import { NavLink, Outlet } from "react-router-dom";
import { LogOut, ListChecks, BarChart3, Plus, History, Clock } from "lucide-react";
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
  { to: "/history", label: "History", icon: History },
  { to: "/dashboard", label: "Stats", icon: BarChart3 },
  { to: "/time", label: "Time", icon: Clock },
];

export function AppLayout() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? "";

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

      <main className="flex-1 overflow-y-auto pb-32">
        <Outlet />
      </main>

      <NavLink
        to="/add"
        className="fixed bottom-24 right-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-bg shadow-lg shadow-accent/30"
        aria-label="Add set"
      >
        <Plus className="h-7 w-7" />
      </NavLink>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
