import {
  JsonRpcApiProvider,
  type JsonRpcError,
  type JsonRpcPayload,
  type JsonRpcResult,
} from "ethers";

// Each request is one IPC round trip; batching would only add latency.
const SINGLE_REQUEST_BATCH = 1;

/**
 * ethers provider for the local node that sends every request through the
 * main process instead of fetching the node's HTTP endpoint directly.
 */
class NodeIpcProvider extends JsonRpcApiProvider {
  async _send(
    payload: JsonRpcPayload | Array<JsonRpcPayload>,
  ): Promise<Array<JsonRpcResult | JsonRpcError>> {
    const requests = Array.isArray(payload) ? payload : [payload];
    return Promise.all(
      requests.map(async (request) => {
        const params = Array.isArray(request.params) ? request.params : [];
        const envelope = await window.api.rpc.call(request.method, params);
        return "error" in envelope
          ? { id: request.id, error: { ...envelope.error } }
          : { id: request.id, result: envelope.result };
      }),
    );
  }
}

/**
 * Creates an ethers provider connected to the local Core-geth node.
 * @returns A provider that relays JSON-RPC through the main process.
 */
export function createNodeProvider(): JsonRpcApiProvider {
  return new NodeIpcProvider(undefined, {
    batchMaxCount: SINGLE_REQUEST_BATCH,
  });
}
