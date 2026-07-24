import {
  CommandApiError,
  type ApiErrorResponse,
  type CreateCommandRequest,
  type CreateCommandResponse,
} from "../types/command";

const BUSINESS_API_URL =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
const COMMANDS_ENDPOINT = `${BUSINESS_API_URL}/api/v1/commands`;

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `corr_${crypto.randomUUID()}`;
  }

  return `corr_${Date.now().toString(36)}`;
}

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
  const correlationId = createCorrelationId();
  const response = await fetch(COMMANDS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId,
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
