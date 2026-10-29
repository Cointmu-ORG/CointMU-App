# CointMU Desktop Client

CointMU Desktop Client is a robust Proof of Work blockchain node bundled within a secure and high-performance Electron application. It provides users with an integrated dashboard for monitoring node metrics, controlling the miner, and interacting with the CointMU network seamlessly.

It runs on Windows, Linux, and macOS.

## Quick Start

### Prerequisites

- Node.js 24 (pinned in `.nvmrc`)
- npm 12, the exact version pinned in `package.json` `packageManager` and activated through Corepack (Node 24 bundles npm 11, which the project rejects)
- Git
- A `geth` binary placed in the `resources/bin/` directory (`geth.exe` on Windows, `geth` on Linux and macOS)

### Installation (from source)

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/Cointmu-ORG/CointMU-App.git
   cd CointMU-App
   ```
2. Place the platform-appropriate `geth` binary in `resources/bin/`. On Linux and macOS, make it executable:
   ```bash
   chmod +x resources/bin/geth
   ```
3. Configure your environment variables in `.env` based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Switch to Node 24, let Corepack provide the pinned npm, and install dependencies:
   ```bash
   nvm use 24
   corepack enable npm   # after nvm use, so the shim lands in Node 24
   npm install
   ```
   npm 12 blocks dependency install scripts unless `package.json` `allowScripts` covers them. If your `~/.npmrc` has a global `allow-scripts=...` line, remove it: npm ignores it in this project and warns on every install. For a global install that needs scripts, pass the flag instead, e.g. `npm install -g --allow-scripts=<pkg> <pkg>`.
5. Start the application in development mode:
   ```bash
   npm run dev
   ```

## Building Distributables

The application is packaged with electron-builder. Each command builds the installer for
the host operating system. Build Windows artifacts on Windows, Linux artifacts on Linux,
and macOS artifacts on macOS.

The bootnode is baked in at build time from `MAIN_VITE_BOOTNODE_ENODE` (see `.env.example`;
the release workflow reads the `BOOTNODE_ENODE` repository variable). When it is empty the
built-in bootnode in `src/main/geth/bootnode.ts` is used. An invalid value is logged and
reported at startup, and the built-in bootnode is used.

### Windows

```bash
npm run build:win
```

Produces a Windows installer in the `dist/` directory.

It also builds `resources/bin/win/geth-supervisor.exe` from `native/geth-supervisor`,
which runs geth on Windows so that it always stops cleanly. This needs Go (the version in
`native/geth-supervisor/go.mod`). From Linux or macOS, build only the supervisor with
`GOOS=windows GOARCH=amd64 npm run build:geth-supervisor`.

### Linux

```bash
npm run build:linux
```

Produces Linux packages (such as AppImage or deb) in the `dist/` directory.

### macOS

```bash
npm run build:mac
```

Produces a macOS application and DMG in the `dist/` directory.

Continuous integration builds all three platforms automatically through the GitHub Actions
release workflow (`.github/workflows/release.yml`) whenever a `v*` tag is pushed.

## Error Reporting and Logs

- **Logs** are always written, sanitized, to `<userData>/logs/`: `main.log` (main and
  renderer, 1 MB) and `geth.log` (node output, 5 MB), each rotated to one `.old` file.
  Settings → Privacy & Diagnostics and the "recovery stopped" banner can open the folder
  or copy recent lines.
- **Error reports** use the Sentry protocol (`@sentry/electron`) and go only to a collector
  whose public key is pinned in the build. They are configured at build time through
  `MAIN_VITE_TELEMETRY_DSN` and `MAIN_VITE_TELEMETRY_PINS` (see `.env.example`; the release
  workflow reads the `TELEMETRY_DSN` and `TELEMETRY_PINS` repository variables). Without a
  DSN the build has no reporting at all.
- Reporting is on by default (opt-out). A first-run notice explains it, and nothing is sent
  until the notice is dismissed. Turning it off in Settings deletes unsent reports.
- Reports are rebuilt from an allowlist of fields and sanitized (recovery phrases, keys and
  other long hex, ethers error argument values, addresses, IPs, user and host names).
  Unsent reports wait in `<userData>/telemetry-queue/` (at most 5 MB and 30 days, oldest
  dropped first) and are visible in Settings.
- **Native crashes** are sent as an event only (process, reason, exit code); minidumps are
  never uploaded. Crashpad writes the dump to `<userData>/Crashpad/` (`completed/` on
  Linux, `reports/` on Windows, `completed/` + `pending/` on macOS). The SDK reads and
  deletes it as soon as it handles the crash: right away for renderer and child processes,
  or at the next app start for a crash of the main process. Dumps are deleted whether the
  event is sent, dropped (reporting off), over the per-session limit, or older than 30
  days. Builds without a DSN do not start the crash reporter, so they write no dumps.

## Development Workflow

### Using the Makefile

We provide a professional build system via `Makefile` to streamline development tasks. The available commands are:

- `make dev`: Starts the development server with hot-module reloading for both the main process and the React renderer.
- `make build:win`: Compiles the application and packages it as a Windows executable.
- `make clean`: Removes all build artifacts, including `out`, `dist`, and `build` directories to ensure a fresh compilation state.
- `make help` (default): Displays the list of available commands.

### Release Workflow

Releases run through `scripts/bump-version.js`, a thin wrapper around `npm version`. It refuses to run off `main` or behind `origin/main`, then `npm version` builds the app (`preversion`), bumps `package.json` and `package-lock.json`, stamps the codename and the `Makefile` version (`version` hook, `scripts/sync-release-files.js`), and creates the release commit and annotated `v*` tag. The script pushes the commit and tag atomically. If anything fails after the commit was created, it deletes the tag and resets to the starting commit, so a failed release leaves nothing behind locally.

**Usage:**

```bash
node scripts/bump-version.js <bump-type> <codename> [npm-version-flags]
```

`<bump-type>` is anything `npm version` accepts: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`, or an explicit version.

**Examples:**

- Bump the patch version (e.g., from 1.6.16 to 1.6.17):
  ```bash
  node scripts/bump-version.js patch Siren
  ```
- Start a beta prerelease (e.g., to 1.7.0-beta.0):
  ```bash
  node scripts/bump-version.js preminor Siren --preid=beta
  ```

## Community and Contributing

We welcome contributions. Please review the following documents before getting involved:

- [Contributing Guide](CONTRIBUTING.md): how to set up the project, run the local Geth node, and submit pull requests.
- [Code of Conduct](CODE_OF_CONDUCT.md): the standards we uphold in our community.
- [Security Policy](SECURITY.md): how to report vulnerabilities responsibly.

## License

This project is licensed under the terms of the [MIT License](LICENSE).
