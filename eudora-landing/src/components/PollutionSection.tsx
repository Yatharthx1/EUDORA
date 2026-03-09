"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function PollutionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const bottomCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 70%",
      },
    });

    tl.fromTo(leftCardRef.current, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" })
      .fromTo(rightCardRef.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.5")
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
    borderTop: "2px solid rgba(62,207,207,0.4)",
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
          CLEANEST AIR
        </p>

        {/* 3-column grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, alignItems: "start" }}
          className="!grid-cols-1 md:!grid-cols-3"
        >
          {/* Left card */}
          <div ref={leftCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#3ecfcf", margin: 0, lineHeight: 1 }}>34%</p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>
              less pollution exposure
            </p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              The Cleanest Air route exposes you to 34% less particulate matter than the fastest route.
            </p>
          </div>

          {/* Center (smoke + text) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative", width: 200, height: 200, overflow: "hidden" }}>
              <svg width="200" height="200" viewBox="0 0 200 200" style={{ position: "absolute", inset: 0 }}>
                <defs>
                  <filter id="smokeBlur">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
                  </filter>
                </defs>
                <ellipse cx="100" cy="140" rx="80" ry="50" fill="rgba(180,140,60,0.15)" filter="url(#smokeBlur)" className="animate-cloud1" />
                <ellipse cx="70" cy="120" rx="60" ry="35" fill="rgba(62,207,207,0.08)" filter="url(#smokeBlur)" className="animate-cloud2" />
                <ellipse cx="130" cy="130" rx="70" ry="40" fill="rgba(240,235,227,0.06)" filter="url(#smokeBlur)" className="animate-cloud3" />
              </svg>
            </div>
            <p style={{ fontSize: "2rem", fontWeight: 700, color: "#f0ebe3", margin: 0 }}>
              Breathe Easier.
            </p>
          </div>

          {/* Right card */}
          <div ref={rightCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#3ecfcf", margin: 0, lineHeight: 1 }}>#1</p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>
              priority: your lungs
            </p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              Indore ranks among India&apos;s most polluted cities during peak commute hours. Your route determines how much you breathe in.
            </p>
          </div>
        </div>

        {/* Bottom full-width card */}
        <div
          ref={bottomCardRef}
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(62,207,207,0.2)",
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
            EUDORA&apos;s Cleanest Air route steers you away from the most polluted corridors &mdash; so every commute costs your lungs a little less.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes cloud1move {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-30px); }
        }
        @keyframes cloud2move {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes cloud3move {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-25px); }
        }
        .animate-cloud1 { animation: cloud1move 8s linear infinite; }
        .animate-cloud2 { animation: cloud2move 12s linear infinite 1s; }
        .animate-cloud3 { animation: cloud3move 10s linear infinite 2s; }
      `}</style>
    </section>
  );
}
