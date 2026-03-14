"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// We sample every 2nd frame → 48 bitmaps instead of 96.
// The animation is visually identical at half the download size (~5MB vs ~10MB).
const TOTAL_FRAMES = 96;
const STEP = 2; // load frames 1, 3, 5 ... 95
const LOADED_COUNT = Math.ceil(TOTAL_FRAMES / STEP); // 48

export default function SceneOne() {
  const sectionRef  = useRef<HTMLElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const ctxRef      = useRef<CanvasRenderingContext2D | null>(null);
  const titleRef    = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const buttonRef   = useRef<HTMLAnchorElement>(null);
  const lastFrameRef = useRef(-1);

  // Store pre-decoded ImageBitmaps — drawImage(ImageBitmap) is synchronous GPU upload,
  // no decode cost on the main thread during scroll.
  const bitmapsRef = useRef<(ImageBitmap | null)[]>(new Array(LOADED_COUNT).fill(null));
  const loadedRef  = useRef(0);
  const [ready, setReady] = useState(false);

  const drawFrame = useCallback((frameIndex: number, force?: boolean) => {
    const ctx    = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Map 0–95 scroll frame → 0–47 bitmap index
    const bitmapIdx = Math.min(
      Math.floor(frameIndex / STEP),
      LOADED_COUNT - 1
    );
    if (bitmapIdx === lastFrameRef.current && !force) return;

    const bmp = bitmapsRef.current[bitmapIdx];
    if (!bmp) return;

    lastFrameRef.current = bitmapIdx;

    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / bmp.width, ch / bmp.height);
    const sw = bmp.width  * scale;
    const sh = bmp.height * scale;
    ctx.drawImage(bmp, (cw - sw) / 2, (ch - sh) / 2, sw, sh);
  }, []);

  // Load frames: first 4 immediately (covers first scroll segment),
  // rest in idle batches.
  useEffect(() => {
    const loadBitmap = (bitmapIdx: number) => {
      const frameNum = bitmapIdx * STEP + 1; // 1-based, odd frames
      const url = `/images/scene1/${frameNum.toString().padStart(2, "0")}.webp`;

      fetch(url)
        .then(r => r.blob())
        .then(blob => createImageBitmap(blob))
        .then(bmp => {
          bitmapsRef.current[bitmapIdx] = bmp;
          loadedRef.current++;

          // Ready as soon as first 4 bitmaps arrive
          if (loadedRef.current === 4 || loadedRef.current === LOADED_COUNT) {
            setReady(true);
          }
          // Draw frame 0 the moment it's available
          if (bitmapIdx === 0) drawFrame(0, true);
        })
        .catch(() => {
          loadedRef.current++;
          if (loadedRef.current === LOADED_COUNT) setReady(true);
        });
    };

    const scheduleIdle = (fn: () => void) => {
      if ("requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (fn: () => void) => void })
          .requestIdleCallback(fn);
      } else {
        setTimeout(fn, 50);
      }
    };

    // Priority: first 4 frames right away
    for (let i = 0; i < Math.min(4, LOADED_COUNT); i++) loadBitmap(i);

    // Rest in idle chunks of 8
    let next = 4;
    const loadChunk = () => {
      const end = Math.min(next + 8, LOADED_COUNT);
      for (let i = next; i < end; i++) loadBitmap(i);
      next = end;
      if (next < LOADED_COUNT) scheduleIdle(loadChunk);
    };
    scheduleIdle(loadChunk);
  }, [drawFrame]);

  // Cache 2D context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) ctxRef.current = canvas.getContext("2d", { alpha: false });
  }, []);

  // Resize canvas → redraw current frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!ctxRef.current)
        ctxRef.current = canvas.getContext("2d", { alpha: false });
      drawFrame(Math.max(0, lastFrameRef.current * STEP), true);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawFrame]);

  // Scroll → frame + text animations
  useEffect(() => {
    if (!ready) return;
    let ticking = false;

    const onScroll = () => {
      const section = sectionRef.current;
      if (!section) return;
      const scrolled = -section.getBoundingClientRect().top;
      const total    = section.offsetHeight - window.innerHeight;
      const progress = Math.min(Math.max(scrolled / total, 0), 1);

      drawFrame(Math.floor(progress * (TOTAL_FRAMES - 1)));

      // ── Title ──────────────────────────────────────────────────
      if (titleRef.current && subtitleRef.current) {
        if (progress < 0.68) {
          titleRef.current.style.opacity   = "0";
          titleRef.current.style.transform = "scale(1.08) translateY(18px)";
          titleRef.current.style.filter    = "blur(14px)";
          subtitleRef.current.style.opacity   = "0";
          subtitleRef.current.style.transform = "translateY(10px)";
        } else if (progress <= 0.85) {
          const p    = (progress - 0.68) / 0.17;
          const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
          titleRef.current.style.opacity   = String(ease);
          titleRef.current.style.transform = `scale(${1.08 - 0.08 * ease}) translateY(${18 - 18 * ease}px)`;
          titleRef.current.style.filter    = `blur(${14 - 14 * ease}px)`;
          const sp    = Math.max(0, (progress - 0.74) / 0.11);
          const sEase = sp < 0.5 ? 2 * sp * sp : -1 + (4 - 2 * sp) * sp;
          subtitleRef.current.style.opacity   = String(Math.min(1, sEase));
          subtitleRef.current.style.transform = `translateY(${10 - 10 * Math.min(1, sEase)}px)`;
        } else {
          titleRef.current.style.opacity   = "1";
          titleRef.current.style.transform = "scale(1) translateY(0px)";
          titleRef.current.style.filter    = "blur(0px)";
          subtitleRef.current.style.opacity   = "1";
          subtitleRef.current.style.transform = "translateY(0px)";
        }
      }

      // ── Button ─────────────────────────────────────────────────
      if (buttonRef.current) {
        if (progress < 0.86) {
          buttonRef.current.style.opacity       = "0";
          buttonRef.current.style.transform     = "translateY(20px)";
          buttonRef.current.style.pointerEvents = "none";
        } else if (progress <= 0.94) {
          const bp = (progress - 0.86) / 0.08;
          buttonRef.current.style.opacity       = String(bp);
          buttonRef.current.style.transform     = `translateY(${20 - 20 * bp}px)`;
          buttonRef.current.style.pointerEvents = "auto";
        } else {
          buttonRef.current.style.opacity       = "1";
          buttonRef.current.style.transform     = "translateY(0px)";
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
  }, [ready, drawFrame]);

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
          style={{ position: "absolute", top: 0, left: 0, display: "block" }}
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
              fontSize: "clamp(0.65rem, 2.2vw, 1.4rem)",
              fontWeight: 400,
              letterSpacing: "clamp(0.05em, 0.8vw, 0.2em)",
              color: "#f0ebe3",
              textTransform: "uppercase",
              textShadow: "0 0 40px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6)",
              opacity: 0,
              marginTop: 20,
              whiteSpace: "nowrap",
              willChange: "opacity",
            }}
          >
            Navigate Smarter.{" "}
            <span style={{ color: "#e8a845" }}>Breathe Better.</span>
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
              transition:
                "background 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
              opacity: 0,
              pointerEvents: "none",
              willChange: "transform, opacity",
            }}
            onMouseEnter={(e) => {
              const t = e.currentTarget;
              t.style.background   = "#e8a845";
              t.style.color        = "#1c1a17";
              t.style.borderColor  = "#e8a845";
              t.style.boxShadow    = "0 8px 32px rgba(232,168,69,0.3)";
            }}
            onMouseLeave={(e) => {
              const t = e.currentTarget;
              t.style.background   = "transparent";
              t.style.color        = "#f0ebe3";
              t.style.borderColor  = "rgba(232,168,69,0.6)";
              t.style.boxShadow    = "none";
            }}
          >
            Try EUDORA &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}