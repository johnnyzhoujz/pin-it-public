import { useEffect, useState } from "react";

export function useSystemTheme() {
  const [systemTheme, setSystemTheme] = useState(() => readSystemTheme());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");

    syncSystemTheme();
    media.addEventListener?.("change", syncSystemTheme);
    return () => media.removeEventListener?.("change", syncSystemTheme);
  }, []);

  return systemTheme;
}

function readSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
