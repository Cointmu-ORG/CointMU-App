# Contributing to CointMU Desktop Client

Thank you for your interest in contributing to CointMU. This document explains how to
set up the project locally, run the bundled Geth node, and submit changes for review.

By participating in this project you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js 24 and the npm pinned in `package.json` (see the README Quick Start)
- Git
- A `geth` binary placed in `resources/bin/` (see below)

## Getting Started

1. Fork the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/CointMU.git
   cd CointMU
   ```

2. Add the upstream remote so you can keep your fork in sync:

   ```bash
   git remote add upstream https://github.com/Cointmu-ORG/CointMU-App.git
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy the example environment file and adjust values as needed:

   ```bash
   cp .env.example .env
   ```

## Running the Local Geth Node

The desktop client manages a local Core-geth node as a child process and talks to it
over JSON-RPC. To run it during development:

1. Place the platform-appropriate `geth` executable in `resources/bin/`. On Windows the
   file is `geth.exe`; on macOS and Linux it is `geth`. Ensure the binary is executable
   (`chmod +x resources/bin/geth` on macOS and Linux).
2. Start the application in development mode:

   ```bash
   npm run dev
   ```

The main process spawns the node, resolves a free RPC port, and exposes it to the
renderer through the preload bridge. You do not need to start `geth` manually; the app
handles the lifecycle. Logs from the node are surfaced in the terminal that launched
`npm run dev`.

## Branching and Commits

1. Create a topic branch from `main`:

   ```bash
   git checkout -b feat/short-description
   ```

2. Keep commits focused and write clear, imperative commit messages.
3. Rebase onto the latest upstream `main` before opening a pull request:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

## Verifying Your Changes

Before submitting, make sure the project compiles and the type checks pass:

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run build
```

Run the app and manually confirm that the area you touched behaves as expected. There is
currently no automated test suite, so manual verification of the affected views and the
node interaction is required.

## Submitting a Pull Request

1. Push your branch to your fork and open a pull request against `Cointmu-ORG/CointMU-App:main`.
2. Fill in the pull request template completely, describe your changes, link any related
   issues, and confirm that the build and local checks passed.
3. A maintainer will review your contribution. Please respond to review feedback and keep
   your branch up to date with `main`.

## Coding Guidelines

- Use TypeScript and follow the existing project conventions.
- Use single quotes for string literals.
- Document functions, interfaces, and classes with standard JSDoc comments.
- Avoid inline comments inside code blocks; prefer self-explanatory code and
  function-level documentation.
- Do not commit secrets, private keys, or the `geth` binary.

We appreciate your contributions and look forward to your pull requests.
