import { useEffect, useState } from "react";

export interface ThemeTokens {
  accent: string;
  accentHover: string;
  grid: string;
  axis: string;
  surface: string;
  elevated: string;
  text: string;
  /** Categorical series. Accent leads, then hues chosen to stay distinct from
   *  each other and legible on both the dark and light surfaces. */
  categorical: string[];
}

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readTokens(): ThemeTokens {
  const accent = readVar("--color-accent", "#22c55e");
  return {
    accent,
    accentHover: readVar("--color-accent-hover", "#16a34a"),
    grid: readVar("--color-line", "#222834"),
    axis: readVar("--color-faint", "#6b7684"),
    surface: readVar("--color-panel", "#11151d"),
    elevated: readVar("--color-elevated", "#171c26"),
    text: readVar("--color-primary", "#e6edf3"),
    categorical: [accent, "#58a6ff", "#d29922", "#bc8cff", "#f778ba", "#39c5cf", "#ff7b72", "#a3b18a"],
  };
}

/**
 * Resolves design tokens to concrete colours for the few places that can't use
 * CSS -- Recharts takes stroke and fill as props, not classes.
 *
 * theme.ts writes both a class (`light`) and inline custom properties on
 * <html> when the user changes theme or accent, so watching those two
 * attributes is enough to recompute. Without this the charts would read their
 * colours once at mount and keep painting the old theme until remount.
 */
export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(readTokens);

  useEffect(() => {
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
