"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const CARDS = [
  {
    icon: "⚡",
    accent: "#e8a845",
    title: "Fastest",
    body: "Real-time traffic intelligence finds the quickest path to your destination. Every minute counts.",
  },
  {
    icon: "🍃",
    accent: "#3ecfcf",
    title: "Cleanest Air",
    body: "Routes you away from high pollution corridors. Every commute, you breathe a little better.",
  },
  {
    icon: "🚦",
    accent: "#e05555",
    title: "Least Signals",
    body: "Avoid unnecessary stoppages. Fewer red lights, more momentum, less frustration.",
  },
  {
    icon: "✦",
    accent: "#9b7fe8",
    title: "Best Overall",
    body: "The intelligent balance of speed, air quality and signal density. All three. One decision.",
  },
];

export default function RoutesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const anim = gsap.fromTo(
      cardsRef.current.filter(Boolean),
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
        },
      }
    );

    return () => {
      anim.scrollTrigger?.kill();
    };
  }, []);

  return (
    <section
      id="routes"
      ref={sectionRef}
      style={{
        background: "#1c1a17",
        borderTop: "1px solid rgba(240,235,227,0.06)",
        padding: "160px 0",
      }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }} className="!px-6 sm:!px-8 lg:!px-12">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, color: "#f0ebe3", margin: 0 }}>
            Four ways to move smarter.
          </h2>
          <p style={{ fontSize: "1rem", color: "#9e9890", marginTop: 16 }}>
            Every route is a decision. Make the right one.
          </p>
        </div>

        {/* Cards grid */}
        <div
          style={{ display: "grid", gap: 24 }}
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CARDS.map((card, i) => (
            <div
              key={card.title}
              ref={(el) => { cardsRef.current[i] = el; }}
              style={{
                padding: 36,
                borderRadius: 20,
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(240,235,227,0.1)",
                transition: "all 0.3s ease",
                cursor: "default",
                opacity: 0,
              }}
              onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.transform = "translateY(-8px)";
                t.style.background = "rgba(255,255,255,0.07)";
                t.style.borderColor = `${card.accent}66`;
                t.style.boxShadow = "0 20px 60px rgba(0,0,0,0.4)";
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.transform = "translateY(0)";
                t.style.background = "rgba(255,255,255,0.04)";
                t.style.borderColor = "rgba(240,235,227,0.1)";
                t.style.boxShadow = "none";
              }}
            >
              {/* Accent bar */}
              <div style={{ height: 2, width: "100%", borderRadius: 1, background: card.accent, marginBottom: 32, opacity: 0.7 }} />
              <div style={{ fontSize: "2.5rem", marginBottom: 20 }}>{card.icon}</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f0ebe3", marginBottom: 12 }}>{card.title}</h3>
              <p style={{ fontSize: "0.9rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
