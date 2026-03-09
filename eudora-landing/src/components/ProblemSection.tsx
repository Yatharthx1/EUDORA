"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function ProblemSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const line1Ref = useRef<HTMLHeadingElement>(null);
  const line2Ref = useRef<HTMLHeadingElement>(null);
  const line3Ref = useRef<HTMLHeadingElement>(null);
  const paraRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 75%",
      },
    });

    tl.fromTo(labelRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" })
      .fromTo(line1Ref.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "+=0.05")
      .fromTo(line2Ref.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "+=0.25")
      .fromTo(line3Ref.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "+=0.25")
      .fromTo(paraRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "+=0.2");

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <section
      id="problem"
      ref={sectionRef}
      style={{ background: "#1c1a17", padding: "160px 0" }}
      className="!py-[80px] sm:!py-[120px] lg:!py-[160px]"
    >
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
        <p
          ref={labelRef}
          style={{
            fontSize: "0.75rem",
            fontWeight: 400,
            letterSpacing: "0.3em",
            color: "#9e9890",
            textTransform: "uppercase",
            marginBottom: 48,
            opacity: 0,
          }}
        >
          EVERY DAY IN INDORE.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3
            ref={line1Ref}
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              color: "#f0ebe3",
              paddingLeft: 24,
              borderLeft: "2px solid rgba(232,168,69,0.25)",
              lineHeight: 1.1,
              margin: 0,
              opacity: 0,
            }}
          >
            Same roads.
          </h3>
          <h3
            ref={line2Ref}
            style={{
              fontSize: "clamp(3rem, 6vw, 5rem)",
              fontWeight: 700,
              color: "#f0ebe3",
              paddingLeft: 24,
              borderLeft: "2px solid rgba(232,168,69,0.45)",
              lineHeight: 1.1,
              margin: 0,
              opacity: 0,
            }}
          >
            Same pollution.
          </h3>
          <h3
            ref={line3Ref}
            style={{
              fontSize: "clamp(3.5rem, 7vw, 6rem)",
              fontWeight: 900,
              color: "#f0ebe3",
              paddingLeft: 24,
              borderLeft: "2px solid rgba(232,168,69,0.7)",
              lineHeight: 1.1,
              margin: 0,
              opacity: 0,
            }}
          >
            Same signals.
          </h3>
        </div>

        <p
          ref={paraRef}
          style={{
            fontSize: "1rem",
            color: "#9e9890",
            maxWidth: 520,
            lineHeight: 1.8,
            marginTop: 48,
            opacity: 0,
          }}
        >
          Millions of commuters have no choice but to take the same congested, polluted routes &mdash; day after day. EUDORA changes that.
        </p>
      </div>
    </section>
  );
}
