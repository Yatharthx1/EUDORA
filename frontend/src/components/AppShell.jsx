import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { SPRING_CONFIG } from "../config";

export function AppShell({ children }) {
  const [isFocused, setIsFocused] = useState(false);
  const mode = useStore((state) => state.mode);

  useEffect(() => {
    // Cinematic entrance snap-to-focus delay
    const timer = setTimeout(() => setIsFocused(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className={`app-shell mode-${mode}`}
      initial={{ filter: "blur(8px)", scale: 1.015 }}
      animate={{
        filter: isFocused ? "blur(0px)" : "blur(8px)",
        scale: isFocused ? 1 : 1.015,
      }}
      transition={SPRING_CONFIG}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {isFocused && <div className="lens-flare-effect" />}
      {children}
    </motion.div>
  );
}
