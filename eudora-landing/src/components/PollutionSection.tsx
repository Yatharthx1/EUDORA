"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// ── AQI Gauge ────────────────────────────────────────────────────
function AQIGauge() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = window.devicePixelRatio || 1;
    const SIZE = 240;
    canvas.width = SIZE * DPR;
    canvas.height = SIZE * DPR;
    canvas.style.width = SIZE + "px";
    canvas.style.height = SIZE + "px";
    ctx.scale(DPR, DPR);

    const cx = SIZE / 2;
    const cy = SIZE / 2 + 20;
    const R = 88;
    const ARC_START = Math.PI * 1.1;
    const ARC_END   = Math.PI * 1.9;
    const ARC_RANGE = ARC_END - ARC_START;

    const zones = [
      { label: "Good",      color: "#3ecfcf" },
      { label: "Fair",      color: "#7ecb5f" },
      { label: "Moderate",  color: "#e8a845" },
      { label: "Poor",      color: "#e07050" },
      { label: "Very Poor", color: "#c0405a" },
      { label: "Severe",    color: "#8b2060" },
    ];

    const EUDORA_TARGET = ARC_START + ARC_RANGE * 0.38;
    const NORMAL_TARGET = ARC_START + ARC_RANGE * 0.62;
    let currentAngle = EUDORA_TARGET;
    let targetAngle  = NORMAL_TARGET;
    let phase: "eudora" | "normal" = "normal";
    let pauseTimer = 0;
    let pausing = false;

    function drawArc() {
      ctx.beginPath();
      ctx.arc(cx, cy, R, ARC_START, ARC_END);
      ctx.lineWidth = 16;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineCap = "round";
      ctx.stroke();

      const segCount = zones.length;
      const segSize = ARC_RANGE / segCount;
      zones.forEach((z, i) => {
        const start = ARC_START + segSize * i + 0.01;
        const end   = ARC_START + segSize * (i + 1) - 0.01;
        ctx.beginPath();
        ctx.arc(cx, cy, R, start, end);
        ctx.lineWidth = 14;
        ctx.strokeStyle = z.color + "cc";
        ctx.lineCap = "round";
        ctx.stroke();
      });

      for (let i = 0; i <= segCount; i++) {
        const a = ARC_START + segSize * i;
        const ix = cx + Math.cos(a) * (R + 14);
        const iy = cy + Math.sin(a) * (R + 14);
        const ox = cx + Math.cos(a) * (R + 22);
        const oy = cy + Math.sin(a) * (R + 22);
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ox, oy);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(240,235,227,0.2)";
        ctx.stroke();
      }
    }

    function getZoneAt(angle: number) {
      const ratio = (angle - ARC_START) / ARC_RANGE;
      const idx = Math.min(zones.length - 1, Math.floor(ratio * zones.length));
      return zones[Math.max(0, idx)];
    }

    function drawNeedle(angle: number) {
      const zone = getZoneAt(angle);
      const tipX = cx + Math.cos(angle) * (R - 6);
      const tipY = cy + Math.sin(angle) * (R - 6);

      ctx.save();
      ctx.shadowColor = zone.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.lineWidth = 3;
      ctx.strokeStyle = zone.color;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = zone.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#1c1a17";
      ctx.fill();
    }

    function drawLabel(angle: number) {
      const zone = getZoneAt(angle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const routeLabel = pausing
        ? ""
        : phase === "eudora" ? "EUDORA ROUTE" : "NORMAL ROUTE";

      ctx.font = "600 10px 'Outfit', sans-serif";
      ctx.fillStyle = "rgba(158,152,144,0.75)";
      ctx.fillText(routeLabel, cx, cy - 38);

      ctx.font = "700 20px 'Outfit', sans-serif";
      ctx.fillStyle = zone.color;
      ctx.fillText(zone.label, cx, cy - 18);
    }

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function frame() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      drawArc();

      if (pausing) {
        pauseTimer--;
        if (pauseTimer <= 0) {
          pausing = false;
          phase = phase === "eudora" ? "normal" : "eudora";
          targetAngle = phase === "eudora" ? EUDORA_TARGET : NORMAL_TARGET;
        }
      } else {
        const diff = targetAngle - currentAngle;
        if (Math.abs(diff) < 0.002) {
          currentAngle = targetAngle;
          pausing = true;
          pauseTimer = 110;
        } else {
          currentAngle = lerp(currentAngle, targetAngle, 0.028);
        }
      }

      drawNeedle(currentAngle);
      drawLabel(currentAngle);
      animFrameRef.current = requestAnimationFrame(frame);
    }

    frame();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 230 }}>
        {[
          { label: "Good",      color: "#3ecfcf" },
          { label: "Fair",      color: "#7ecb5f" },
          { label: "Moderate",  color: "#e8a845" },
          { label: "Poor",      color: "#e07050" },
          { label: "Very Poor", color: "#c0405a" },
          { label: "Severe",    color: "#8b2060" },
        ].map(z => (
          <div key={z.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: z.color, flexShrink: 0 }} />
            <span style={{ fontSize: "0.6rem", color: "rgba(158,152,144,0.7)", letterSpacing: "0.04em" }}>{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Section ─────────────────────────────────────────────────
export default function PollutionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const bottomCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
    });
    tl.fromTo(leftCardRef.current, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" })
      .fromTo(rightCardRef.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.5")
      .fromTo(bottomCardRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.3");
    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
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
      style={{ background: "#1c1a17", borderTop: "1px solid rgba(240,235,227,0.06)", padding: "160px 0", overflow: "hidden" }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }} className="!px-6 sm:!px-8 lg:!px-12">

        <p style={{ fontSize: "0.75rem", letterSpacing: "0.3em", color: "#9e9890", textTransform: "uppercase", textAlign: "center", marginBottom: 80 }}>
          CLEANEST AIR
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, alignItems: "center" }} className="!grid-cols-1 md:!grid-cols-3">

          <div ref={leftCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#3ecfcf", margin: 0, lineHeight: 1 }}>34%</p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>less pollution exposure</p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              The Cleanest Air route exposes you to 34% less particulate matter than the fastest route.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <AQIGauge />
            <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f0ebe3", margin: 0, textAlign: "center" }}>Breathe Easier.</p>
          </div>

          <div ref={rightCardRef} style={glassCard}>
            <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "#3ecfcf", margin: 0, lineHeight: 1 }}>#1</p>
            <p style={{ fontSize: "0.85rem", color: "#9e9890", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0" }}>priority: your lungs</p>
            <div style={{ height: 1, background: "rgba(240,235,227,0.08)", margin: "24px 0" }} />
            <p style={{ fontSize: "0.95rem", color: "#9e9890", lineHeight: 1.7, margin: 0 }}>
              Indore ranks among India&apos;s most polluted cities during peak commute hours. Your route determines how much you breathe in.
            </p>
          </div>

        </div>

        <div ref={bottomCardRef} style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(62,207,207,0.2)", borderRadius: 20, padding: 48, marginTop: 48, textAlign: "center", opacity: 0 }}>
          <p style={{ fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", fontWeight: 600, color: "#f0ebe3", maxWidth: 700, margin: "0 auto", lineHeight: 1.5 }}>
            EUDORA&apos;s Cleanest Air route steers you away from the most polluted corridors &mdash; so every commute costs your lungs a little less.
          </p>
        </div>

      </div>
    </section>
  );
}
