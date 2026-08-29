import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runCommand } = vi.hoisted(() => ({ runCommand: vi.fn() }));

vi.mock("./command.js", () => ({ runCommand }));

import start from "./start.js";

describe("start macOS development app", () => {
  beforeEach(() => {
    runCommand.mockReset();
    runCommand.mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("builds and launches the exact Debug app", async () => {
    const onDone = vi.fn();
    const appRoot = process.cwd();
    const derivedData = join(tmpdir(), "shellular-macos-dev");
    const architecture = process.arch === "arm64" ? "arm64" : "x86_64";

    await start({ host: "127.0.0.1", port: 4321 }, onDone);

    expect(runCommand).toHaveBeenNthCalledWith(1, "xcodebuild", [
      "-project",
      join(appRoot, "platforms", "macos", "shellular.xcodeproj"),
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
    expect(runCommand).toHaveBeenNthCalledWith(2, "open", [
      "-n",
      join(derivedData, "Build", "Products", "Debug", "Shellular.app"),
    ]);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("restores output and propagates a build failure without launching", async () => {
    const onDone = vi.fn();
    runCommand.mockRejectedValueOnce(new Error("build failed"));

    await expect(start(undefined, onDone)).rejects.toThrow("build failed");

    expect(runCommand).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
