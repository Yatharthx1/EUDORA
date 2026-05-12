import { motion } from "framer-motion";

/**
 * Ghost skeleton cards that pulse while route data is loading.
 * Shows 3 placeholder cards that match the real RouteCard layout.
 */
export function SkeletonRouteCards() {
  return (
    <div className="routes-panel">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`skel-${i}`}
          className="skeleton-card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}
          transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "relative" }}
        >
          <div className="skeleton-bone bone-stripe" />
          <div className="skeleton-bone bone-title" />
          <div className="skeleton-bone bone-row" />
          <div className="skeleton-bone bone-row" />
          <div className="skeleton-bone bone-row" />
          <div className="skeleton-bone bone-row" />
        </motion.div>
      ))}
    </div>
  );
}
