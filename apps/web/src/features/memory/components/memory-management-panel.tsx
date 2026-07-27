"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  useDeleteMemoryItem,
  useExportMemoryItems,
  useMemoryItems,
  useUpdateMemoryItem,
} from "../hooks/use-memory-items";
import { MemoryApiError, type MemoryItem, type MemoryKind } from "../types/memory";

const memoryKindOptions: ReadonlyArray<{ label: string; value: MemoryKind }> = [
  { label: "Founder profile", value: "founder_profile" },
  { label: "Company fact", value: "company_fact" },
  { label: "Preference", value: "preference" },
  { label: "Decision", value: "decision" },
  { label: "Contact", value: "contact" },
  { label: "Workflow", value: "workflow_pattern" },
  { label: "Summary", value: "summary" },
];

function formatError(error: Error) {
  if (error instanceof MemoryApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

function formatKind(kind: MemoryKind) {
  return memoryKindOptions.find((option) => option.value === kind)?.label ?? kind;
}

function downloadMemoryExport(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `faios-memory-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MemoryManagementPanel() {
  const memories = useMemoryItems();
  const updateMemory = useUpdateMemoryItem();
  const deleteMemory = useDeleteMemoryItem();
  const exportMemory = useExportMemoryItems();
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("company_fact");

  const errorMessage = useMemo(() => {
    if (memories.error) {
      return formatError(memories.error);
    }

    if (updateMemory.error) {
      return formatError(updateMemory.error);
    }

    if (deleteMemory.error) {
      return formatError(deleteMemory.error);
    }

    if (exportMemory.error) {
      return formatError(exportMemory.error);
    }

    return undefined;
  }, [deleteMemory.error, exportMemory.error, memories.error, updateMemory.error]);

  function startEditing(memory: MemoryItem) {
    setEditingMemoryId(memory.id);
    setContent(memory.content);
    setKind(memory.kind);
  }

  function stopEditing() {
    setEditingMemoryId(null);
    setContent("");
    setKind("company_fact");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingMemoryId) {
      return;
    }

    updateMemory.mutate(
      {
        memoryId: editingMemoryId,
        patch: {
          content: content.trim(),
          kind,
        },
      },
      {
        onSuccess: stopEditing,
      },
    );
  }

  async function handleExport() {
    const payload = await exportMemory.mutateAsync();
    downloadMemoryExport(payload);
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Memory</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Founder context</h2>
        </div>
        <button
          className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exportMemory.isPending || (memories.data?.memories.length ?? 0) === 0}
          onClick={() => void handleExport()}
          type="button"
        >
          {exportMemory.isPending ? "Exporting..." : "Export"}
        </button>
      </div>

      {editingMemoryId ? (
        <form className="mt-4 grid gap-3 border-t border-border pt-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Type
            <select
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setKind(event.target.value as MemoryKind)}
              value={kind}
            >
              {memoryKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Context
            <textarea
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setContent(event.target.value)}
              value={content}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted"
              disabled={updateMemory.isPending || content.trim().length === 0}
              type="submit"
            >
              {updateMemory.isPending ? "Saving..." : "Save"}
            </button>
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              onClick={stopEditing}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 grid gap-3">
        {(memories.data?.memories ?? []).map((memory) => (
          <article className="rounded-md border border-border bg-background p-3" key={memory.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {formatKind(memory.kind)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {memory.content}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Updated {new Date(memory.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={updateMemory.isPending || deleteMemory.isPending}
                  onClick={() => startEditing(memory)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={deleteMemory.isPending}
                  onClick={() => deleteMemory.mutate(memory.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {memories.isLoading ? <p className="mt-4 text-sm text-muted">Loading memory...</p> : null}

      {!memories.isLoading && (memories.data?.memories.length ?? 0) === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted">
          No saved memory yet.
        </p>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
