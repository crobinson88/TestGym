import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, loadTheme, saveTheme, type Theme } from "@/lib/theme";

// Light ⇄ dark switch for the whole app, in the header so it is reachable from
// every screen (the board included).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-text"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
