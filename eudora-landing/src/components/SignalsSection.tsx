"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function SignalsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const bottomCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 70%",
      },
    });

    tl.fromTo(svgRef.current, { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: "power2.out" })
      .fromTo(leftCardRef.current, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.6")
      .fromTo(rightCardRef.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.6")
      .fromTo(bottomCardRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.3");

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  const glassCard: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(240,235,227,0.1)",
    borderRadius: 20,
    padding: "36px 32px",
    borderTop: "2px solid rgba(224,85,85,0.4)",
    opacity: 0,
  };

  return (
    <section
      ref={sectionRef}
      style={{
        background: "#1c1a17",
        borderTop: "1px solid rgba(240,235,227,0.06)",
        padding: "160px 0",
        overflow: "hidden",
      }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }} className="!px-6 sm:!px-8 lg:!px-12">
        {/* Label */}
        <p
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.3em",
            color: "#9e9890",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 80,
          }}
        >
          LEAST SIGNALS
        </p>

        {/* 3-column grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, alignItems: "start" }}
          className="!grid-cols-1 md:!grid-cols-3"
        >
          {/* Left card */}
          <div ref={leftCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#e05555", margin: 0, lineHeight: 1 }}>
              8&ndash;12
            </p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>
              signal stops per trip
            </p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              The average Indore commuter stops at 8 to 12 signals on every single trip.
            </p>
          </div>

          {/* Center (SVG + text) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <svg
              ref={svgRef}
              width="80"
              height="280"
              viewBox="0 0 80 280"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ opacity: 0 }}
            >
              {/* Pole */}
              <rect x="35" y="180" width="10" height="100" fill="#2a2723" />
              {/* Housing */}
              <rect x="10" y="0" width="60" height="180" rx="12" fill="#1c1a17" stroke="rgba(240,235,227,0.12)" strokeWidth="1.5" />
              {/* Red light */}
              <circle cx="40" cy="42" r="18" fill="#e05555" style={{ filter: "drop-shadow(0 0 12px #e05555)" }} className="animate-pulse-light" />
              {/* Amber light */}
              <circle cx="40" cy="90" r="18" fill="rgba(232,168,69,0.2)" />
              {/* Green light */}
              <circle cx="40" cy="138" r="18" fill="rgba(62,207,207,0.2)" />
            </svg>
            <p style={{ fontSize: "2rem", fontWeight: 700, color: "#f0ebe3", margin: 0 }}>
              Stop Less.
            </p>
          </div>

          {/* Right card */}
          <div ref={rightCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#e05555", margin: 0, lineHeight: 1 }}>
              12h
            </p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>
              LOST AT RED LIGHTS 
            </p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              Unnecessary red lights costs you 12 hours every month. EUDORA finds paths that keep you moving.
            </p>
          </div>
        </div>

        {/* Bottom full-width card */}
        <div
          ref={bottomCardRef}
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(224,85,85,0.2)",
            borderRadius: 20,
            padding: 48,
            marginTop: 48,
            textAlign: "center",
            opacity: 0,
          }}
        >
          <p
            style={{
              fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
              fontWeight: 600,
              color: "#f0ebe3",
              maxWidth: 700,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            EUDORA&apos;s Least Signals route finds paths with the fewest red lights &mdash; keeping you moving when others are stuck waiting.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulseLight {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        .animate-pulse-light {
          animation: pulseLight 1.5s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}
