const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ZipArchive } = require("archiver");

/**
 * Generates an 8-character hexadecimal build ID.
 * Format:
 * - 5 hex chars from current Unix timestamp
 * - 3 random hex chars
 *
 * Example:
 *   a13cf7b2
 *
 * @returns {string}
 */
function generateBuildId() {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .slice(-5);

  const random = crypto.randomBytes(2).toString("hex").slice(0, 3);

  return `${timestamp}${random}`;
}

/**
 * Writes the generated build ID to build-info.json.
 *
 * @returns {string} Generated build ID.
 */
function updateBuildId() {
  const buildId = generateBuildId();

  fs.writeFileSync(
    path.join(__dirname, "build-info.json"),
    JSON.stringify(
      {
        build: buildId,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Build ID updated: ${buildId}`);

  return buildId;
}

// Unit tests live next to the extension sources but must not ship.
const TEST_FILE_PATTERN = /\.test\.js$/;

/**
 * Creates ZIP archive.
 * @param {string} sourceDir
 * @param {string} outFile
 */
function zipDirectory(sourceDir, outFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);

    const archive = new ZipArchive({
      zlib: {
        level: 9,
      },
    });

    output.on("close", () => {
      console.log(`ZIP size: ${archive.pointer().toLocaleString()} bytes`);
      resolve();
    });

    output.on("error", reject);

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn(err.message);
      } else {
        reject(err);
      }
    });

    archive.on("error", reject);

    archive.pipe(output);

    archive.directory(sourceDir, false, (entry) =>
      TEST_FILE_PATTERN.test(entry.name) ? false : entry,
    );

    archive.finalize();
  });
}

/**
 * Build process.
 */
async function runBuild() {
  const extensionDir = path.join(__dirname, "extension");
  const resourceDir = path.join(__dirname, "resources");
  const zipFile = path.join(resourceDir, "extension.zip");

  if (!fs.existsSync(extensionDir)) {
    throw new Error(`Directory not found: ${extensionDir}`);
  }

  fs.mkdirSync(resourceDir, {
    recursive: true,
  });

  updateBuildId();

  await zipDirectory(extensionDir, zipFile);

  console.log("Build completed successfully.");
}

runBuild().catch((err) => {
  console.error("Build failed");
  console.error(err);
  process.exit(1);
});
