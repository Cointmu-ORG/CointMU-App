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
   git clone https://github.com/kakonoomoidee/CointMU.git
   cd CointMU
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

### Windows

```bash
npm run build:win
```

Produces a Windows installer in the `dist/` directory.

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
