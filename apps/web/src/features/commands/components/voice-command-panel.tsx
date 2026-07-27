"use client";

import { useMemo, useRef, useState } from "react";
import type { CreateCommandResponse } from "../types/command";
import { useCreateCommand } from "../hooks/use-create-command";

type BrowserSpeechRecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: {
      readonly isFinal: boolean;
      readonly [index: number]: {
        readonly transcript: string;
      };
    };
  };
};

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function VoiceResult({ result }: Readonly<{ result: CreateCommandResponse }>) {
  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <p className="font-medium text-foreground">{result.summary}</p>
      <p className="mt-1 text-xs capitalize text-muted">{result.status.replace("_", " ")}</p>
    </div>
  );
}

export function VoiceCommandPanel() {
  const recognitionRef = useRef<BrowserSpeechRecognition | undefined>(undefined);
  const [transcript, setTranscript] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isListening, setIsListening] = useState(false);
  const [lastResult, setLastResult] = useState<CreateCommandResponse | undefined>();
  const [voiceError, setVoiceError] = useState<string | undefined>();
  const createCommand = useCreateCommand();

  const speechSupported = Boolean(getSpeechRecognitionConstructor());
  const trimmedTranscript = transcript.trim();
  const canSend = trimmedTranscript.length > 0 && !createCommand.isPending;

  const statusText = useMemo(() => {
    if (!speechSupported) {
      return "Browser speech recognition unavailable";
    }

    if (isListening) {
      return "Listening";
    }

    if (createCommand.isPending) {
      return "Planning";
    }

    return "Ready";
  }, [createCommand.isPending, isListening, speechSupported]);

  function startListening() {
    const Recognition = getSpeechRecognitionConstructor();

    if (!Recognition) {
      setVoiceError("Voice capture is not available in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceError("Voice capture stopped before a transcript was ready.");
    };
    recognition.onresult = (event) => {
      let nextTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        nextTranscript += event.results[index]?.[0]?.transcript ?? "";
      }

      setTranscript(nextTranscript.trim());
    };

    recognitionRef.current = recognition;
    setVoiceError(undefined);
    setIsListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function sendVoiceCommand() {
    if (!canSend) {
      return;
    }

    createCommand.mutate(
      {
        conversationId,
        input: trimmedTranscript,
        source: "voice",
      },
      {
        onSuccess: (result) => {
          setConversationId(result.conversationId);
          setLastResult(result);
          setTranscript("");
        },
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Voice command</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Speak to FAIOS</h2>
        </div>
        <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted">
          {statusText}
        </span>
      </div>

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="min-h-16 text-sm leading-6 text-foreground">
          {transcript || "Your transcript will appear here."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!speechSupported || isListening || createCommand.isPending}
          onClick={startListening}
          type="button"
        >
          Start
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isListening}
          onClick={stopListening}
          type="button"
        >
          Stop
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={!canSend}
          onClick={sendVoiceCommand}
          type="button"
        >
          {createCommand.isPending ? "Planning..." : "Send voice command"}
        </button>
      </div>

      {voiceError || createCommand.error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {voiceError ?? createCommand.error?.message}
        </p>
      ) : null}

      {lastResult ? (
        <div className="mt-4">
          <VoiceResult result={lastResult} />
        </div>
      ) : null}
    </section>
  );
}
