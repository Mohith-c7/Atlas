import Fastify from "fastify";
import type {
  ArchiveMemoryItemResponse,
  DeleteMemoryItemResponse,
  ExportMemoryItemsResponse,
  ImportMemoryItemsResponse,
  ListMemoryItemsResponse,
  MergeMemoryItemsResponse,
  PurgeExpiredMemoryItemsResponse,
  SearchMemoryResponse,
  UpdateMemoryItemResponse,
} from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { memoryRoutes } from "../features/memory/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

async function createFounderWithSession(input: {
  founderId: string;
  token: string;
  displayName: string;
}) {
  await database.founderAccount.create({
    data: {
      id: input.founderId,
      email: `${input.founderId}@faios.local`,
      displayName: input.displayName,
      sessions: {
        create: {
          tokenHash: hashSessionToken(input.token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          userAgent: `${input.founderId}-browser`,
        },
      },
    },
  });
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderAId = `memory_a_${suffix}`;
  const founderBId = `memory_b_${suffix}`;
  const founderAToken = `faios_memory_a_${suffix}`;
  const founderBToken = `faios_memory_b_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(memoryRoutes);

  try {
    await createFounderWithSession({
      founderId: founderAId,
      token: founderAToken,
      displayName: "Memory Founder A",
    });
    await createFounderWithSession({
      founderId: founderBId,
      token: founderBToken,
      displayName: "Memory Founder B",
    });

    const founderAMemory = await database.memoryItem.create({
      data: {
        founderId: founderAId,
        kind: "COMPANY_FACT",
        content: "Company is: Atlas AI",
        source: "command",
        confidence: 0.86,
        vectorRef: "qdrant-private-ref",
        metadata: {
          internal: "not exported",
        },
      },
    });

    await database.memoryItem.create({
      data: {
        founderId: founderBId,
        kind: "DECISION",
        content: "Decision: ship private beta",
        source: "command",
        confidence: 0.82,
      },
    });

    const founderAExpiredDeletedMemory = await database.memoryItem.create({
      data: {
        founderId: founderAId,
        kind: "SUMMARY",
        content: "Old retained summary.",
        source: "command",
        confidence: 0.61,
        deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        retainUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const founderBExpiredDeletedMemory = await database.memoryItem.create({
      data: {
        founderId: founderBId,
        kind: "SUMMARY",
        content: "Other founder old retained summary.",
        source: "command",
        confidence: 0.61,
        deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        retainUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const duplicateMemory = await database.memoryItem.create({
      data: {
        founderId: founderAId,
        kind: "COMPANY_FACT",
        content: "Atlas AI targets solo founders.",
        source: "command",
        confidence: 0.77,
      },
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/v1/memory/items",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (listResponse.statusCode !== 200) {
      throw new Error(`Expected memory list 200, received ${listResponse.statusCode}.`);
    }

    const listPayload: ListMemoryItemsResponse = listResponse.json();

    if (listPayload.memories.length !== 2) {
      throw new Error(`Expected two active memory items, received ${listPayload.memories.length}.`);
    }

    if (!listPayload.memories.some((memory) => memory.id === founderAMemory.id)) {
      throw new Error("Memory list returned the wrong founder scope.");
    }

    if (listPayload.memories.some((memory) => memory.id === founderAExpiredDeletedMemory.id)) {
      throw new Error("Memory list returned a deleted retained item.");
    }

    const serializedListPayload = JSON.stringify(listPayload);

    if (
      serializedListPayload.includes("qdrant-private-ref") ||
      serializedListPayload.includes("internal")
    ) {
      throw new Error("Memory list leaked internal vector or metadata fields.");
    }

    const searchResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/search",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        query: "solo founders atlas",
        limit: 5,
      },
    });

    if (searchResponse.statusCode !== 200) {
      throw new Error(`Expected memory search 200, received ${searchResponse.statusCode}.`);
    }

    const searchPayload: SearchMemoryResponse = searchResponse.json();

    if (!searchPayload.matches.some((match) => match.memory.id === duplicateMemory.id)) {
      throw new Error("Memory search did not return founder-scoped semantic matches.");
    }

    if (searchPayload.matches.some((match) => match.memory.content.includes("private beta"))) {
      throw new Error("Memory search leaked another founder's memory.");
    }

    const crossFounderDeleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/v1/memory/items/${founderAMemory.id}`,
      headers: {
        authorization: `Bearer ${founderBToken}`,
      },
    });

    if (crossFounderDeleteResponse.statusCode !== 404) {
      throw new Error(
        `Expected cross-founder memory delete 404, received ${crossFounderDeleteResponse.statusCode}.`,
      );
    }

    const updateResponse = await server.inject({
      method: "PATCH",
      url: `/api/v1/memory/items/${founderAMemory.id}`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        kind: "preference",
        content: "Founder prefers using token sk-live-secret in demos.",
      },
    });

    if (updateResponse.statusCode !== 200) {
      throw new Error(`Expected memory update 200, received ${updateResponse.statusCode}.`);
    }

    const updatePayload: UpdateMemoryItemResponse = updateResponse.json();

    if (updatePayload.memory.kind !== "preference") {
      throw new Error("Memory kind was not updated.");
    }

    if (updatePayload.memory.content.includes("sk-live-secret")) {
      throw new Error("Memory update stored unredacted sensitive content.");
    }

    const mergeResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/merge",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        primaryMemoryId: founderAMemory.id,
        duplicateMemoryIds: [duplicateMemory.id],
        content: "Atlas AI helps solo founders coordinate startup operations.",
      },
    });

    if (mergeResponse.statusCode !== 200) {
      throw new Error(`Expected memory merge 200, received ${mergeResponse.statusCode}.`);
    }

    const mergePayload: MergeMemoryItemsResponse = mergeResponse.json();

    if (
      mergePayload.memory.id !== founderAMemory.id ||
      !mergePayload.mergedMemoryIds.includes(duplicateMemory.id)
    ) {
      throw new Error("Memory merge returned the wrong primary or duplicate ids.");
    }

    const deletedDuplicate = await database.memoryItem.findUnique({
      where: {
        id: duplicateMemory.id,
      },
    });

    if (deletedDuplicate) {
      throw new Error("Memory merge did not remove the duplicate memory item.");
    }

    const archiveCandidate = await database.memoryItem.create({
      data: {
        founderId: founderAId,
        kind: "PREFERENCE",
        content: "Founder prefers weekly investor updates.",
        source: "command",
        confidence: 0.79,
      },
    });

    const archiveResponse = await server.inject({
      method: "POST",
      url: `/api/v1/memory/items/${archiveCandidate.id}/archive`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        archived: true,
      },
    });

    if (archiveResponse.statusCode !== 200) {
      throw new Error(`Expected memory archive 200, received ${archiveResponse.statusCode}.`);
    }

    const archivePayload: ArchiveMemoryItemResponse = archiveResponse.json();

    if (!archivePayload.memory.archivedAt) {
      throw new Error("Memory archive response did not include archivedAt.");
    }

    const listAfterArchiveResponse = await server.inject({
      method: "GET",
      url: "/api/v1/memory/items",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });
    const listAfterArchivePayload: ListMemoryItemsResponse = listAfterArchiveResponse.json();

    if (listAfterArchivePayload.memories.some((memory) => memory.id === archiveCandidate.id)) {
      throw new Error("Archived memory item remained in the active list.");
    }

    const exportResponse = await server.inject({
      method: "GET",
      url: "/api/v1/memory/export",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (exportResponse.statusCode !== 200) {
      throw new Error(`Expected memory export 200, received ${exportResponse.statusCode}.`);
    }

    const exportPayload: ExportMemoryItemsResponse = exportResponse.json();

    if (!exportPayload.exportedAt || exportPayload.memories.length !== 1) {
      throw new Error("Memory export response was incomplete.");
    }

    const invalidImportResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/import",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        memories: [],
      },
    });

    if (invalidImportResponse.statusCode !== 400) {
      throw new Error(
        `Expected invalid memory import 400, received ${invalidImportResponse.statusCode}.`,
      );
    }

    const appendImportResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/import",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        mode: "append",
        memories: [
          {
            kind: "company_fact",
            content: "Company stage is seed.",
            source: "restored_export",
            confidence: 0.78,
          },
          {
            kind: "preference",
            content: "Founder token is sk-live-imported-secret.",
            source: "restored_export",
          },
        ],
      },
    });

    if (appendImportResponse.statusCode !== 200) {
      throw new Error(
        `Expected memory append import 200, received ${appendImportResponse.statusCode}.`,
      );
    }

    const appendImportPayload: ImportMemoryItemsResponse = appendImportResponse.json();

    if (
      appendImportPayload.importedCount !== 2 ||
      appendImportPayload.replacedExistingCount !== 0
    ) {
      throw new Error("Memory append import returned incorrect counters.");
    }

    if (JSON.stringify(appendImportPayload).includes("sk-live-imported-secret")) {
      throw new Error("Memory import stored unredacted sensitive content.");
    }

    const replaceImportResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/import",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        mode: "replace",
        memories: exportPayload.memories,
      },
    });

    if (replaceImportResponse.statusCode !== 200) {
      throw new Error(
        `Expected memory replace import 200, received ${replaceImportResponse.statusCode}.`,
      );
    }

    const replaceImportPayload: ImportMemoryItemsResponse = replaceImportResponse.json();

    if (
      replaceImportPayload.importedCount !== 1 ||
      replaceImportPayload.replacedExistingCount !== 3
    ) {
      throw new Error("Memory replace import returned incorrect counters.");
    }

    const founderBMemoryCount = await database.memoryItem.count({
      where: {
        founderId: founderBId,
        deletedAt: null,
      },
    });

    if (founderBMemoryCount !== 1) {
      throw new Error("Memory replace import affected another founder scope.");
    }

    const restoredMemoryId = replaceImportPayload.memories[0]?.id;

    if (!restoredMemoryId || restoredMemoryId === founderAMemory.id) {
      throw new Error("Memory restore did not create a fresh founder-scoped item.");
    }

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/v1/memory/items/${restoredMemoryId}`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (deleteResponse.statusCode !== 200) {
      throw new Error(`Expected memory delete 200, received ${deleteResponse.statusCode}.`);
    }

    const deletePayload: DeleteMemoryItemResponse = deleteResponse.json();

    if (deletePayload.deletedMemoryId !== restoredMemoryId) {
      throw new Error("Memory delete returned the wrong id.");
    }

    if (!deletePayload.retainUntil) {
      throw new Error("Memory delete did not return a retention timestamp.");
    }

    const deletedMemory = await database.memoryItem.findUnique({
      where: {
        id: restoredMemoryId,
      },
    });

    if (!deletedMemory?.deletedAt || !deletedMemory.retainUntil) {
      throw new Error("Expected memory item to be soft deleted with retention metadata.");
    }

    const purgeResponse = await server.inject({
      method: "POST",
      url: "/api/v1/memory/retention/purge",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (purgeResponse.statusCode !== 200) {
      throw new Error(`Expected memory retention purge 200, received ${purgeResponse.statusCode}.`);
    }

    const purgePayload: PurgeExpiredMemoryItemsResponse = purgeResponse.json();

    if (
      purgePayload.purgedCount !== 1 ||
      purgePayload.purgedMemoryIds[0] !== founderAExpiredDeletedMemory.id
    ) {
      throw new Error("Memory retention purge returned the wrong founder-scoped records.");
    }

    const purgedMemory = await database.memoryItem.findUnique({
      where: {
        id: founderAExpiredDeletedMemory.id,
      },
    });

    const otherFounderRetainedMemory = await database.memoryItem.findUnique({
      where: {
        id: founderBExpiredDeletedMemory.id,
      },
    });

    if (purgedMemory || !otherFounderRetainedMemory) {
      throw new Error("Memory retention purge did not respect founder boundaries.");
    }
  } finally {
    if (previousAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = previousAppEnv;
    }

    if (previousDevAuthEnabled === undefined) {
      delete process.env.FAIOS_DEV_AUTH_ENABLED;
    } else {
      process.env.FAIOS_DEV_AUTH_ENABLED = previousDevAuthEnabled;
    }

    await server.close();
    await database.founderAccount
      .delete({
        where: {
          id: founderAId,
        },
      })
      .catch(() => undefined);
    await database.founderAccount
      .delete({
        where: {
          id: founderBId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
