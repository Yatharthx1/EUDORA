import { useState, useEffect, useRef } from "react";
import { Polyline } from "react-leaflet";

/**
 * Animated polyline that traces itself from origin to destination.
 * Progressively reveals coordinates using requestAnimationFrame
 * for a smooth drawing effect.
 *
 * Props:
 *   positions  — full array of [lat, lng] pairs
 *   color      — stroke color
 *   weight     — stroke weight
 *   opacity    — stroke opacity
 *   shadowWeight — weight for the shadow line
 *   shadowOpacity — opacity for the shadow line
 *   duration   — animation duration in ms (default: 1200)
 *   onComplete — callback when animation finishes
 *   className  — optional className for the main polyline
 */
export function AnimatedPolyline({
  positions,
  color,
  weight = 4,
  opacity = 1,
  shadowWeight = 12,
  shadowOpacity = 0.3,
  duration = 1200,
  onComplete,
  className = "",
}) {
  const [visibleCount, setVisibleCount] = useState(2);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const totalPoints = positions.length;
  const completedRef = useRef(false);

  useEffect(() => {
    if (totalPoints <= 2) {
      setVisibleCount(totalPoints);
      return;
    }

    completedRef.current = false;
    startTimeRef.current = null;
    setVisibleCount(2);

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const count = Math.max(2, Math.floor(eased * totalPoints));

      setVisibleCount(count);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setVisibleCount(totalPoints);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [totalPoints, duration]); // Re-animate when positions change

  const visiblePositions = positions.slice(0, visibleCount);

  if (visiblePositions.length < 2) return null;

  return (
    <>
      {/* Shadow polyline */}
      <Polyline
        positions={visiblePositions}
        pathOptions={{
          color,
          weight: shadowWeight,
          opacity: shadowOpacity,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      {/* Main polyline */}
      <Polyline
        positions={visiblePositions}
        pathOptions={{
          color,
          weight,
          opacity,
          lineCap: "round",
          lineJoin: "round",
        }}
        className={className}
      />
    </>
  );
}
