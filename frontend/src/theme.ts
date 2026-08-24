const STORAGE_KEY = "phantom-query-theme";

export interface ThemeState {
  mode: "dark" | "light";
  accent: string;
  accentHover: string;
}

const DEFAULT_THEME: ThemeState = {
  mode: "dark",
  accent: "#22C55E",
  accentHover: "#16A34A",
};

export function loadTheme(): ThemeState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_THEME, ...JSON.parse(stored) };
  } catch {
    // ignore malformed storage, fall back to default
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeState) {
  const root = document.documentElement;
  root.classList.toggle("light", theme.mode === "light");
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-accent-hover", theme.accentHover);
}

export function saveTheme(theme: ThemeState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  applyTheme(theme);
}

// Darkens a hex color by a percentage, used to auto-derive a hover shade
// from whatever accent color the user picks.
export function darken(hex: string, amount = 0.15): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}