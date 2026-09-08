// Light / dark theming. The whole palette is CSS variables (see styles.css), so
// a theme swap is a class on <html> — no component knows which theme is on.
// The choice is a per-device preference, kept in localStorage like the TDL
// layout toggles.

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";

export function clampTheme(raw: unknown): Theme {
  return raw === "light" || raw === "dark" ? raw : DEFAULT_THEME;
}

// The theme to start in: the remembered choice, else dark. The OS preference
// is deliberately ignored — this app is dark-first (phone-first, often at
// night), so light mode is something you opt into and it then sticks.
export function preferredTheme(stored: unknown): Theme {
  return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
}

export function loadTheme(): Theme {
  try {
    return preferredTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

// Swap the palette and tell the browser which scheme its own widgets (scroll
// bars, date pickers, form controls) should render in.
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f7f7f8" : "#0a0a0a");
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore unavailable storage — the theme still holds for the session
  }
}
