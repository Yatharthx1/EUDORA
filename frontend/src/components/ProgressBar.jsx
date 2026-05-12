import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";

/**
 * Indeterminate progress bar — YouTube / Linear style.
 * Appears at the very top of the viewport when isLoading is true.
 */
export function ProgressBar() {
  const isLoading = useStore((state) => state.isLoading);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className="progress-bar-track"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bar-glow" />
          <div className="bar-primary" />
          <div className="bar-secondary" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
