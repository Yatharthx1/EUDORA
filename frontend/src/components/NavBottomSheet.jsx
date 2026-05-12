import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store";
import { formatDistance } from "../utils/navigation";
import "../styles/navigation.css";

const getIcon = (type) => {
  if (type === "turn_left") return "↰";
  if (type === "turn_right") return "↱";
  if (type === "destination") return "📍";
  return "↑";
};

export function NavBottomSheet() {
  const { navInstructions, currentNavStep } = useStore();
  const listRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Scroll active step into view
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(".is-active");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentNavStep]);

  if (!navInstructions || navInstructions.length === 0) return null;

  return (
    <motion.div
      className="nav-bottom-sheet"
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.4}
      onDragEnd={(e, info) => {
        if (info.offset.y < -50) setIsOpen(true);
        if (info.offset.y > 50) setIsOpen(false);
      }}
      initial={{ y: "100%" }}
      animate={{ y: isOpen ? "0%" : "65%" }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="drag-handle" />
      <div className="nav-steps-list" ref={listRef}>
        {navInstructions.map((step, index) => {
          const isActive = index === currentNavStep;
          const isPast = index < currentNavStep;

          return (
            <div
              key={step.id}
              className={`nav-step ${isActive ? "is-active" : ""} ${isPast ? "is-past" : ""}`}
            >
              <div className="step-icon">
                {getIcon(step.type)}
              </div>
              <div className="step-details">
                <div className="step-instruction">{step.instruction}</div>
                <div className="step-distance">{formatDistance(step.distance)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
