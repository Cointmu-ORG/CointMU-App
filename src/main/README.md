# src/main

Electron main process (Node context). One folder per domain; there is no `services/` or `utils/` catch-all.

| Folder           | What lives here                                                                                                   | What does NOT go here                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `app/`           | Entry point (`index.ts`), bootstrap order, window, session, system info, updater, app-level fs helpers            | Domain logic (geth, wallet, mining); it only wires domains together      |
| `geth/process/`  | Spawning and stopping geth: args, init, ports, IPC endpoint, network config/genesis, supervisor, watcher, orphans | Recovery decisions, RPC calls, bootnode selection                        |
| `geth/bootnode/` | Bootnode parsing, the bootnode setting, and the watcher that applies it                                           | Peer health (that is `mining/peerWatchdog`), generic network config      |
| `geth/recovery/` | Classifying geth failures, parsing its log, quarantining chaindata, recovery path guards                          | Spawning geth (call into `geth/process/`), UI dialogs                    |
| `geth/rpc/`      | Talking to the running node: JSON-RPC over HTTP and the geth IPC client                                           | Method allowlists (`security/`), domain logic built on top of RPC        |
| `store/`         | The electron-store instance, settings migrations, and their fixtures                                              | Reading or interpreting individual settings for a feature                |
| `wallet/`        | Wallet secret encryption (scrypt) and the account activity scanner                                                | New wallet IPC handlers (`ipc/walletIpc.ts`), RPC plumbing (`geth/rpc/`) |
| `mining/`        | The mining controller and the peer watchdog                                                                       | Starting or stopping geth itself (`geth/process/`)                       |
| `extension/`     | The browser-extension bridge: sync server, pairing, bridge RPC                                                    | Origin and RPC allowlist rules (`security/`)                             |
| `explorerIndex/` | The explorer block index and its worker thread (`indexWorker.ts` is a separate build entry)                       | Explorer IPC handlers (`ipc/explorerIpc.ts`)                             |
| `diagnostics/`   | Logging, error reporting, telemetry consent and transport, sanitizing                                             | Anything that changes app behaviour; diagnostics only observe            |
| `ipc/`           | `ipcMain` handlers per domain, validating input at the boundary (a few small domains register their own)          | Business logic; handlers call into the domain folders above              |
| `security/`      | Allowlists and policies: renderer/extension RPC methods, bridge origins                                           | Code that performs the guarded action                                    |
