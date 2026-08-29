import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./command.js";
import { createDmgPackage } from "./dmg.js";

export default async function build({ packageType } = {}) {
  const appRoot = process.cwd();
  const macosRoot = join(appRoot, "platforms", "macos");
  const projectPath = join(macosRoot, "shellular.xcodeproj");

  if (packageType === "dmg") {
    const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
    await createDmgPackage({
      appRoot,
      macosRoot,
      projectPath,
      version: packageJson.version,
      versionCode: packageJson.versionCode,
    });
    return;
  }
  if (packageType) {
    throw new Error(`Unsupported macOS package type: ${packageType}`);
  }

  const archivePath = join(macosRoot, "shellular.xcarchive");
  await runCommand("xcodebuild", [
    "archive",
    "-project",
    projectPath,
    "-scheme",
    "shellular",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=macOS",
    "-archivePath",
    archivePath,
  ]);
  console.log(`Archive created at: ${archivePath}`);
}
