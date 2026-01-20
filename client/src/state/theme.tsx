import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AccentTheme = "prism" | "cyan" | "magenta" | "purple" | "gold";

type ThemeCtx = {
  accent: AccentTheme;
  setAccent: (a: AccentTheme) => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

function applyTheme(accent: AccentTheme) {
  const root = document.documentElement;
  // We keep Tailwind's dark class enabled for the obsidian glass base.
  root.classList.add("dark");
  root.dataset.accent = accent;
  localStorage.setItem("accent", accent);
}

function readAccent(): AccentTheme {
  const a = (localStorage.getItem("accent") || "").toLowerCase();
  if (a === "cyan" || a === "magenta" || a === "purple" || a === "gold" || a === "prism") return a as AccentTheme;
  return "prism";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccent] = useState<AccentTheme>(readAccent());

  useEffect(() => {
    applyTheme(accent);
  }, [accent]);

  const value = useMemo(() => ({ accent, setAccent }), [accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
