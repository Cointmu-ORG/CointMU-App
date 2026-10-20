/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Error reporting DSN baked in at build time; empty disables reporting. */
  readonly MAIN_VITE_TELEMETRY_DSN?: string;
  /** Comma-separated base64 SHA-256 SPKI pins of the collector certificate. */
  readonly MAIN_VITE_TELEMETRY_PINS?: string;
  /** Bootnode enode baked in at build time; empty uses the built-in one. */
  readonly MAIN_VITE_BOOTNODE_ENODE?: string;
}
