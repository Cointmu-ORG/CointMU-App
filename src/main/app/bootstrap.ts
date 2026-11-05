import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "path";
import { initLogging } from "../diagnostics/logging";
import { initErrorReporting } from "../diagnostics/errorReporting";

// index.ts imports this first. Modules such as geth/process/ports read
// process.env or log at load time, and imports evaluate before the importing
// module's body, so logging, error reporting and .env must start here to stay
// ahead of that code.
initLogging();
initErrorReporting();

// A packaged app ships no .env (electron-builder.yml excludes it); its runtime
// overrides come from the process environment. loadEnvFile keeps variables that
// are already set, so CI's GETH_NETWORK_ID wins over .env; it throws on a
// missing file, hence the guard.
if (!app.isPackaged) {
  const envFile = join(app.getAppPath(), ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
