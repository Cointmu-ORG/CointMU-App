const LOCALE_DEFAULT = "en-US";
const PORT_DISPLAY_PREFIX = ":";
const PEER_SINGULAR = "peer";
const PEER_PLURAL = "peers";

/**
 * Formats a block number into a locale-aware string with thousands separators.
 * @param {any} blockNumber - The raw block number, or null if unavailable.
 * @returns {any} A formatted string representation of the block number.
 */
function formatBlockNumber(blockNumber: number | null): string {
  if (blockNumber === null) {
    return "--";
  }
  return blockNumber.toLocaleString(LOCALE_DEFAULT);
}

/**
 * Formats an RPC port number into a display string with prefix colon.
 * @param {any} port - The port number, or null if not yet resolved.
 * @returns {any} A formatted port display string.
 */
function formatPortDisplay(port: number | null): string {
  if (port === null) {
    return "--";
  }
  return `${PORT_DISPLAY_PREFIX}${port}`;
}

/**
 * Formats a peer count with the correct singular or plural label.
 * @param {any} count - The number of connected peers, or null if unavailable.
 * @returns {any} A formatted peer count string.
 */
function formatPeerCount(count: number | null): string {
  if (count === null) {
    return "--";
  }
  const label = count === 1 ? PEER_SINGULAR : PEER_PLURAL;
  return `${count} ${label}`;
}

/**
 * Formats a chain ID bigint into a human-readable decimal string.
 * @param {any} chainId - The chain ID as a bigint, or null if unavailable.
 * @returns {any} A string representation of the chain ID.
 */
function formatChainId(chainId: bigint | null): string {
  if (chainId === null) {
    return "--";
  }
  return chainId.toString();
}

/**
 * Formats a timestamp into a locale-aware time string.
 * @param {any} timestamp - Unix timestamp in milliseconds, or null.
 * @returns {any} A formatted time string (HH:MM:SS).
 */
function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) {
    return "--:--:--";
  }
  return new Date(timestamp).toLocaleTimeString(LOCALE_DEFAULT);
}

const HASHRATE_UNIT_THRESHOLD = 1000;
const HASHRATE_DECIMAL_PLACES = 2;
const HASHRATE_UNITS = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s"];

/**
 * Formats a raw hashrate value into a human-readable string with automatic
 * unit scaling from H/s through TH/s.
 * @param {any} hashrate - The raw hashrate in hashes per second, or null if unavailable.
 * @returns {any} A formatted hashrate string with the appropriate unit suffix.
 */
function formatHashrate(hashrate: number | null): string {
  if (hashrate === null || hashrate === 0) {
    return "0 H/s";
  }

  let scaled = hashrate;
  let unitIndex = 0;

  while (
    scaled >= HASHRATE_UNIT_THRESHOLD &&
    unitIndex < HASHRATE_UNITS.length - 1
  ) {
    scaled = scaled / HASHRATE_UNIT_THRESHOLD;
    unitIndex++;
  }

  const formatted =
    unitIndex === 0
      ? scaled.toString()
      : scaled.toFixed(HASHRATE_DECIMAL_PLACES);

  return `${formatted} ${HASHRATE_UNITS[unitIndex]}`;
}

const DIFFICULTY_UNITS = ["", "K", "M", "G", "T", "P"];
const DIFFICULTY_THRESHOLD = 1000;
const DIFFICULTY_DECIMAL_PLACES = 1;

/**
 * Formats a raw difficulty value into a human-readable string with automatic
 * unit scaling from raw through P (peta).
 * @param {any} difficulty - The raw difficulty integer, or null if unavailable.
 * @returns {any} A formatted difficulty string with the appropriate unit suffix.
 */
function formatDifficulty(difficulty: number | null): string {
  if (difficulty === null || difficulty === 0) {
    return "--";
  }

  let scaled = difficulty;
  let unitIndex = 0;

  while (
    scaled >= DIFFICULTY_THRESHOLD &&
    unitIndex < DIFFICULTY_UNITS.length - 1
  ) {
    scaled = scaled / DIFFICULTY_THRESHOLD;
    unitIndex++;
  }

  const formatted =
    unitIndex === 0
      ? scaled.toString()
      : scaled.toFixed(DIFFICULTY_DECIMAL_PLACES);

  return `${formatted}${DIFFICULTY_UNITS[unitIndex]}`;
}

const MHS_DECIMAL_PLACES = 2;

/**
 * Formats a hashrate already expressed in megahashes per second into a fixed
 * two-decimal string suitable for direct display.
 * @param {any} megahashes - The hashrate in MH/s.
 * @returns {any} The formatted value such as '2.50', or '0.00' when not positive.
 */
function formatMhs(megahashes: number): string {
  if (!Number.isFinite(megahashes) || megahashes <= 0) {
    return "0.00";
  }
  return megahashes.toFixed(MHS_DECIMAL_PLACES);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const BYTES_PER_UNIT = 1024;
const BYTE_DECIMAL_PLACES = 2;

/**
 * Formats a byte count into a compact size string.
 * @param bytes - The number of bytes.
 * @returns The size, e.g. '4.82 GB'; '0 B' for zero or less.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / Math.pow(BYTES_PER_UNIT, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : BYTE_DECIMAL_PLACES)} ${BYTE_UNITS[exponent]}`;
}

export {
  formatBytes,
  formatBlockNumber,
  formatPortDisplay,
  formatPeerCount,
  formatChainId,
  formatTimestamp,
  formatHashrate,
  formatDifficulty,
  formatMhs,
};
