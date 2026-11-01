# CointMU Architecture & Codebase Guidelines

## 1. Core Philosophy

This project follows **canonical Feature-Sliced Design (FSD)**, not a loose approximation of it. The two ideas that make FSD actually work — and that this document enforces strictly — are:

1. **Layers have a strict, one-directional import hierarchy.** A layer may only import from layers strictly below it. Never sideways, never upward.
2. **Every slice exposes a Public API (`index.ts`) and nothing else is importable from outside.** You compose with a slice through its barrel, you never reach into its internals.

This is an **Electron desktop application**. `main`, `preload`, and `renderer` are separate processes with a hard boundary between them — `nodeIntegration: true` or direct Node access from the renderer is forbidden regardless of convenience. FSD rules below apply specifically to the `renderer` app.

## 2. Directory Structure

```text
src/
├── main/                     # Electron main process (Node context); see src/main/README.md
│   ├── app/                  # Entry point (index.ts), bootstrap, window, session, updater
│   ├── geth/                 # process/, bootnode/, recovery/, rpc/
│   ├── store/                # electron-store, settings migrations
│   ├── wallet/ mining/ extension/ explorerIndex/ diagnostics/
│   ├── ipc/                  # ipcMain handlers, grouped by domain
│   └── security/             # RPC method and bridge origin policies
│
├── preload/
│   └── preload.ts            # contextBridge exposure only, no business logic
│
├── bridge/                   # Types/channels shared between main <-> renderer
│   ├── ipc-channels.ts       # IPC channel name constants
│   └── types.ts              # Payload/response contracts
│
├── renderer/
│   ├── src/
│   │   ├── app/                       # App-wide init: providers, router, global styles
│   │   │   ├── providers/
│   │   │   ├── router/
│   │   │   ├── styles/
│   │   │   └── index.tsx
│   │   │
│   │   ├── pages/                     # Route-level compositions. THIN — no business logic.
│   │   │   └── dashboard/
│   │   │       ├── ui/
│   │   │       │   └── DashboardPage.tsx
│   │   │       └── index.ts           # Public API
│   │   │
│   │   ├── widgets/                   # Self-contained composite UI blocks (compose features + entities)
│   │   │   └── sidebar/
│   │   │       ├── ui/
│   │   │       │   └── Sidebar.tsx
│   │   │       ├── model/
│   │   │       └── index.ts
│   │   │
│   │   ├── features/                  # User actions with business value (verbs)
│   │   │   ├── send-token/
│   │   │   │   ├── ui/
│   │   │   │   │   └── SendTokenForm.tsx
│   │   │   │   ├── model/
│   │   │   │   │   └── store.ts
│   │   │   │   ├── api/
│   │   │   │   │   └── sendTokenApi.ts
│   │   │   │   ├── lib/
│   │   │   │   └── index.ts
│   │   │   └── connect-wallet/
│   │   │
│   │   ├── entities/                  # Core business nouns: data + passive display
│   │   │   ├── token/
│   │   │   │   ├── ui/
│   │   │   │   │   └── TokenCard.tsx
│   │   │   │   ├── model/
│   │   │   │   │   ├── store.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── api/
│   │   │   │   │   └── tokenApi.ts
│   │   │   │   └── index.ts
│   │   │   └── user/
│   │   │
│   │   └── shared/                    # Domain-agnostic, reusable anywhere
│   │       ├── ui/                    # Design system: Button, Modal, Input...
│   │       ├── api/                   # Base HTTP/WS client instance
│   │       ├── lib/                   # Generic helper functions
│   │       ├── config/                # Env vars, feature flags
│   │       └── constants/             # app.constants.ts etc.
│   │
│   ├── index.html
│   └── main.tsx
│
└── tests/                    # Mirrors src/ structure (see §11)
```

> **Naming note:** the top-level `bridge/` folder (main ↔ renderer contracts) is intentionally _not_ called `shared`, to avoid collision with `renderer/src/shared`, which is the FSD shared layer. Two different concepts, two different names — don't reuse "shared" for both.

## 3. The Six Layers, in Order

Top to bottom = higher-level to lower-level. Import direction only ever flows **downward**:

```
app → pages → widgets → features → entities → shared
```

