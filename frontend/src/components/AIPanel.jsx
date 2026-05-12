import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send } from "lucide-react";
import { useStore } from "../store";
import { chatWithEudora, reverseGeocode } from "../api";
import { generateInstructions } from "../utils/navigation";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import "../styles/ai-panel.css";

export function AIPanel() {
  const {
    mode, setMode,
    chatMessages, addChatMessage,
    setRoutes, setActiveRoute,
    setIsNavigating, setNavInstructions,
    setIsLoading,
    origin, setOrigin, userLocation,
  } = useStore();

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRouteQuery, setIsRouteQuery] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const scrollRef = useRef(null);

  // Refs to safely access latest values inside effects
  const startListeningRef = useRef(null);
  const sendMessageRef = useRef(null);
  const lastInputWasMic = useRef(false);  // only auto-fire when conversation started via mic
  const micTimerRef = useRef(null);        // cancel pending auto-fire if user acts first
  const touchHandledRef = useRef(false);

  const {
    transcript,
    isListening,
    isTranscribing,
    startListening,
    stopListening,
    setOnTranscriptReady,
    isSupported,
  } = useVoiceInput();

  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  };

  const looksLikeNavigationRequest = (text) => {
    const normalized = text.toLowerCase();
    return /\b(take me|navigate|directions?|route|go to|drive to|lead me|show me.*way|near me|nearby|around me|weather|air quality)\b/.test(normalized);
  };

  const getCurrentLocationForChat = useCallback(async (messageText) => {
    if (!looksLikeNavigationRequest(messageText)) return null;

    const knownLocation = userLocation || origin;
    if (knownLocation?.lat && (knownLocation.lng || knownLocation.lon)) {
      return {
        lat: knownLocation.liveLat ?? knownLocation.lat,
        lon: knownLocation.liveLng ?? knownLocation.lng ?? knownLocation.lon,
        label: knownLocation.label || "My Location",
      };
    }

    if (!("geolocation" in navigator)) return null;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let label = "My Location";
          try {
            const res = await reverseGeocode(latitude, longitude);
            label = res?.address?.road || res?.address?.suburb || label;
          } catch {
            // Keep the generic label when reverse geocoding is unavailable.
          }

          setOrigin({ lat: latitude, lng: longitude, label });
          resolve({ lat: latitude, lon: longitude, label });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }, [origin, setOrigin, userLocation]);

  // Keep startListening ref in sync
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Cancel auto-mic when user leaves AI mode
  useEffect(() => {
    if (mode !== "ai") {
      clearTimeout(micTimerRef.current);
      lastInputWasMic.current = false;
    }
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping, isTranscribing]);

  useEffect(() => {
    if (!isListening) {
      setRecordingSeconds(0);
      return undefined;
    }

    setRecordingSeconds(0);
    const timer = setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isListening]);

  // Handle route data from any response type
  const handleRouteData = useCallback((res, isNavConfirmation = false) => {
    const routesOnly = { ...res };
    delete routesOnly.ai_response;
    delete routesOnly.type;

    const routeKeys = Object.keys(routesOnly).filter(
      (k) => routesOnly[k]?.route?.geometry?.coordinates
    );
    if (routeKeys.length === 0) return;

    setRoutes(routesOnly);

    const bestKey = routesOnly.overall_best ? "overall_best" : routeKeys[0];
    const bestRoute = routesOnly[bestKey];
    if (bestRoute?.route?.geometry?.coordinates) {
      setActiveRoute(bestKey);
      const instructions = generateInstructions(bestRoute.route.geometry.coordinates);
      setNavInstructions(instructions);

      if (isNavConfirmation) {
        setTimeout(() => {
          setIsNavigating(true);
          addChatMessage({
            id: `nav-started-${Date.now()}`,
            role: "eudora",
            text: "🧭 Navigation started. Drive safe!",
          });
        }, 1200);
      }
    }
  }, [setRoutes, setActiveRoute, setNavInstructions, setIsNavigating, addChatMessage]);

  // Send a message (text) to the chat endpoint
  const sendMessage = useCallback(async (messageText) => {
    if (!messageText.trim()) return;

    addChatMessage({ id: Date.now().toString(), role: "user", text: messageText });
    setIsRouteQuery(looksLikeNavigationRequest(messageText));
    setIsTyping(true);
    setIsLoading(true);

    const currentLocation = await getCurrentLocationForChat(messageText);
    const res = await chatWithEudora(messageText, currentLocation);
    setIsTyping(false);
    setIsLoading(false);

    if (res) {
      addChatMessage({ id: Date.now().toString(), role: "eudora", text: res.ai_response });

      if (res.type === "navigation") {
        handleRouteData(res, true);
      } else if (res.type === "tools" && res.fastest) {
        handleRouteData(res, false);
      }

      // Only auto-fire mic if this conversation turn was started by voice
      if (lastInputWasMic.current) {
        micTimerRef.current = setTimeout(() => {
          startListeningRef.current?.();
        }, 3000); // 3s - gives user time to read the reply
      }
    } else {
      addChatMessage({
        id: Date.now().toString(),
        role: "eudora",
        text: "I encountered an error connecting to my core.",
      });
    }
  }, [addChatMessage, getCurrentLocationForChat, handleRouteData, setIsLoading]);

  // Keep ref in sync so the callback can call the latest sendMessage
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Register the callback: when Whisper finishes, show the user bubble and send
  useEffect(() => {
    setOnTranscriptReady((finalText) => {
      lastInputWasMic.current = true;
      setInput("");
      sendMessageRef.current?.(finalText);
    });
  }, [setOnTranscriptReady]);

  // Mirror live transcript into the input field while recording
  useEffect(() => {
    if (isListening) {
      setInput(transcript);
    }
  }, [transcript, isListening]);

  // Handle text input send
  const handleSend = async () => {
    if (!input.trim()) return;
    lastInputWasMic.current = false; // keyboard turn - don't auto-fire mic
    clearTimeout(micTimerRef.current); // cancel any pending auto-fire
    const userMsg = input;
    setInput("");
    await sendMessage(userMsg);
  };

  const toggleMic = () => {
    clearTimeout(micTimerRef.current); // cancel auto-fire if user manually taps mic
    if (isListening) {
      stopListening();
    } else {
      setInput("");
      startListening();
    }
  };

  const handleMicTouchStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    touchHandledRef.current = true;
    toggleMic();
  };

  const handleMicClick = (event) => {
    if (touchHandledRef.current) {
      touchHandledRef.current = false;
      return;
    }
    event.preventDefault();
    toggleMic();
  };

  return (
    <AnimatePresence>
      {mode === "ai" && (
        <motion.div
          className="ai-panel-wrapper"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 500 }}
          dragElastic={0.2}
          onDragEnd={(e, { offset, velocity }) => {
            if (offset.y > 150 || velocity.y > 500) {
              setMode("hands-on");
            }
          }}
        >
          <div className="ai-panel">
            <div className="drag-handle">
              <div className="drag-bar" />
            </div>

            <div className="chat-history" ref={scrollRef}>
              {chatMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`chat-bubble ${msg.role === "user" ? "is-user" : "is-eudora"}`}
                >
                  {msg.text}
                </motion.div>
              ))}
              {isTyping && <ThinkingIndicator isRouteQuery={isRouteQuery} />}
              {isTranscribing && (
                <motion.div
                  key="transcribing-bubble"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="chat-bubble is-user transcribing-bubble"
                >
                  <div className="transcribing-inline">
                    <div className="transcribing-spinner" />
                    <span>Transcribing voice…</span>
                  </div>
                </motion.div>
              )}

            </div>

            <div className="chat-input-area">
              {isListening ? (
                <div className="voice-recording-box" aria-live="polite">
                  <div className="recording-dot" />
                  <span className="recording-time">{formatRecordingTime(recordingSeconds)}</span>
                  <div className="recording-wave" aria-hidden="true">
                    {Array.from({ length: 18 }).map((_, index) => (
                      <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
                    ))}
                  </div>
                  <span className="recording-status">Recording voice</span>
                </div>
              ) : (
                <div className="chat-input-box">
                  <input
                    className="chat-input"
                    placeholder={isTranscribing ? "Transcribing…" : "Ask EUDORA..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={isTranscribing}
                  />
                  <button
                    className="send-btn"
                    onClick={handleSend}
                    disabled={!input.trim() || isTranscribing}
                  >
                    <Send size={18} />
                  </button>
                </div>
              )}
              <button
                className={`mic-btn ${isListening ? "is-listening" : ""}`}
                onTouchStart={handleMicTouchStart}
                onClick={handleMicClick}
                disabled={!isSupported || isTranscribing}
                title={
                  isTranscribing
                    ? "Transcribing voice..."
                    : !isSupported
                    ? "Speech recognition not supported in this browser"
                    : isListening
                    ? "Stop listening"
                    : "Start voice input"
                }
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
