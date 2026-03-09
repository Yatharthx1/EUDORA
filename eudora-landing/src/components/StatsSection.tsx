"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STATS: { value: number | null; suffix: string; staticDisplay?: string; label: string }[] = [
  { value: 34, suffix: "%", label: "Less pollution exposure on a Cleanest Air route vs the fastest route." },
  { value: 11, suffix: " min", label: "Average time saved daily by avoiding unnecessary signal stops." },
  { value: null, suffix: "", staticDisplay: "1 Flow", label: "Flow — EUDORA balances all factors simultaneously. You never have to choose." },
];

export default function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const numbersRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Card fade-up
    const cardAnim = gsap.fromTo(
      cardsRef.current.filter(Boolean),
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.2,
        ease: "power2.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
      }
    );

    // Countup (skip static items)
    const countupAnims: gsap.core.Tween[] = [];
    STATS.forEach((stat, i) => {
      const el = numbersRef.current[i];
      if (!el || stat.value === null) return;
      const obj = { val: 0 };
      const tween = gsap.to(obj, {
        val: stat.value,
        duration: 2,
        ease: "power2.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
        onUpdate: () => {
          if (el) el.textContent = Math.round(obj.val).toString();
        },
      });
      countupAnims.push(tween);
    });

    return () => {
      cardAnim.scrollTrigger?.kill();
      countupAnims.forEach((t) => t.scrollTrigger?.kill());
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        background: "#1c1a17",
        borderTop: "1px solid rgba(240,235,227,0.06)",
        padding: "160px 0",
      }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }} className="!px-6 sm:!px-8 lg:!px-12">
        <h2
          style={{
            fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
            fontWeight: 700,
            color: "#f0ebe3",
            maxWidth: 600,
            margin: "0 auto 80px",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          The route you take matters more than you think.
        </h2>

        <div
          style={{ display: "grid", gap: 24 }}
          className="grid-cols-1 md:grid-cols-3"
        >
          {STATS.map((stat, i) => (
            <div
              key={i}
              ref={(el) => { cardsRef.current[i] = el; }}
              style={{
                padding: "48px 40px",
                border: "1px solid rgba(240,235,227,0.1)",
                borderRadius: 20,
                background: "transparent",
                textAlign: "left",
                transition: "transform 0.3s ease",
                cursor: "default",
                opacity: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <p style={{ fontSize: "clamp(3rem, 6vw, 4.5rem)", fontWeight: 900, color: "#e8a845", lineHeight: 1, margin: 0 }}>
                {stat.staticDisplay ? (
                  stat.staticDisplay
                ) : (
                  <><span ref={(el) => { numbersRef.current[i] = el; }}>0</span>{stat.suffix}</>
                )}
              </p>
              <div style={{ width: 40, height: 2, background: "rgba(232,168,69,0.4)", margin: "16px 0" }} />
              <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