| Layer      | Purpose                                                                                                 | Can import from                            |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `app`      | App-wide setup: routing, providers, global styles, entry point                                          | pages, widgets, features, entities, shared |
| `pages`    | One slice per route. Composes widgets/features/entities. **No business logic lives here.**              | widgets, features, entities, shared        |
| `widgets`  | Large, self-contained UI blocks composed from multiple features/entities (e.g. sidebar, header)         | features, entities, shared                 |
| `features` | A single user action with business value — always a verb (`send-token`, `connect-wallet`, `swap-token`) | entities, shared                           |
| `entities` | A core business noun — data model + passive display (e.g. `token`, `user`, `wallet`)                    | shared only                                |
| `shared`   | Domain-agnostic reusable code: design system, generic utils, base API client, config                    | nothing above it                           |

**A layer never imports from another slice in the same layer.** `features/send-token` must not import from `features/connect-wallet`. `entities/token` must not import from `entities/user`. If two slices in the same layer need to interact, that composition happens one layer up (a widget or page imports both and wires them together).

### `entities` vs `features` — the distinction that actually matters

This is the split most teams get wrong, so it's explicit here:

- **`entities`** = the noun and its passive representation. `entities/token` owns what a token _is_ (type, store of "current known tokens", a `TokenCard` that just displays balance/name). It does **not** know how to send, swap, or burn a token.
- **`features`** = the verb. `features/send-token` is the actual user-facing action: form, validation, calling the API/IPC, side effects. It imports `entities/token` to know the shape of a token, but the _action_ itself lives in `features`, never in `entities`.

If you're not sure which layer something belongs in, ask: "is this describing what something _is_, or what a user can _do_?" What-it-is → `entities`. What-a-user-can-do → `features`.

## 4. Segments — same set of names in every slice

Every slice, regardless of layer, uses the **same segment names**. No slice invents its own internal structure:

- `ui/` — components, view logic
- `model/` — state (Zustand stores), business logic, types
- `api/` — requests to backend/IPC/WebSocket for this slice
- `lib/` — slice-local helper functions that don't belong in `shared/lib`
- `config/` — slice-local constants/config (rare, most config is in `shared/config`)

Not every slice needs every segment — a simple `entities/user` might only have `model/` and `ui/`. But when a segment exists, it uses these names. `components/`, `hooks/`, `store/`, `services/` as segment names (as seen in earlier drafts of this doc) are **deprecated** — migrate them to the segment names above.

## 5. Public API Rule (barrel `index.ts`)

Every slice's `index.ts` is the **only** thing another slice is allowed to import. Deep-importing a file inside another slice (e.g. `import { useMiningStore } from '@/features/mining/model/store'` from outside that slice) is forbidden, even if it technically works.

- `index.ts` re-exports only what's intentionally public: the main component(s), public hooks, public types.
- Internal helpers, raw store instances, and DTOs stay unexported unless explicitly needed by consumers.
- Recommended: enforce this with lint tooling (`eslint-plugin-boundaries`, or the official `@feature-sliced/steiger` linter) instead of relying on code review alone — this is a rule that's very easy to violate accidentally as the codebase grows.

## 6. The "No Magic Numbers" Rule

- All application-wide static values live in `shared/constants/` (e.g. `app.constants.ts`).
- All slice-specific static values live in that slice's `model/` or local `config/` segment.
- Always `UPPER_SNAKE_CASE` for constant names.
- IPC channel names (`bridge/ipc-channels.ts`) and WebSocket event names count as static string keys — never inlined (see §9, §10).

## 7. Services and DTOs

- **API calls** live in each slice's `api/` segment. Components never call `fetch`, `axios`, or `window.electron.ipcRenderer` directly.
- **DTOs:** raw API/IPC responses are never passed directly into `ui/`. Map them into strict frontend types in `api/` or `model/` before they reach a component.

## 8. Security & Sensitive Data Handling

This is a wallet application. Violations here are critical bugs, not style issues.

