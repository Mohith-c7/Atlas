"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type BrowserSpeechRecognitionErrorEvent = Event & {
  readonly error?: string;
};

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type CaptureState = "idle" | "requesting_permission" | "recording" | "stopping" | "ready" | "error";
type MicrophonePermission = "unknown" | "granted" | "denied" | "unsupported";

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

function isMediaRecorderSupported() {
  return typeof window !== "undefined" && "MediaRecorder" in window;
}

function getMicrophoneErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Microphone permission was denied. Allow microphone access and try again.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found on this device.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is already in use by another app.";
    }
  }

  return "Unable to start microphone capture. Please try again.";
}

function getSpeechRecognitionErrorMessage(event: BrowserSpeechRecognitionErrorEvent) {
  switch (event.error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Speech recognition permission was denied.";
    case "audio-capture":
      return "Speech recognition could not access the microphone.";
    case "network":
      return "Speech recognition lost network access.";
    case "no-speech":
      return "No speech was detected. Try again when you are ready.";
    default:
      return "Voice capture stopped before a transcript was ready.";
  }
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef("");
  const [transcript, setTranscript] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [isClientReady, setIsClientReady] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermission>("unknown");
  const [lastResult, setLastResult] = useState<CreateCommandResponse | undefined>();
  const [voiceError, setVoiceError] = useState<string | undefined>();
  const createCommand = useCreateCommand();

  const speechSupported = isClientReady && Boolean(getSpeechRecognitionConstructor());
  const recordingSupported = isClientReady && isMediaRecorderSupported();
  const captureSupported = speechSupported && recordingSupported;
  const trimmedTranscript = transcript.trim();
  const isRecording = captureState === "recording";
  const isBusy =
    captureState === "requesting_permission" ||
    captureState === "stopping" ||
    isRecording ||
    createCommand.isPending;
  const canSend = trimmedTranscript.length > 0 && !isBusy;

  const characterCount = transcript.length;

  const statusText = useMemo(() => {
    if (!recordingSupported) {
      return "Voice recording unavailable";
    }

    if (!speechSupported) {
      return "Transcript unavailable";
    }

    if (captureState === "requesting_permission") {
      return "Requesting microphone";
    }

    if (captureState === "recording") {
      return "Recording";
    }

    if (captureState === "stopping") {
      return "Preparing transcript";
    }

    if (captureState === "ready") {
      return "Transcript ready";
    }

    if (captureState === "error") {
      return "Needs attention";
    }

    if (createCommand.isPending) {
      return "Planning";
    }

    return "Ready";
  }, [captureState, createCommand.isPending, recordingSupported, speechSupported]);

  function stopActiveCapture() {
    recognitionRef.current?.stop();
    recognitionRef.current = undefined;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = undefined;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
  }

  useEffect(() => {
    setIsClientReady(true);

    return () => stopActiveCapture();
  }, []);

  async function startCapture() {
    const Recognition = getSpeechRecognitionConstructor();

    if (!recordingSupported || !navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unsupported");
      setCaptureState("error");
      setVoiceError("Voice recording is not available in this browser.");
      return;
    }

    if (!Recognition) {
      setCaptureState("error");
      setVoiceError(
        "This browser cannot create a local voice transcript. Use a browser with speech recognition support.",
      );
      return;
    }

    stopActiveCapture();
    audioChunksRef.current = [];
    finalTranscriptRef.current = "";
    setTranscript("");
    setVoiceError(undefined);
    setCaptureState("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicrophonePermission("granted");

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setCaptureState("error");
        setVoiceError("Audio recording failed. Please retry.");
        stopActiveCapture();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const nextState = normalizeTranscript(finalTranscriptRef.current) ? "ready" : "error";
        setCaptureState(nextState);

        if (nextState === "error") {
          setVoiceError("No transcript was captured. Please retry and speak clearly.");
        }
      };

      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onerror = (event) => {
        const message = getSpeechRecognitionErrorMessage(event);
        setVoiceError(message);

        if (message.includes("permission")) {
          setMicrophonePermission("denied");
        }
      };
      recognition.onresult = (event) => {
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript ?? "";

          if (result?.isFinal) {
            finalTranscriptRef.current = normalizeTranscript(
              `${finalTranscriptRef.current} ${text}`,
            );
          } else {
            interimTranscript = `${interimTranscript} ${text}`;
          }
        }

        setTranscript(normalizeTranscript(`${finalTranscriptRef.current} ${interimTranscript}`));
      };
      recognition.onend = () => {
        if (recorder.state === "recording") {
          return;
        }

        setTranscript((currentTranscript) =>
          normalizeTranscript(currentTranscript || finalTranscriptRef.current),
        );
      };

      recorderRef.current = recorder;
      recognitionRef.current = recognition;
      recorder.start(250);
      recognition.start();
      setCaptureState("recording");
    } catch (error) {
      setMicrophonePermission(error instanceof DOMException ? "denied" : "unknown");
      setCaptureState("error");
      setVoiceError(getMicrophoneErrorMessage(error));
      stopActiveCapture();
    }
  }

  function stopCapture() {
    if (captureState !== "recording") {
      return;
    }

    setCaptureState("stopping");
    recognitionRef.current?.stop();
    recognitionRef.current = undefined;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    setCaptureState(trimmedTranscript ? "ready" : "error");
  }

  function cancelCapture() {
    stopActiveCapture();
    audioChunksRef.current = [];
    finalTranscriptRef.current = "";
    setTranscript("");
    setVoiceError(undefined);
    setCaptureState("idle");
  }

  function retryCapture() {
    cancelCapture();
    void startCapture();
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
          setCaptureState("idle");
          finalTranscriptRef.current = "";
          audioChunksRef.current = [];
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
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
          <span>{characterCount}/1000 characters</span>
          <span className="rounded-full border border-border bg-white px-2 py-0.5 capitalize">
            Mic {microphonePermission.replace("_", " ")}
          </span>
          {audioChunksRef.current.length > 0 ? (
            <span className="rounded-full border border-border bg-white px-2 py-0.5">
              Audio captured
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!captureSupported || isBusy}
          onClick={() => void startCapture()}
          type="button"
        >
          Start recording
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isRecording}
          onClick={stopCapture}
          type="button"
        >
          Stop
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={createCommand.isPending || captureState === "idle"}
          onClick={cancelCapture}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!captureSupported || createCommand.isPending || isRecording}
          onClick={() => void retryCapture()}
          type="button"
        >
          Retry
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
