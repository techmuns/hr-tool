import { useState } from "react";
import { currentTheme, toggleTheme, type Theme } from "../theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(currentTheme());

  function onClick() {
    setThemeState(toggleTheme());
  }

  return (
    <button
      className="btn icon-btn"
      onClick={onClick}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle color theme"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
