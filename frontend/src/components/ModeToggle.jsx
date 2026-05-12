import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useStore } from "../store";

export function ModeToggle() {
  const { mode, setMode, theme, toggleTheme } = useStore();

  return (
    <>
      {/* Mode toggle (Hands-On / AI) */}
      <motion.div
        layout
        className="mode-toggle glass-panel"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 25 }}
        style={{
          position: "fixed",
          top: mode === "ai" ? "max(24px, env(safe-area-inset-top))" : "auto",
          bottom: mode === "hands-on" ? "max(32px, env(safe-area-inset-bottom))" : "auto",
          left: 0,
          right: 0,
          margin: "0 auto",
          width: "max-content",
          display: "flex",
          padding: "4px",
          borderRadius: "999px",
          zIndex: 50,
        }}
      >
        {["hands-on", "ai"].map((option) => {
          const isActive = mode === option;
          return (
            <button
              key={option}
              onClick={() => setMode(option)}
              style={{
                position: "relative",
                padding: "10px 24px",
                borderRadius: "999px",
                fontSize: "14px",
                fontWeight: 600,
                color: isActive
                  ? theme === "dark" ? "#000" : "#fff"
                  : "var(--muted)",
                transition: "color 0.2s ease",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="mode-indicator"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: theme === "dark"
                      ? "linear-gradient(180deg, #ffffff, #e6e6e6)"
                      : "linear-gradient(180deg, #1a1a1a, #333)",
                    borderRadius: "999px",
                    zIndex: -1,
                    boxShadow: theme === "dark"
                      ? "0 4px 12px rgba(255, 255, 255, 0.3)"
                      : "0 4px 12px rgba(0, 0, 0, 0.25)",
                  }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              {option === "hands-on" ? "Hands-On" : "AI Mode"}
            </button>
          );
        })}
      </motion.div>

      {/* Theme toggle (Sun/Moon) — repositioned to avoid search bar overlap on mobile */}
      <motion.button
        className="theme-toggle glass-panel"
        onClick={toggleTheme}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 20 }}
        whileTap={{ scale: 0.9 }}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          position: "fixed",
          top: mode === "hands-on" ? "max(28px, env(safe-area-inset-top))" : "max(24px, env(safe-area-inset-top))",
          right: "max(16px, env(safe-area-inset-right))",
          width: 42,
          height: 42,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 55,
          color: "var(--ink)",
          transition: "color 0.3s ease, background 0.3s ease",
        }}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </motion.button>
    </>
  );
}
