"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";

export default function CtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    gsap.fromTo(
      cardRef.current,
      { y: 60, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 60%" },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: "#1c1a17",
      }}
    >
      {/* Animated gradient orbs */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div className="animate-orb1" style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,168,69,0.12), transparent 70%)", top: "20%", left: "20%" }} />
        <div className="animate-orb2" style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(62,207,207,0.1), transparent 70%)", top: "40%", right: "20%" }} />
        <div className="animate-orb3" style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(155,127,232,0.08), transparent 70%)", bottom: "20%", left: "40%" }} />
      </div>

      {/* Glass card */}
      <div
        ref={cardRef}
        style={{
          width: "min(600px, 90vw)",
          padding: "64px 56px",
          borderRadius: 24,
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(40px)",
          border: "1px solid rgba(232,168,69,0.2)",
          boxShadow: "0 0 0 1px rgba(240,235,227,0.05), 0 40px 120px rgba(0,0,0,0.5)",
          textAlign: "center",
          position: "relative",
          zIndex: 10,
          opacity: 0,
        }}
        className="!px-8 !py-12 md:!px-14 md:!py-16"
      >
        <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 700, color: "#f0ebe3", marginBottom: 12 }}>
          Route Differently.
        </h2>
        <p style={{ fontSize: "0.9rem", color: "#9e9890", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 48 }}>
          Built for Indore.
        </p>
        <Link
          href={process.env.NEXT_PUBLIC_APP_URL || "/"}
          style={{
            display: "block",
            width: "100%",
            padding: "18px 0",
            borderRadius: 100,
            border: "1px solid rgba(232,168,69,0.6)",
            background: "transparent",
            color: "#f0ebe3",
            fontSize: "1rem",
            letterSpacing: "0.1em",
            textDecoration: "none",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            const t = e.currentTarget;
            t.style.background = "#e8a845";
            t.style.color = "#1c1a17";
            t.style.borderColor = "#e8a845";
            t.style.boxShadow = "0 8px 40px rgba(232,168,69,0.35)";
          }}
          onMouseLeave={(e) => {
            const t = e.currentTarget;
            t.style.background = "transparent";
            t.style.color = "#f0ebe3";
            t.style.borderColor = "rgba(232,168,69,0.6)";
            t.style.boxShadow = "none";
          }}
        >
          Try EUDORA &rarr;
        </Link>
      </div>

      <style jsx>{`
        @keyframes orb1move {
          0% { transform: translate(-20%, -20%); }
          50% { transform: translate(20%, 20%); }
          100% { transform: translate(-20%, -20%); }
        }
        @keyframes orb2move {
          0% { transform: translate(20%, 20%); }
          50% { transform: translate(-20%, -20%); }
          100% { transform: translate(20%, 20%); }
        }
        @keyframes orb3move {
          0% { transform: translate(0%, -30%); }
          50% { transform: translate(0%, 30%); }
          100% { transform: translate(0%, -30%); }
        }
        .animate-orb1 { animation: orb1move 20s ease infinite; }
        .animate-orb2 { animation: orb2move 25s ease infinite; }
        .animate-orb3 { animation: orb3move 30s ease infinite; }
      `}</style>
    </section>
  );
}