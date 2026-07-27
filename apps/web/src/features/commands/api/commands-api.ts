import {
  CommandApiError,
  type ApiErrorResponse,
  type CreateCommandRequest,
  type CreateCommandResponse,
} from "../types/command";
import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";

const COMMANDS_ENDPOINT = `${businessApiUrl}/api/v1/commands`;

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeError = value as Partial<ApiErrorResponse>;
  return typeof maybeError.code === "string" && typeof maybeError.message === "string";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function createCommand(request: CreateCommandRequest): Promise<CreateCommandResponse> {
  const response = await apiFetch(COMMANDS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new CommandApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new CommandApiError({
      code: "COMMAND_REQUEST_FAILED",
      message: "Unable to send this command. Please try again.",
      statusCode: response.status,
    });
  }

  return payload as CreateCommandResponse;
}
