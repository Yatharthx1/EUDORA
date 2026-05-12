import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CHAT_MESSAGES = [
  "Thinking…",
  "Processing…",
  "Composing reply…",
];

const ROUTE_MESSAGES = [
  "Calculating route…",
  "Checking traffic…",
  "Finding cleanest path…",
  "Evaluating air quality…",
  "Counting signals…",
  "Almost there…",
];

/**
 * Streaming-style thinking indicator for the AI chat.
 * Cycles through status messages with a fade transition.
 * Shows route-specific messages only when isRouteQuery is true.
 */
export function ThinkingIndicator({ isRouteQuery = false }) {
  const [index, setIndex] = useState(0);
  const messages = isRouteQuery ? ROUTE_MESSAGES : CHAT_MESSAGES;

  useEffect(() => {
    setIndex(0);
  }, [isRouteQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="thinking-bubble">
      <div className="thinking-orb" />
      <AnimatePresence mode="wait">
        <motion.span
          key={`${isRouteQuery}-${index}`}
          className="thinking-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {messages[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
