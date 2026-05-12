import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "../store";
import { speechToText } from "../api";

const START_SILENCE_TIMEOUT_MS = 2300;
const END_SILENCE_TIMEOUT_MS = 900;
const VOICE_RMS_THRESHOLD = 0.018;

const getRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/wav",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

export function useVoiceInput() {
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { isListening, setIsListening } = useStore();
  const [recognition, setRecognition] = useState(null);

  const fallbackTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const vadFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const browserTranscriptRef = useRef("");
  const isRecordingRef = useRef(false);
  const speechStartedRef = useRef(false);
  const silenceStartedAtRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const stopReasonRef = useRef("manual");
  const stopListeningRef = useRef(null);
  const onTranscriptReadyRef = useRef(null);
  const browserRecognitionActiveRef = useRef(false);
  const transcriptDeliveredRef = useRef(false);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const resetFallbackTimer = useCallback((timeoutMs = END_SILENCE_TIMEOUT_MS) => {
    clearFallbackTimer();
    fallbackTimerRef.current = setTimeout(() => {
      const reason = speechStartedRef.current ? "speech-ended" : "no-speech";
      stopListeningRef.current?.(reason);
    }, timeoutMs);
  }, [clearFallbackTimer]);

  const stopVoiceActivityMonitor = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }

    const audioContext = audioContextRef.current;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const startVoiceActivityMonitor = useCallback(async (stream) => {
    stopVoiceActivityMonitor();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      resetFallbackTimer(START_SILENCE_TIMEOUT_MS);
      return;
    }

    const audioContext = new AudioContextCtor();
    // Mobile browsers start AudioContext suspended; analyser reads as silence until resumed,
    // which falsely triggers the START_SILENCE_TIMEOUT "no-speech" stop (~2.3s).
    try {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    } catch {
      // Resume can fail if gesture context was lost; VAD still runs with best-effort levels.
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    // Silence timeout should start once the analyser pipeline is active (after resume), not before.
    recordingStartedAtRef.current = performance.now();

    const samples = new Uint8Array(analyser.fftSize);

    const checkAudioLevel = () => {
      if (!isRecordingRef.current) return;

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centered = (samples[index] - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / samples.length);
      const now = performance.now();

      if (rms >= VOICE_RMS_THRESHOLD) {
        speechStartedRef.current = true;
        silenceStartedAtRef.current = null;
      } else if (!speechStartedRef.current) {
        if (now - recordingStartedAtRef.current >= START_SILENCE_TIMEOUT_MS) {
          stopListeningRef.current?.("no-speech");
          return;
        }
      } else {
        if (silenceStartedAtRef.current === null) {
          silenceStartedAtRef.current = now;
        }
        if (now - silenceStartedAtRef.current >= END_SILENCE_TIMEOUT_MS) {
          stopListeningRef.current?.("speech-ended");
          return;
        }
      }

      vadFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };

    vadFrameRef.current = requestAnimationFrame(checkAudioLevel);
  }, [resetFallbackTimer, stopVoiceActivityMonitor]);

  const stopBrowserRecognition = useCallback(() => {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // Recognition may already be stopped.
    } finally {
      browserRecognitionActiveRef.current = false;
    }
  }, [recognition]);

  const startBrowserRecognition = useCallback(() => {
    if (!recognition) return false;
    try {
      recognition.start();
      browserRecognitionActiveRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, [recognition]);

  const deliverTranscript = useCallback((text) => {
    const finalText = (text || "").trim();
    if (!finalText || transcriptDeliveredRef.current) return;
    transcriptDeliveredRef.current = true;
    setTranscript(finalText);
    onTranscriptReadyRef.current?.(finalText);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";

    rec.onresult = (event) => {
      let current = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        current += event.results[index][0].transcript;
      }
      browserTranscriptRef.current = current.trim();
      setTranscript(current);
      speechStartedRef.current = true;

      if (!isRecordingRef.current) {
        resetFallbackTimer(END_SILENCE_TIMEOUT_MS);
      }
    };

    rec.onend = () => {
      browserRecognitionActiveRef.current = false;
      if (!isRecordingRef.current) {
        clearFallbackTimer();
        setIsListening(false);
      }
    };

    rec.onerror = () => {
      browserRecognitionActiveRef.current = false;
      if (!isRecordingRef.current) {
        clearFallbackTimer();
        setIsListening(false);
      }
    };

    setRecognition(rec);

    return () => {
      clearFallbackTimer();
      stopVoiceActivityMonitor();
      try {
        rec.stop();
      } catch {
        // Recognition may already be stopped.
      }
    };
  }, [clearFallbackTimer, resetFallbackTimer, setIsListening, stopVoiceActivityMonitor]);

  const startListening = useCallback(async () => {
    setTranscript("");
    setIsTranscribing(false);
    browserTranscriptRef.current = "";
    chunksRef.current = [];
    speechStartedRef.current = false;
    silenceStartedAtRef.current = null;
    stopReasonRef.current = "manual";
    transcriptDeliveredRef.current = false;

    const browserStarted = startBrowserRecognition();

    const canRecord =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";

    if (!canRecord) {
      if (browserStarted) {
        setIsListening(true);
        resetFallbackTimer(START_SILENCE_TIMEOUT_MS);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      isRecordingRef.current = true;
      setIsListening(true);

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearFallbackTimer();
        stopVoiceActivityMonitor();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        isRecordingRef.current = false;
        stopBrowserRecognition();
        setIsListening(false);

        if (stopReasonRef.current === "no-speech" && !browserTranscriptRef.current) {
          setTranscript("");
          setIsTranscribing(false);
          return;
        }

        setIsTranscribing(true);

        const blobType = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        let finalTranscript = "";

        try {
          finalTranscript = await speechToText(audioBlob);
        } catch {
          finalTranscript = "";
        }

        if (!finalTranscript) {
          finalTranscript = browserTranscriptRef.current;
        }

        setTranscript(finalTranscript || "");
        setIsTranscribing(false);

        deliverTranscript(finalTranscript);
      };

      await startVoiceActivityMonitor(stream);

      recorder.start();
    } catch {
      isRecordingRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (browserStarted || browserRecognitionActiveRef.current) {
        setIsListening(true);
        resetFallbackTimer(START_SILENCE_TIMEOUT_MS);
      } else {
        setIsListening(false);
      }
    }
  }, [
    resetFallbackTimer,
    setIsListening,
    startBrowserRecognition,
    startVoiceActivityMonitor,
    deliverTranscript,
    stopBrowserRecognition,
    stopVoiceActivityMonitor,
  ]);

  const stopListening = useCallback((reason = "manual") => {
    stopReasonRef.current = reason;
    clearFallbackTimer();
    stopVoiceActivityMonitor();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    isRecordingRef.current = false;
    stopBrowserRecognition();
    setIsListening(false);
    setIsTranscribing(false);
    deliverTranscript(browserTranscriptRef.current);
  }, [clearFallbackTimer, deliverTranscript, setIsListening, stopBrowserRecognition, stopVoiceActivityMonitor]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const setOnTranscriptReady = useCallback((callback) => {
    onTranscriptReadyRef.current = callback;
  }, []);

  return {
    transcript,
    isListening,
    isTranscribing,
    startListening,
    stopListening,
    setOnTranscriptReady,
    isSupported:
      !!recognition ||
      (typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined"),
  };
}