- **Private keys, seed phrases, and mnemonics never enter the renderer's persistent storage.** They exist only transiently in `main` process memory and are wiped as soon as the operation completes.
- **Never log sensitive data** — no `console.log`, no crash reports, no error-tracking payloads containing keys, mnemonics, passwords, or signed transactions.
- **Encryption at rest** uses Node's `crypto` (AES-256-GCM) in `main`. Never `localStorage`/`sessionStorage` for sensitive data, never plaintext on disk.
- **IPC boundary discipline:** `preload` exposes a minimal, explicitly whitelisted API via `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer` wholesale.
- **Clipboard hygiene:** copied private keys/seed phrases/addresses auto-clear after a fixed timeout (e.g. 30s); UI warns the user this will happen.
- **Renderer hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` mandatory on every `BrowserWindow`. Any exception needs a code comment justifying it against this rule.

## 9. IPC Convention (Main ↔ Preload ↔ Renderer)

- Channel names live in `bridge/ipc-channels.ts`, format `domain:action` (e.g. `WALLET_CHANNELS.GET_BALANCE = 'wallet:get-balance'`). Never inline strings.
- Every `ipcMain.handle` has a matching typed wrapper in `preload`, and a typed function in the consuming slice's `api/` segment. Components call that function, never `window.electron.invoke(...)` directly.
- Payloads crossing the IPC boundary are validated (e.g. with `zod`) on the `main` side — renderer input isn't trusted even in a desktop app.

## 10. WebSocket Layer

- **Reconnection:** exponential backoff with a max retry cap, configurable via `shared/config`, never hardcoded inline.
- **Event naming:** `domain:action` format matching the IPC convention (e.g. `wallet:balance:update`), defined as constants.
- **Heartbeat:** ping/pong interval and timeout defined as constants.
- **Connection state:** exposed through a dedicated slice (e.g. `entities/connection`), not inferred ad-hoc from individual feature stores.

## 11. State Management (Zustand)

- One store per slice, in that slice's `model/` segment.
- Stores expose actions as named functions on the store — components never mutate state directly.
- `persist` middleware is allowed **only for non-sensitive UI state** (theme, last-opened tab). Anything touching wallet data goes through the `main`-process encrypted storage in §8 — never Zustand `persist` to `localStorage`.

## 12. Error Handling

- Custom error classes per domain (`WalletError`, `IpcError`) instead of raw strings or generic `Error`.
- Errors crossing the IPC boundary are serialized into a consistent shape (`{ code, message }`) — never leak raw Node error objects/stack traces to the renderer.
- UI-facing error messages are mapped from error codes in one place per slice (e.g. `features/send-token/lib/errors.ts`).

## 13. i18n / Locale Convention

- Translation keys use `domain.key` dot notation (e.g. `wallet.balance.label`).
- No hardcoded user-facing strings in `ui/` — always resolved through the locale layer.
- New keys are added to all supported locale files in the same change; a missing key in any locale blocks the build, it's not just a warning.

## 14. Testing (forward-looking convention)

Not set up yet, but new code should already follow this so adoption later doesn't require a rewrite:

- Framework: **Vitest**.
- Test files are colocated inside the segment they test: `model/store.ts` → `model/store.test.ts`.
- Priority once testing starts: (1) `main` process IPC handlers + encryption/storage — highest risk, (2) `model/` stores, (3) `api/` DTO mapping, (4) `ui/` components — lowest priority.
- No formal coverage % yet; the rule for now is "critical wallet logic and IPC handlers are not merged without a test."

## 15. Coding Standards & Conventions

- **Language:** TypeScript mandatory. `any` forbidden unless interacting with an untyped legacy external library.
- **Imports:** ES6 modules, absolute paths (`@/features/send-token`) over relative (`../../features/send-token`).
- **Documentation:** English JSDoc at function/interface/class level. Avoid inline comments — write self-documenting code.
- **File naming inside a slice's segment:** name by _responsibility_, not by repeating the domain — the slice folder already gives that context. `model/store.ts`, `model/selectors.ts`, `ui/SendTokenForm.tsx`, `api/sendTokenApi.ts`. If a segment has multiple files of the same kind, disambiguate by purpose, not domain: `model/sessionStore.ts` + `model/settingsStore.ts`, not `auth.store.ts` + `auth.store2.ts`.
- **File naming inside `shared/`:** since there's no enclosing slice folder to provide context here, keep the domain prefix: `app.constants.ts`, `date.utils.ts`.
- **Variable/function naming:** camelCase.
- **Class/interface naming:** PascalCase.
- **Linting/formatting:** ESLint + Prettier config in the repo root is the source of truth. Strongly recommended: add `eslint-plugin-boundaries` or `steiger` to actually enforce the import hierarchy in §3 and the Public API rule in §5 — without tooling, these two rules erode quietly as the codebase grows.
