"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width = 220;
    const H = canvas.height = 220;

    type Particle = {
      x: number; y: number; r: number;
      vx: number; vy: number;
      opacity: number; fadeRate: number;
      color: string;
    };

    const colors = [
      "rgba(180,140,60,",
      "rgba(160,120,50,",
      "rgba(200,160,70,",
      "rgba(100,90,70,",
      "rgba(62,207,207,",
    ];

    const particles: Particle[] = [];

    function spawn(): Particle {
      return {
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H - 10,
        r: 6 + Math.random() * 14,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(0.4 + Math.random() * 0.7),
        opacity: 0.6 + Math.random() * 0.3,
        fadeRate: 0.003 + Math.random() * 0.004,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    }

    // Pre-populate
    for (let i = 0; i < 30; i++) {
      const p = spawn();
      p.y = H - 10 - Math.random() * H;
      p.opacity = Math.random() * 0.5;
      particles.push(p);
    }

    let animId: number;

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // Spawn new particles
      if (particles.length < 60 && Math.random() < 0.4) {
        particles.push(spawn());
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.08;
        p.opacity -= p.fadeRate;

        if (p.opacity <= 0) { particles.splice(i, 1); continue; }

        const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        grad.addColorStop(0, `${p.color}${p.opacity})`);
        grad.addColorStop(1, `${p.color}0)`);

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={220}
      style={{ display: "block" }}
    />
  );
}

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
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, alignItems: "center" }}
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

          {/* Center — particle animation */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {/* Particle canvas inside a subtle vignette container */}
            <div style={{
              position: "relative",
              width: 220,
              height: 220,
              borderRadius: "50%",
              overflow: "hidden",
              boxShadow: "0 0 60px rgba(180,140,60,0.15), inset 0 0 40px rgba(0,0,0,0.6)",
              background: "radial-gradient(circle at 50% 80%, rgba(180,140,60,0.08) 0%, transparent 70%)",
            }}>
              <ParticleCanvas />
              {/* PM2.5 label overlay */}
              <div style={{
                position: "absolute",
                bottom: 28,
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: "0.65rem",
                letterSpacing: "0.25em",
                color: "rgba(180,140,60,0.7)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}>
                PM2.5 · PM10
              </div>
            </div>
            <p style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f0ebe3", margin: 0, textAlign: "center" }}>
              Breathe Easier.
            </p>
            <p style={{ fontSize: "0.8rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
              Every route is different
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
    </section>
  );
}
