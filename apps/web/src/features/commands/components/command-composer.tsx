"use client";

import { cn } from "@faios/ui";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useCreateCommand } from "../hooks/use-create-command";
import { CommandApiError, type CreateCommandResponse } from "../types/command";

const exampleCommands = [
  "Schedule a customer call next week and draft a follow-up email",
  "Summarize today from Gmail and Calendar, then list urgent follow-ups",
  "Create a GitHub issue for the onboarding bug and prepare a Slack update",
];

const statusStyles = {
  completed: "border-primary/20 bg-primary/10 text-primary",
  awaiting_approval: "border-accent/20 bg-accent/10 text-accent",
  failed: "border-red-200 bg-red-50 text-red-700",
};

function formatStatus(status: CreateCommandResponse["status"]) {
  return status.replace("_", " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function GitHubIssuePayloadPreview({ payload }: Readonly<{ payload: unknown }>) {
  if (!isRecord(payload) || typeof payload.title !== "string") {
    return null;
  }

  const labels = Array.isArray(payload.labels)
    ? payload.labels.filter((label): label is string => typeof label === "string")
    : [];

  return (
    <div className="mt-3 rounded-md border border-border bg-white p-3 text-xs text-muted">
      <p className="font-medium text-foreground">{payload.title}</p>
      {typeof payload.body === "string" ? (
        <p className="mt-2 max-h-16 overflow-hidden whitespace-pre-line leading-5">
          {payload.body}
        </p>
      ) : null}
      {labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <span
              className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommandResult({ result }: Readonly<{ result: CreateCommandResponse }>) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Plan result</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{result.summary}</h2>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
            statusStyles[result.status],
          )}
        >
          {formatStatus(result.status)}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {result.steps.map((step, index) => (
          <article
            className="rounded-md border border-border bg-background p-4"
            key={`${step.capability}-${step.provider ?? "default"}-${index}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="font-semibold text-foreground">{step.capability}</h3>
              {step.provider ? (
                <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-muted">
                  {step.provider}
                </span>
              ) : null}
              {step.requiresApproval ? (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  Approval needed
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{step.reason}</p>
            {step.capability === "repository.createIssue" ? (
              <GitHubIssuePayloadPreview payload={step.executionPayload} />
            ) : null}
          </article>
        ))}
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-xs text-muted sm:grid-cols-3">
        <div>
          <dt className="font-medium text-foreground">Command</dt>
          <dd className="mt-1 break-all">{result.commandId}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Conversation</dt>
          <dd className="mt-1 break-all">{result.conversationId}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Correlation</dt>
          <dd className="mt-1 break-all">{result.correlationId}</dd>
        </div>
      </dl>
    </section>
  );
}

export function CommandComposer() {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<CreateCommandResponse | undefined>();
  const createCommand = useCreateCommand();

  const trimmedInput = input.trim();
  const characterCount = input.length;
  const canSubmit = trimmedInput.length > 0 && !createCommand.isPending;

  const errorMessage = useMemo(() => {
    if (!createCommand.error) {
      return undefined;
    }

    if (createCommand.error instanceof CommandApiError) {
      return createCommand.error.correlationId
        ? `${createCommand.error.message} (${createCommand.error.code}, ${createCommand.error.correlationId})`
        : `${createCommand.error.message} (${createCommand.error.code})`;
    }

    return createCommand.error.message;
  }, [createCommand.error]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    createCommand.mutate(
      {
        conversationId,
        input: trimmedInput,
        source: "chat",
      },
      {
        onSuccess: (result) => {
          setLastResult(result);
          setConversationId(result.conversationId);
          setInput("");
        },
      },
    );
  }

  return (
    <div className="grid gap-5">
      <form
        className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-foreground" htmlFor="founder-command">
            Founder command
          </label>
          <textarea
            className="min-h-36 resize-none rounded-md border border-border bg-background px-4 py-3 text-base leading-7 text-foreground outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
            id="founder-command"
            maxLength={1_000}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tell FAIOS what to plan across your tools..."
            value={input}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">{characterCount}/1000 characters</p>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
            disabled={!canSubmit}
            type="submit"
          >
            {createCommand.isPending ? "Planning..." : "Send command"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {exampleCommands.map((example) => (
            <button
              className="rounded-full border border-border bg-background px-3 py-2 text-left text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:opacity-60"
              disabled={createCommand.isPending}
              key={example}
              onClick={() => setInput(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>

        {conversationId ? (
          <p className="mt-4 text-xs text-muted">
            Continuing conversation{" "}
            <span className="font-medium text-foreground">{conversationId}</span>
          </p>
        ) : null}
      </form>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {lastResult ? <CommandResult result={lastResult} /> : null}
    </div>
  );
}
