import { describe, expect, it } from "vitest";
import { parseBuildArgs } from "./build-args.js";

describe("parseBuildArgs", () => {
  it.each(["android", "ios", "macos", "browser"])("parses an archive-only %s build", (platform) => {
    expect(parseBuildArgs([platform])).toEqual({
      platform,
      packageType: undefined,
    });
  });

  it("accepts a separate DMG package value", () => {
    expect(parseBuildArgs(["macos", "--package", "dmg"])).toEqual({
      platform: "macos",
      packageType: "dmg",
    });
  });

  it("accepts an equals-form DMG package value case-insensitively", () => {
    expect(parseBuildArgs(["MacOS", "--package=DMG"])).toEqual({
      platform: "macos",
      packageType: "dmg",
    });
  });

  it.each([
    [[], "Please specify a platform"],
    [["macos", "--package"], "requires a value"],
    [["macos", "--package="], "requires a value"],
    [["macos", "--package", "zip"], "Unsupported macos package type: zip"],
    [["ios", "--package", "dmg"], "not supported for ios"],
    [["macos", "--package", "dmg", "--package=dmg"], "only be provided once"],
    [["macos", "ios"], "Multiple build platforms"],
    [["macos", "--unknown"], "Unknown build argument"],
  ])("rejects invalid arguments %j", (args, message) => {
    expect(() => parseBuildArgs(args)).toThrow(message);
  });
});
