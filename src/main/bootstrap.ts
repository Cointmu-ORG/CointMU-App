import { app } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { initLogging } from "./diagnostics/logging";
import { initErrorReporting } from "./diagnostics/errorReporting";

// index.ts imports this after its other imports and before any module that
// reads process.env or logs at load time. Imports evaluate before the importing
// module's body, so logging, error reporting and .env must start here to stay
// ahead of that code.
initLogging();
initErrorReporting();

config({ path: join(app.getAppPath(), ".env") });
