"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

export default function SceneOne() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const lastFrameRef = useRef(-1);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [ready, setReady] = useState(false);
  const frameCount = 96;

  // Preload all 96 frames
  useEffect(() => {
    const loaded: HTMLImageElement[] = new Array(frameCount);
    let count = 0;
    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.decoding = "async";
      const num = (i + 1).toString().padStart(2, "0");
      img.src = `/images/scene1/${num}.webp`;
      img.onload = () => {
        loaded[i] = img;
        count++;
        if (count === frameCount) { setImages(loaded); setReady(true); }
      };
      img.onerror = () => {
        count++;
        if (count === frameCount) { setImages(loaded); setReady(true); }
      };
    }
  }, []);

  // Cache context once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) ctxRef.current = canvas.getContext("2d", { alpha: false });
  }, []);

  // Draw frame with cover fit — skips if same frame
  const drawFrame = useCallback((frameIndex: number, force?: boolean) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas || images.length === 0) return;
    const idx = Math.min(Math.max(frameIndex, 0), frameCount - 1);
    if (idx === lastFrameRef.current && !force) return;
    lastFrameRef.current = idx;
    const img = images[idx];
    if (!img) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const sw = img.naturalWidth * scale;
    const sh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - sw) / 2, (ch - sh) / 2, sw, sh);
  }, [images]);

  // Size canvas + draw frame 0
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!ctxRef.current) ctxRef.current = canvas.getContext("2d", { alpha: false });
      if (ready && images.length > 0) drawFrame(0, true);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [ready, images, drawFrame]);

  // Scroll listener (rAF throttled)
  useEffect(() => {
    if (!ready || images.length === 0) return;
    let ticking = false;

    const onScroll = () => {
      const section = sectionRef.current;
      if (!section) return;
      const scrolled = -section.getBoundingClientRect().top;
      const total = section.offsetHeight - window.innerHeight;
      const progress = Math.min(Math.max(scrolled / total, 0), 1);
      drawFrame(Math.min(Math.floor(progress * 95), 95));

      if (titleRef.current && subtitleRef.current) {
        if (progress < 0.25) {
          titleRef.current.style.opacity = "0";
          titleRef.current.style.transform = "scale(1.3)";
          titleRef.current.style.filter = "blur(10px)";
          subtitleRef.current.style.opacity = "0";
        } else if (progress <= 0.4) {
          const p = (progress - 0.25) / 0.15;
          titleRef.current.style.opacity = String(p);
          titleRef.current.style.transform = `scale(${1.3 - 0.3 * p})`;
          titleRef.current.style.filter = `blur(${10 - 10 * p}px)`;
          subtitleRef.current.style.opacity = String(p);
        } else {
          titleRef.current.style.opacity = "1";
          titleRef.current.style.transform = "scale(1)";
          titleRef.current.style.filter = "blur(0px)";
          subtitleRef.current.style.opacity = "1";
        }
      }

      if (buttonRef.current) {
        if (progress < 0.75) {
          buttonRef.current.style.opacity = "0";
          buttonRef.current.style.transform = "translateY(20px)";
          buttonRef.current.style.pointerEvents = "none";
        } else if (progress <= 0.85) {
          const bp = (progress - 0.75) / 0.1;
          buttonRef.current.style.opacity = String(bp);
          buttonRef.current.style.transform = `translateY(${20 - 20 * bp}px)`;
          buttonRef.current.style.pointerEvents = "auto";
        } else {
          buttonRef.current.style.opacity = "1";
          buttonRef.current.style.transform = "translateY(0px)";
          buttonRef.current.style.pointerEvents = "auto";
        }
      }
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { onScroll(); ticking = false; });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [ready, images, drawFrame]);

  return (
    <section
      id="home"
      ref={sectionRef}
      style={{ position: "relative", height: "400vh", width: "100%" }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          background: "#1c1a17",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0, display: "block", willChange: "transform" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <h1
            ref={titleRef}
            style={{
              fontSize: "clamp(3rem, 8vw, 6rem)",
              fontWeight: 900,
              letterSpacing: "0.25em",
              color: "#f0ebe3",
              textShadow: "0 0 60px rgba(0,0,0,0.8)",
              opacity: 0,
              margin: 0,
              willChange: "transform, opacity, filter",
            }}
          >
            EUDORA
          </h1>
          <p
            ref={subtitleRef}
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
              fontWeight: 400,
              letterSpacing: "0.2em",
              color: "#f0ebe3",
              textTransform: "uppercase",
              textShadow: "0 0 40px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6)",
              opacity: 0,
              marginTop: 20,
              willChange: "opacity",
            }}
          >
            Navigate Smarter. <span style={{ color: "#e8a845" }}>Breathe Better.</span>
          </p>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "12%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <Link
            href={process.env.NEXT_PUBLIC_APP_URL || "/"}
            ref={buttonRef}
            style={{
              padding: "14px 48px",
              borderRadius: 100,
              border: "1px solid rgba(232,168,69,0.6)",
              background: "transparent",
              color: "#f0ebe3",
              fontSize: "0.9rem",
              letterSpacing: "0.1em",
              textDecoration: "none",
              cursor: "pointer",
              transition: "background 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
              opacity: 0,
              pointerEvents: "none",
              willChange: "transform, opacity",
            }}
            onMouseEnter={(e) => {
              const t = e.currentTarget;
              t.style.background = "#e8a845";
              t.style.color = "#1c1a17";
              t.style.borderColor = "#e8a845";
              t.style.boxShadow = "0 8px 32px rgba(232,168,69,0.3)";
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
      </div>
    </section>
  );
}