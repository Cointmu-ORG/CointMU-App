/**
 * Decides which geth JSON-RPC methods each caller may reach. The HTTP endpoint
 * only serves the public namespaces; node-control namespaces travel over the
 * private IPC socket and only the app itself may use them.
 */

const PUBLIC_NAMESPACE_PREFIXES = ["eth_", "net_", "web3_"] as const;
const PRIVILEGED_NAMESPACE_PREFIXES = ["admin_", "miner_"] as const;

/** Methods that ask the node to sign. The app signs locally with ethers. */
const SIGNING_METHODS: ReadonlySet<string> = new Set([
  "eth_sign",
  "eth_signTransaction",
  "eth_sendTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "personal_sign",
]);

/** Node-control methods the renderer drives from the mining screen. */
const RENDERER_NODE_CONTROL_METHODS: ReadonlySet<string> = new Set([
  "miner_setEtherbase",
  "miner_start",
  "miner_stop",
]);

/** The geth HTTP API list; must match isPublicReadMethod. */
export const GETH_HTTP_API_NAMESPACES = "eth,net,web3";

function hasPrefix(method: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => method.startsWith(prefix));
}

/**
 * @param method - A JSON-RPC method name.
 * @returns True for a public-namespace method that does not sign.
 */
export function isPublicReadMethod(method: string): boolean {
  return (
    hasPrefix(method, PUBLIC_NAMESPACE_PREFIXES) && !SIGNING_METHODS.has(method)
  );
}

/**
 * @param method - A JSON-RPC method name.
 * @returns True when the method asks the node to sign.
 */
export function isSigningMethod(method: string): boolean {
  return SIGNING_METHODS.has(method);
}

/**
 * @param method - A JSON-RPC method name.
 * @returns True when the method must go over the private IPC socket.
 */
export function isPrivilegedNodeMethod(method: string): boolean {
  return hasPrefix(method, PRIVILEGED_NAMESPACE_PREFIXES);
}

/**
 * @param method - A JSON-RPC method name requested by the renderer.
 * @returns True when the renderer may forward it to the node.
 */
export function isRendererRpcAllowed(method: string): boolean {
  return (
    isPublicReadMethod(method) || RENDERER_NODE_CONTROL_METHODS.has(method)
  );
}

/**
 * @param method - A JSON-RPC method name requested through the extension bridge.
 * @returns True when the bridge may forward it to the node.
 */
export function isBridgeRpcAllowed(method: string): boolean {
  return isPublicReadMethod(method);
}
