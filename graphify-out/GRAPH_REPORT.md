# Graph Report - CointMU-APP  (2026-10-12)

## Corpus Check
- 289 files · ~124,527 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 95 nodes · 94 edges · 36 communities (4 shown, 32 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7b17f81c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- scripts
- package.json
- dependencies
- devDependencies
- boring-avatars
- crypto
- date-fns
- detect-port
- dotenv
- electron
- electron-builder
- electron-store
- @electron-toolkit/preload
- @electron-toolkit/tsconfig
- electron-vite
- ethers
- i18next
- lucide-react
- ms
- qrcode.react
- react
- react-dom
- react-i18next
- react-router-dom
- ws
- zustand
- tailwindcss
- @tailwindcss/vite
- @types/chrome
- @types/detect-port
- @types/ms
- @types/react
- @types/react-dom
- @types/ws
- typescript
- @vitejs/plugin-react

## God Nodes (most connected - your core abstractions)
1. `scripts` - 12 edges
2. `archiver` - 2 edges
3. `boring-avatars` - 2 edges
4. `crypto` - 2 edges
5. `date-fns` - 2 edges
6. `dotenv` - 2 edges
7. `electron-store` - 2 edges
8. `electron-updater` - 2 edges
9. `ethers` - 2 edges
10. `i18next` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (36 total, 32 thin omitted)

### Community 0 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, build:linux, build:mac, build:unpack, build:win, dev, i18n:audit (+4 more)

### Community 1 - "package.json"
Cohesion: 0.22
Nodes (8): author, codename, description, license, main, name, productName, version

### Community 2 - "dependencies"
Cohesion: 0.40
Nodes (5): archiver, electron-updater, dependencies, archiver, electron-updater

### Community 3 - "devDependencies"
Cohesion: 0.40
Nodes (5): @crxjs/vite-plugin, @electron-toolkit/utils, devDependencies, @crxjs/vite-plugin, @electron-toolkit/utils

## Knowledge Gaps
- **55 isolated node(s):** `name`, `productName`, `version`, `codename`, `description` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`, `boring-avatars`, `crypto`, `date-fns`, `dotenv`, `electron-store`, `ethers`, `i18next`, `lucide-react`, `ms`, `qrcode.react`, `react`, `react-dom`, `react-i18next`, `react-router-dom`, `ws`, `zustand`?**
  _High betweenness centrality (0.618) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `@types/react-dom`, `package.json`, `@types/ws`, `typescript`, `@vitejs/plugin-react`, `detect-port`, `electron`, `electron-builder`, `@electron-toolkit/preload`, `@electron-toolkit/tsconfig`, `electron-vite`, `tailwindcss`, `@tailwindcss/vite`, `@types/chrome`, `@types/detect-port`, `@types/ms`, `@types/react`?**
  _High betweenness centrality (0.618) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **What connects `name`, `productName`, `version` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._