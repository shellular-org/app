import { describe, expect, it, vi } from "vitest";
import { createDmgPackage, findDeveloperIdIdentity, parseBuildSettings, parseCodeSigningDetails, parseNotaryResponse } from "./dmg.js";

const TEAM_ID = "A1B2C3D4E5";
const IDENTITY = `Developer ID Application: Shellular Company (${TEAM_ID})`;
const WORKSPACE = "/repo/app/dist/.shellular-dmg-test";

describe("DMG parsing helpers", () => {
  it("parses resolved Xcode settings", () => {
    const settings = parseBuildSettings(`
      DEVELOPMENT_TEAM = ${TEAM_ID}
      SHELLULAR_NOTARY_PROFILE = company-notary
    `);
    expect(settings.get("DEVELOPMENT_TEAM")).toBe(TEAM_ID);
    expect(settings.get("SHELLULAR_NOTARY_PROFILE")).toBe("company-notary");
  });

  it("selects only a Developer ID identity from the configured team", () => {
    const output = [`1) ${"A".repeat(40)} "Developer ID Application: Other Company (Z9Y8X7W6V5)"`, `2) ${"B".repeat(40)} "${IDENTITY}"`].join("\n");
    expect(findDeveloperIdIdentity(output, TEAM_ID)).toEqual({
      hash: "B".repeat(40),
      name: IDENTITY,
      teamId: TEAM_ID,
    });
  });

  it("parses Developer ID and Hardened Runtime details", () => {
    expect(parseCodeSigningDetails(signingDetails())).toEqual({
      authority: IDENTITY,
      teamId: TEAM_ID,
      hardenedRuntime: true,
    });
  });

  it("parses plain and prefixed notary JSON", () => {
    expect(parseNotaryResponse('{"status":"Accepted","id":"one"}')).toEqual({
      status: "Accepted",
      id: "one",
    });
    expect(parseNotaryResponse('progress\n{"status":"Invalid","id":"two"}\n')).toEqual({ status: "Invalid", id: "two" });
  });
});

describe("createDmgPackage", () => {
  it("archives, exports, signs, notarizes, validates, and atomically publishes", async () => {
    const harness = createHarness();

    await expect(runPackage(harness)).resolves.toBe("/repo/app/dist/Shellular-1.2.3.dmg");

    const archive = findCall(harness.calls, "xcodebuild", "archive");
    expect(archive.args).toEqual(
      expect.arrayContaining([
        "MARKETING_VERSION=1.2.3",
        "CURRENT_PROJECT_VERSION=123",
        "CODE_SIGN_ENTITLEMENTS=shellular/shellular.direct.entitlements",
        "ENABLE_HARDENED_RUNTIME=YES",
        "OTHER_CODE_SIGN_FLAGS=--timestamp",
      ]),
    );

    const exportOptions = harness.fileSystem.writeFile.mock.calls[0][1];
    expect(exportOptions).toContain("<string>developer-id</string>");
    expect(exportOptions).toContain(`<string>${TEAM_ID}</string>`);

    const dmgSigning = harness.calls.find(({ command, args }) => command === "codesign" && args[0] === "--force");
    expect(dmgSigning.args).toContain(IDENTITY);

    const submission = findCall(harness.calls, "xcrun", "notarytool", "submit");
    expect(submission.args).toEqual(expect.arrayContaining(["--keychain-profile", "company-notary", "--wait"]));
    expect(harness.fileSystem.rename).toHaveBeenCalledWith(`${WORKSPACE}/Shellular-1.2.3.dmg`, "/repo/app/dist/Shellular-1.2.3.dmg");
    expect(harness.fileSystem.rm).toHaveBeenCalledWith(WORKSPACE, {
      recursive: true,
      force: true,
    });
  });

  it("fails before archiving when the configured team has no Developer ID identity", async () => {
    const harness = createHarness({ identityTeamId: "Z9Y8X7W6V5" });

    await expect(runPackage(harness)).rejects.toThrow(`No valid Developer ID Application identity was found for Apple team ${TEAM_ID}`);
    expect(harness.calls.some(({ command, args }) => command === "xcodebuild" && args.includes("archive"))).toBe(false);
    expect(harness.fileSystem.rename).not.toHaveBeenCalled();
  });

  it("requires the local signing configuration", async () => {
    const harness = createHarness();
    harness.fileSystem.access.mockRejectedValueOnce(new Error("missing"));

    await expect(runPackage(harness)).rejects.toThrow("Missing /repo/app/platforms/macos/Signing.xcconfig");
    expect(harness.run).not.toHaveBeenCalled();
  });

  it.each([
    ["Hardened Runtime", { signingOutput: signingDetails().replace("(runtime)", "") }],
    ["get-task-allow", { entitlements: entitlementXml("com.apple.security.get-task-allow") }],
    ["App Sandbox", { entitlements: entitlementXml("com.apple.security.app-sandbox") }],
    ["universal", { architectures: "arm64\n" }],
  ])("rejects an invalid exported app: %s", async (_label, options) => {
    const harness = createHarness(options);

    await expect(runPackage(harness)).rejects.toThrow();
    expect(harness.fileSystem.rename).not.toHaveBeenCalled();
    expect(harness.fileSystem.rm).toHaveBeenCalled();
  });

  it("prints Apple's log and withholds an invalid notarization", async () => {
    const harness = createHarness({ notaryStatus: "Invalid" });

    await expect(runPackage(harness)).rejects.toThrow("Apple notarization failed with status Invalid");
    expect(findCall(harness.calls, "xcrun", "notarytool", "log")).toBeTruthy();
    expect(harness.logger.error).toHaveBeenCalledWith(expect.stringContaining("The signature does not include a secure timestamp"));
    expect(harness.fileSystem.rename).not.toHaveBeenCalled();
    expect(harness.fileSystem.rm).toHaveBeenCalled();
  });

  it.each([
    ["archive export", ({ command, args }) => command === "xcodebuild" && args[0] === "-exportArchive"],
    ["DMG signing", ({ command, args }) => command === "codesign" && args[0] === "--force"],
    ["ticket stapling", ({ command, args }) => command === "xcrun" && args[0] === "stapler" && args[1] === "staple"],
    ["Gatekeeper assessment", ({ command }) => command === "spctl"],
  ])("cleans temporary output when %s fails", async (_label, failurePredicate) => {
    const harness = createHarness({ failurePredicate });

    await expect(runPackage(harness)).rejects.toThrow("simulated command failure");
    expect(harness.fileSystem.rename).not.toHaveBeenCalled();
    expect(harness.fileSystem.rm).toHaveBeenCalledWith(WORKSPACE, {
      recursive: true,
      force: true,
    });
  });
});

