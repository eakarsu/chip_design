'use client';

interface SpeechResultAlternative {
  transcript: string;
}
interface SpeechResultItem {
  0: SpeechResultAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResultItem };
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return recognitionCtor() !== null;
}

/** Browser dictation. `onTranscript` fires with interim text and final phrases. */
export function createSpeechRecognition(
  onTranscript: (text: string, final: boolean) => void,
  onEnd: () => void
): SpeechRecognitionLike | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const item = event.results[index];
      const transcript = item[0]?.transcript ?? '';
      if (item.isFinal) {
        if (transcript.trim()) onTranscript(transcript.trim(), true);
      } else {
        interim += transcript;
      }
    }
    if (interim.trim()) onTranscript(interim.trim(), false);
  };
  recognition.onerror = () => onEnd();
  recognition.onend = () => onEnd();
  return recognition;
}

export function speechSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakText(text: string, onEnd: () => void): boolean {
  if (!speechSynthesisAvailable()) return false;
  const spoken = text
    .replace(/```[\s\S]*?```/g, ' code block. ')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4_000);
  if (!spoken) return false;
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.onend = () => onEnd();
  utterance.onerror = () => onEnd();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel();
}
