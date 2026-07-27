import Fastify from "fastify";
import type {
  DeleteMemoryItemResponse,
  ExportMemoryItemsResponse,
  ListMemoryItemsResponse,
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

    if (listPayload.memories.length !== 1 || listPayload.memories[0]?.id !== founderAMemory.id) {
      throw new Error("Memory list returned the wrong founder scope.");
    }

    const serializedListPayload = JSON.stringify(listPayload);

    if (
      serializedListPayload.includes("qdrant-private-ref") ||
      serializedListPayload.includes("internal")
    ) {
      throw new Error("Memory list leaked internal vector or metadata fields.");
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

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/v1/memory/items/${founderAMemory.id}`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (deleteResponse.statusCode !== 200) {
      throw new Error(`Expected memory delete 200, received ${deleteResponse.statusCode}.`);
    }

    const deletePayload: DeleteMemoryItemResponse = deleteResponse.json();

    if (deletePayload.deletedMemoryId !== founderAMemory.id) {
      throw new Error("Memory delete returned the wrong id.");
    }

    const deletedMemory = await database.memoryItem.findUnique({
      where: {
        id: founderAMemory.id,
      },
    });

    if (deletedMemory) {
      throw new Error("Expected memory item to be deleted.");
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
