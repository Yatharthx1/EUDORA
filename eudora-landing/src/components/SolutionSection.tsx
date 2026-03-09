"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function SolutionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 75%",
      },
    });

    tl.fromTo(leftRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" })
      .fromTo(rightRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, "-=0.4");

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <section
      id="solution"
      ref={sectionRef}
      style={{
        background: "#1c1a17",
        borderTop: "1px solid rgba(240,235,227,0.06)",
        padding: "160px 0",
      }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div
        style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}
        className="!px-6 sm:!px-8 lg:!px-12"
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}
          className="!grid-cols-1 md:!grid-cols-2 !gap-12 md:!gap-20"
        >
          <div
            ref={leftRef}
            style={{
              borderLeft: "3px solid #e8a845",
              paddingLeft: 32,
              opacity: 0,
            }}
          >
            <p
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
                fontWeight: 600,
                color: "#e8a845",
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              &ldquo;Global navigation apps are built for the world. We built EUDORA for Indore.&rdquo;
            </p>
          </div>
          <div ref={rightRef} style={{ opacity: 0 }}>
            <p
              style={{
                fontSize: "1.1rem",
                color: "#9e9890",
                lineHeight: 1.9,
                fontWeight: 300,
                margin: 0,
              }}
            >
              Indore&apos;s roads, signals and air quality are unique. No global app will ever go deep enough to solve them. So we did. EUDORA uses hyper-local intelligence to give you routes that global apps will never offer &mdash; built specifically for the way Indian cities move.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
