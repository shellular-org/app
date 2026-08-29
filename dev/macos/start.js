import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./command.js";

export default async function start(server, onDone) {
  const appRoot = process.cwd();
  const project = join(appRoot, "platforms", "macos", "shellular.xcodeproj");
  const derivedData = join(tmpdir(), "shellular-macos-dev");
  const app = join(derivedData, "Build", "Products", "Debug", "Shellular.app");
  const architecture = process.arch === "arm64" ? "arm64" : "x86_64";

  try {
    console.log("Building the shellular Debug scheme for My Mac...");
    await runCommand("xcodebuild", [
      "-project",
      project,
      "-scheme",
      "shellular",
      "-configuration",
      "Debug",
      "-destination",
      `platform=macOS,arch=${architecture}`,
      "-derivedDataPath",
      derivedData,
      "build",
    ]);

    await runCommand("open", ["-n", app]);
    console.log(`Shellular launched from: ${app}`);
    if (server) console.log(`Dev server: http://${server.host}:${server.port}`);
  } finally {
    onDone?.();
  }
}
