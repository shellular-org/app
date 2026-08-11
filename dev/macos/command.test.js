import { describe, expect, it } from "vitest";
import { CommandExecutionError, runCommand } from "./command.js";

describe("runCommand", () => {
  it("captures stdout and stderr without a shell", async () => {
    const result = await runCommand(process.execPath, ["-e", 'process.stdout.write("out"); process.stderr.write("err")'], { capture: true });

    expect(result).toEqual({ stdout: "out", stderr: "err" });
  });

  it("returns structured output when a command fails", async () => {
    const execution = runCommand(process.execPath, ["-e", 'process.stdout.write("out"); process.stderr.write("failure"); process.exit(7)'], {
      capture: true,
    });

    await expect(execution).rejects.toMatchObject({
      name: "CommandExecutionError",
      code: 7,
      stdout: "out",
      stderr: "failure",
    });
    await execution.catch((error) => {
      expect(error).toBeInstanceOf(CommandExecutionError);
    });
  });
});
