"use client";

import { useEffect, useRef, useState } from "react";

export default function Intro() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    // Simple fade-out after a brief pause
    const timer = setTimeout(() => {
      el.style.opacity = "0";
    }, 400);

    const onEnd = () => setTimeout(() => setVisible(false), 100);
    el.addEventListener("transitionend", onEnd);

    return () => {
      clearTimeout(timer);
      el.removeEventListener("transitionend", onEnd);
    };
  }, []);

  if (!visible) return <div style={{ display: "none" }} />;

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#1c1a17",
        transition: "opacity 0.8s ease",
        opacity: 1,
        pointerEvents: "none",
      }}
    />
  );
}
