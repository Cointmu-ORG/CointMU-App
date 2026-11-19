import type { Session } from "electron";

type Directives = Readonly<Record<string, readonly string[]>>;

/**
 * The packaged renderer: bundled scripts only, no eval. Inline styles stay
 * allowed for the dynamic `style={…}` props (sizes, gradients). Images are
 * bundled, data: URLs (custom logos, NFT images fetched by main) or blob:
 * (CSV export). All network access goes through IPC, so nothing remote.
 */
export const PRODUCTION_DIRECTIVES: Directives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'none'"],
};

/** Vite dev server: HMR socket, the React refresh inline preamble and eval-based source maps. */
const DEV_ALLOWANCES: Directives = {
  "script-src": ["'unsafe-inline'", "'unsafe-eval'", "http://localhost:*"],
  "connect-src": ["ws://localhost:*", "http://localhost:*"],
};

/**
 * @param isPackaged - app.isPackaged; dev allowances are added only when false.
 * @returns The Content-Security-Policy header value.
 */
export function buildContentSecurityPolicy(isPackaged: boolean): string {
  return Object.entries(PRODUCTION_DIRECTIVES)
    .map(([name, sources]) => {
      const extra = isPackaged ? [] : (DEV_ALLOWANCES[name] ?? []);
      return [name, ...sources, ...extra].join(" ");
    })
    .join("; ");
}

/**
 * Adds an enforcing CSP header to every response the session loads,
 * including file:// pages of the packaged build.
 * @param session - The session the app windows use.
 * @param isPackaged - app.isPackaged.
 */
export function applyContentSecurityPolicy(
  session: Session,
  isPackaged: boolean,
): void {
  const policy = buildContentSecurityPolicy(isPackaged);
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}
