import { createConnection } from "node:net";
import type { JsonRpcEnvelope } from "../../../bridge/types";

const JSON_RPC_VERSION = "2.0";
const JSON_RPC_INTERNAL_ERROR = -32603;
const LINE_SEPARATOR = "\n";

let nextRequestId = 1;

/**
 * Splits buffered IPC output into complete lines; geth ends every JSON
 * message with a newline.
 * @param buffer - Text received so far.
 * @returns The complete non-empty lines and the unfinished remainder.
 */
export function splitJsonLines(buffer: string): {
  lines: string[];
  rest: string;
} {
  const parts = buffer.split(LINE_SEPARATOR);
  const rest = parts.pop() ?? "";
  const lines = parts.map((line) => line.trim()).filter((line) => line !== "");
  return { lines, rest };
}

/**
 * @param message - What went wrong.
 * @returns A JSON-RPC internal-error envelope.
 */
export function internalErrorEnvelope(message: string): JsonRpcEnvelope {
  return { error: { code: JSON_RPC_INTERNAL_ERROR, message } };
}

/**
 * Converts one line of geth output into an envelope for the given request.
 * @param line - One JSON line.
 * @param requestId - The id of the pending request.
 * @returns The envelope, or null when the line answers a different id.
 */
export function parseResponseLine(
  line: string,
  requestId: number,
): JsonRpcEnvelope | null {
  let message: { id?: unknown; result?: unknown; error?: unknown };
  try {
    message = JSON.parse(line);
  } catch {
    return internalErrorEnvelope("geth IPC returned malformed JSON");
  }
  if (message.id !== requestId) return null;
  if (message.error && typeof message.error === "object") {
    const error = message.error as { code?: unknown; message?: unknown };
    return {
      error: {
        code:
          typeof error.code === "number" ? error.code : JSON_RPC_INTERNAL_ERROR,
        message:
          typeof error.message === "string" ? error.message : "geth IPC error",
        ...("data" in error ? { data: (error as { data: unknown }).data } : {}),
      },
    };
  }
  return { result: message.result ?? null };
}

/**
 * Sends one JSON-RPC request over the geth IPC socket (unix socket or Windows
 * named pipe) on a short-lived connection. Never rejects: transport failures
 * come back as an internal-error envelope.
 * @param socketPath - The geth --ipcpath endpoint.
 * @param method - The JSON-RPC method.
 * @param params - The positional parameters.
 * @param timeoutMs - Deadline for the whole exchange.
 * @returns The node's result or error.
 */
export function callGethIpc(
  socketPath: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<JsonRpcEnvelope> {
  const id = nextRequestId++;
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let buffer = "";
    let isSettled = false;

    const finish = (envelope: JsonRpcEnvelope): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(envelope);
    };

    const timer = setTimeout(
      () => finish(internalErrorEnvelope(`geth IPC ${method} timed out`)),
      timeoutMs,
    );

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      const request = { jsonrpc: JSON_RPC_VERSION, id, method, params };
      socket.write(JSON.stringify(request) + LINE_SEPARATOR);
    });
    socket.on("data", (chunk: string) => {
      const { lines, rest } = splitJsonLines(buffer + chunk);
      buffer = rest;
      for (const line of lines) {
        const envelope = parseResponseLine(line, id);
        if (envelope) return finish(envelope);
      }
    });
    socket.on("error", (err) =>
      finish(internalErrorEnvelope(`geth IPC unreachable: ${err.message}`)),
    );
    socket.on("close", () =>
      finish(internalErrorEnvelope("geth IPC closed before responding")),
    );
  });
}