function createHarness(options = {}) {
  const calls = [];
  const logger = { log: vi.fn(), error: vi.fn() };
  const fileSystem = {
    access: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    mkdtemp: vi.fn(async () => WORKSPACE),
    writeFile: vi.fn(async () => undefined),
    symlink: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
  };

  const run = vi.fn(async (command, args, commandOptions = {}) => {
    const call = { command, args, options: commandOptions };
    calls.push(call);
    if (options.failurePredicate?.(call)) {
      throw new Error("simulated command failure");
    }

    if (command === "xcodebuild" && args.includes("-showBuildSettings")) {
      return result(`
        DEVELOPMENT_TEAM = ${TEAM_ID}
        SHELLULAR_NOTARY_PROFILE = company-notary
      `);
    }
    if (command === "security") {
      const identityTeamId = options.identityTeamId ?? TEAM_ID;
      return result(`1) ${"A".repeat(40)} "Developer ID Application: Shellular Company (${identityTeamId})"`);
    }
    if (command === "codesign" && args[0] === "-d" && args.includes("--verbose=4")) {
      return result("", options.signingOutput ?? signingDetails());
    }
    if (command === "codesign" && args[0] === "-d" && args.includes("--entitlements")) {
      return result(options.entitlements ?? directEntitlements());
    }
    if (command === "lipo") {
      return result(options.architectures ?? "x86_64 arm64\n");
    }
    if (command === "xcrun" && args[0] === "notarytool" && args[1] === "submit") {
      return result(
        JSON.stringify({
          status: options.notaryStatus ?? "Accepted",
          id: "submission-id",
        }),
      );
    }
    if (command === "xcrun" && args[0] === "notarytool" && args[1] === "log") {
      return result('{"issues":["The signature does not include a secure timestamp"]}');
    }
    return result();
  });

  return { calls, fileSystem, logger, run };
}

function runPackage(harness) {
  return createDmgPackage(
    {
      appRoot: "/repo/app",
      macosRoot: "/repo/app/platforms/macos",
      projectPath: "/repo/app/platforms/macos/shellular.xcodeproj",
      version: "1.2.3",
      versionCode: 123,
    },
    {
      fileSystem: harness.fileSystem,
      hostPlatform: "darwin",
      logger: harness.logger,
      run: harness.run,
    },
  );
}

function findCall(calls, command, ...requiredArguments) {
  return calls.find((call) => call.command === command && requiredArguments.every((argument) => call.args.includes(argument)));
}

function result(stdout = "", stderr = "") {
  return { stdout, stderr };
}

function signingDetails() {
  return [
    "CodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=10+7 location=embedded",
    `Authority=${IDENTITY}`,
    `TeamIdentifier=${TEAM_ID}`,
  ].join("\n");
}

function directEntitlements() {
  return `[Dict]
  [Key] com.apple.security.network.client
  [Value]
    [Bool] true`;
}

function entitlementXml(name) {
  return `[Dict]
  [Key] ${name}
  [Value]
    [Bool] true`;
}
