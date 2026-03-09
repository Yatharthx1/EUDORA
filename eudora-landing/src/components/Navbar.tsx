"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const SECTIONS = [
  { id: "home", label: "Home" },
  { id: "problem", label: "Problem" },
  { id: "routes", label: "Routes" },
  { id: "about", label: "About" },
];

export default function Navbar() {
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });

    const triggers: ScrollTrigger[] = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top center",
        end: "bottom center",
        onEnter: () => setActive(id),
        onEnterBack: () => setActive(id),
      });
      triggers.push(st);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      triggers.forEach((t) => t.kill());
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  const handleNav = (id: string) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      setTimeout(() => {
        window.scrollTo({ top: el.offsetTop, behavior: "smooth" });
      }, 100);
    }
  };

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 48px",
        zIndex: 50,
        transition: "all 0.3s ease",
        background: scrolled ? "rgba(28,26,23,0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(240,235,227,0.08)" : "none",
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: "0.2em", color: "#f0ebe3", fontSize: "1rem" }}>
        EUDORA
      </div>

      {/* Desktop links */}
      <div className="hidden md:flex" style={{ gap: "32px", alignItems: "center" }}>
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => handleNav(id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active === id ? "#f0ebe3" : "#9e9890",
              fontSize: "0.85rem",
              letterSpacing: "0.05em",
              fontFamily: "inherit",
              padding: "4px 0",
              borderBottom: active === id ? "2px solid #e8a845" : "2px solid transparent",
              transition: "all 0.3s ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden"
        onClick={() => setMenuOpen(!menuOpen)}
        style={{ background: "none", border: "none", cursor: "pointer", zIndex: 60, position: "relative" }}
        aria-label="Toggle menu"
      >
        <div style={{ width: 24, height: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <span
            style={{
              display: "block",
              width: "100%",
              height: 2,
              background: "#f0ebe3",
              transition: "all 0.3s ease",
              transformOrigin: "left",
              transform: menuOpen ? "rotate(45deg) translateY(-2px)" : "none",
            }}
          />
          <span
            style={{
              display: "block",
              width: "100%",
              height: 2,
              background: "#f0ebe3",
              transition: "all 0.3s ease",
              opacity: menuOpen ? 0 : 1,
            }}
          />
          <span
            style={{
              display: "block",
              width: "100%",
              height: 2,
              background: "#f0ebe3",
              transition: "all 0.3s ease",
              transformOrigin: "left",
              transform: menuOpen ? "rotate(-45deg) translateY(2px)" : "none",
            }}
          />
        </div>
      </button>

      {/* Mobile menu overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#1c1a17",
          zIndex: 55,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "40px",
          transition: "opacity 0.3s ease",
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        className="md:hidden"
      >
        {SECTIONS.map(({ id, label }) => (
          <button
            key={`m-${id}`}
            onClick={() => handleNav(id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active === id ? "#f0ebe3" : "#9e9890",
              fontSize: "2.5rem",
              fontWeight: 700,
              fontFamily: "inherit",
              letterSpacing: "0.05em",
              transition: "color 0.3s ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
