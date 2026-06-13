'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Type declarations for Web Speech API (not universally in lib.dom.d.ts across all TS versions)
declare global {
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionResult {
    readonly length: number;
    readonly isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEventMap {
    results: SpeechRecognitionResultList;
    resultIndex: number;
  }

  interface CoachSpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
    readonly resultIndex: number;
  }

  interface CoachSpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }

  interface CoachSpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onstart: ((ev: Event) => void) | null;
    onresult: ((ev: CoachSpeechRecognitionEvent) => void) | null;
    onerror: ((ev: CoachSpeechRecognitionErrorEvent) => void) | null;
    onend: ((ev: Event) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }

  interface CoachSpeechRecognitionConstructor {
    new (): CoachSpeechRecognition;
    prototype: CoachSpeechRecognition;
  }

  interface Window {
    SpeechRecognition?: CoachSpeechRecognitionConstructor;
    webkitSpeechRecognition?: CoachSpeechRecognitionConstructor;
  }
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export function useVoiceInput(
  onTranscript: (text: string) => void,
): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<CoachSpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const accumulatedRef = useRef('');

  // Compute the API constructor once (stable across renders)
  const speechApiRef = useRef<CoachSpeechRecognitionConstructor | null>(null);
  if (typeof window !== 'undefined' && speechApiRef.current === null) {
    speechApiRef.current =
      window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  const isSupported = !!speechApiRef.current;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const API = speechApiRef.current;
    if (!API) return;

    if (recognitionRef.current) recognitionRef.current.stop();
    accumulatedRef.current = '';

    const recognition = new API();
    recognitionRef.current = recognition;

    recognition.lang = navigator.language || 'es-ES';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: CoachSpeechRecognitionEvent) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          text += event.results[i][0].transcript + ' ';
        }
      }
      accumulatedRef.current = text.trim();
    };

    recognition.onerror = (event: CoachSpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const transcript = accumulatedRef.current.trim();
      if (transcript) onTranscriptRef.current(transcript);
      accumulatedRef.current = '';
    };

    recognition.start();
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, isSupported, startListening, stopListening };
}
