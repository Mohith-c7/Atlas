"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { normalizeMemoryImportPayload } from "../api/memory-api";
import {
  useArchiveMemoryItem,
  useDeleteMemoryItem,
  useExportMemoryItems,
  useImportMemoryItems,
  useMergeMemoryItems,
  useMemoryItems,
  useSearchMemoryItems,
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
  const archiveMemory = useArchiveMemoryItem();
  const deleteMemory = useDeleteMemoryItem();
  const exportMemory = useExportMemoryItems();
  const importMemory = useImportMemoryItems();
  const searchMemory = useSearchMemoryItems();
  const mergeMemory = useMergeMemoryItems();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [primaryMergeId, setPrimaryMergeId] = useState<string | null>(null);
  const [duplicateMergeIds, setDuplicateMergeIds] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("company_fact");
  const [searchQuery, setSearchQuery] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);

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

    if (archiveMemory.error) {
      return formatError(archiveMemory.error);
    }

    if (exportMemory.error) {
      return formatError(exportMemory.error);
    }

    if (importMemory.error) {
      return formatError(importMemory.error);
    }

    if (importParseError) {
      return importParseError;
    }

    if (searchMemory.error) {
      return formatError(searchMemory.error);
    }

    if (mergeMemory.error) {
      return formatError(mergeMemory.error);
    }

    return undefined;
  }, [
    archiveMemory.error,
    deleteMemory.error,
    exportMemory.error,
    importMemory.error,
    importParseError,
    memories.error,
    mergeMemory.error,
    searchMemory.error,
    updateMemory.error,
  ]);

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

  function toggleDuplicateMergeId(memoryId: string) {
    setDuplicateMergeIds((currentIds) =>
      currentIds.includes(memoryId)
        ? currentIds.filter((currentId) => currentId !== memoryId)
        : [...currentIds, memoryId],
    );
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

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setImportMessage(null);
    setImportParseError(null);

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const importRequest = normalizeMemoryImportPayload(payload);

      if (!importRequest) {
        setImportParseError("Memory import file did not contain any valid memory items.");
        return;
      }

      const response = await importMemory.mutateAsync(importRequest);
      setImportMessage(`Imported ${response.importedCount} memory item(s).`);
    } catch (error) {
      setImportParseError(error instanceof Error ? error.message : "Unable to read import file.");
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (searchQuery.trim().length < 2) {
      return;
    }

    searchMemory.mutate({
      query: searchQuery.trim(),
      limit: 8,
    });
  }

  function handleMerge() {
    if (!primaryMergeId || duplicateMergeIds.length === 0) {
      return;
    }

    mergeMemory.mutate(
      {
        primaryMemoryId: primaryMergeId,
        duplicateMemoryIds: duplicateMergeIds,
      },
      {
        onSuccess: () => {
          setPrimaryMergeId(null);
          setDuplicateMergeIds([]);
        },
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Memory</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Founder context</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
            ref={importInputRef}
            type="file"
          />
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={importMemory.isPending}
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            {importMemory.isPending ? "Importing..." : "Import"}
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={exportMemory.isPending || (memories.data?.memories.length ?? 0) === 0}
            onClick={() => void handleExport()}
            type="button"
          >
            {exportMemory.isPending ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>

      {importMessage ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {importMessage}
        </div>
      ) : null}

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

      <form className="mt-4 grid gap-2 border-t border-border pt-4" onSubmit={handleSearch}>
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Semantic search
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="min-h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find related founder context"
              value={searchQuery}
            />
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={searchMemory.isPending || searchQuery.trim().length < 2}
              type="submit"
            >
              {searchMemory.isPending ? "Searching..." : "Search"}
            </button>
          </div>
        </label>
      </form>

      {(searchMemory.data?.matches.length ?? 0) > 0 ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Search matches</p>
            <button
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted"
              disabled={!primaryMergeId || duplicateMergeIds.length === 0 || mergeMemory.isPending}
              onClick={handleMerge}
              type="button"
            >
              {mergeMemory.isPending ? "Merging..." : "Merge selected"}
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {searchMemory.data?.matches.map((match) => (
              <div className="rounded-md border border-border bg-white p-3" key={match.memory.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {Math.round(match.score * 100)}% match
                    </p>
                    <p className="mt-1 text-sm leading-6 text-foreground">{match.memory.content}</p>
                    <p className="mt-1 text-xs text-muted">{match.matchReason}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
                      onClick={() => setPrimaryMergeId(match.memory.id)}
                      type="button"
                    >
                      {primaryMergeId === match.memory.id ? "Primary" : "Use primary"}
                    </button>
                    <button
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={primaryMergeId === match.memory.id}
                      onClick={() => toggleDuplicateMergeId(match.memory.id)}
                      type="button"
                    >
                      {duplicateMergeIds.includes(match.memory.id) ? "Duplicate" : "Duplicate"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                  disabled={
                    updateMemory.isPending || archiveMemory.isPending || deleteMemory.isPending
                  }
                  onClick={() => startEditing(memory)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={archiveMemory.isPending || deleteMemory.isPending}
                  onClick={() => archiveMemory.mutate(memory.id)}
                  type="button"
                >
                  Archive
                </button>
                <button
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={archiveMemory.isPending || deleteMemory.isPending}
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
