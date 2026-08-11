import * as defaultFileSystem from "node:fs/promises";
import { join } from "node:path";
import { runCommand as defaultRunCommand } from "./command.js";

const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function parseBuildSettings(output) {
  const settings = new Map();
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) settings.set(match[1], match[2]);
  }
  return settings;
}

export function findDeveloperIdIdentity(output, teamId) {
  const identities = [];
  const pattern = /([0-9A-Fa-f]{40})\s+"(Developer ID Application:[^"]+\(([A-Z0-9]{10})\))"/g;
  let match = pattern.exec(output);
  while (match) {
    if (match[3] === teamId) {
      identities.push({ hash: match[1], name: match[2], teamId: match[3] });
    }
    match = pattern.exec(output);
  }
  return identities[0];
}

export function parseCodeSigningDetails(output) {
  const authority = output.match(/^Authority=(Developer ID Application:.+)$/m)?.[1]?.trim();
  const teamId = output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  const hardenedRuntime = /^CodeDirectory .+flags=.*\bruntime\b.*$/m.test(output);
  return { authority, teamId, hardenedRuntime };
}

export function parseNotaryResponse(output) {
  const trimmed = output.trim();
  if (!trimmed) throw new Error("The Apple notary service returned an empty response");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("The Apple notary service returned invalid JSON");
  }
}

export async function createDmgPackage(options, dependencies = {}) {
  const { appRoot, macosRoot, projectPath, version, versionCode } = options;
  const run = dependencies.run ?? defaultRunCommand;
  const fileSystem = dependencies.fileSystem ?? defaultFileSystem;
  const logger = dependencies.logger ?? console;
  const hostPlatform = dependencies.hostPlatform ?? process.platform;
  const signingConfigPath = join(macosRoot, "Signing.xcconfig");
  const distDirectory = join(appRoot, "dist");
  const finalDmgPath = join(distDirectory, `Shellular-${version}.dmg`);
  let workspace;

  validatePackageMetadata(version, versionCode);
  if (hostPlatform !== "darwin") {
    throw new Error("DMG packages can only be built on macOS");
  }

  try {
    await fileSystem.access(signingConfigPath);
  } catch {
    throw new Error(`Missing ${signingConfigPath}. Copy Signing.xcconfig.example and configure your Apple team and notary profile.`);
  }

  const settingsResult = await run(
    "xcodebuild",
    ["-project", projectPath, "-scheme", "shellular", "-configuration", "Release", "-xcconfig", signingConfigPath, "-showBuildSettings"],
    { capture: true },
  );
  const settings = parseBuildSettings(settingsResult.stdout);
  const teamId = settings.get("DEVELOPMENT_TEAM");
  const notaryProfile = settings.get("SHELLULAR_NOTARY_PROFILE");
  validateSigningSettings(teamId, notaryProfile);

  const identitiesResult = await run("security", ["find-identity", "-v", "-p", "codesigning"], { capture: true });
  const identity = findDeveloperIdIdentity(identitiesResult.stdout, teamId);
  if (!identity) {
    throw new Error(`No valid Developer ID Application identity was found for Apple team ${teamId}`);
  }

  await run("xcrun", ["notarytool", "history", "--keychain-profile", notaryProfile, "--output-format", "json", "--no-progress"], { capture: true });

  await fileSystem.mkdir(distDirectory, { recursive: true });
  workspace = await fileSystem.mkdtemp(join(distDirectory, ".shellular-dmg-"));

  const archivePath = join(workspace, "Shellular.xcarchive");
  const exportDirectory = join(workspace, "export");
  const exportOptionsPath = join(workspace, "ExportOptions.plist");
  const stagingDirectory = join(workspace, "staging");
  const stagedAppPath = join(stagingDirectory, "Shellular.app");
  const exportedAppPath = join(exportDirectory, "Shellular.app");
  const temporaryDmgPath = join(workspace, `Shellular-${version}.dmg`);

  try {
    await fileSystem.writeFile(exportOptionsPath, createExportOptionsPlist(teamId), "utf8");

    logger.log(`Archiving Shellular ${version} (${versionCode}) for Developer ID distribution...`);
    await run("xcodebuild", [
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
      "-xcconfig",
      signingConfigPath,
      "-allowProvisioningUpdates",
      `MARKETING_VERSION=${version}`,
      `CURRENT_PROJECT_VERSION=${versionCode}`,
      "CODE_SIGN_ENTITLEMENTS=shellular/shellular.direct.entitlements",
      "ENABLE_HARDENED_RUNTIME=YES",
      "OTHER_CODE_SIGN_FLAGS=--timestamp",
    ]);

    logger.log("Exporting the archive with a Developer ID Application certificate...");
    await run("xcodebuild", [
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportPath",
      exportDirectory,
      "-exportOptionsPlist",
      exportOptionsPath,
      "-allowProvisioningUpdates",
    ]);
    await fileSystem.access(exportedAppPath);

    const signing = await verifyExportedApp({
      appPath: exportedAppPath,
      run,
      teamId,
    });

    await fileSystem.mkdir(stagingDirectory, { recursive: true });
    await run("ditto", [exportedAppPath, stagedAppPath]);
    await fileSystem.symlink("/Applications", join(stagingDirectory, "Applications"));

    logger.log("Creating and signing the compressed DMG...");
    await run("hdiutil", [
      "create",
      "-volname",
      "Shellular",
      "-srcfolder",
      stagingDirectory,
      "-format",
      "UDZO",
      "-ov",
      "-nospotlight",
      temporaryDmgPath,
    ]);
    await run("codesign", ["--force", "--timestamp", "--sign", signing.authority, temporaryDmgPath]);
    await run("codesign", ["--verify", "--strict", "--verbose=2", temporaryDmgPath]);

    const notaryResponse = await submitForNotarization({
      dmgPath: temporaryDmgPath,
      logger,
      notaryProfile,
      run,
    });
    logger.log(`Apple notarization accepted submission ${notaryResponse.id}`);

    await run("xcrun", ["stapler", "staple", "-v", temporaryDmgPath]);
    await run("hdiutil", ["verify", temporaryDmgPath]);
    await run("codesign", ["--verify", "--strict", "--verbose=2", temporaryDmgPath]);
    await run("xcrun", ["stapler", "validate", "-v", temporaryDmgPath]);
    await run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", temporaryDmgPath]);

    await fileSystem.rename(temporaryDmgPath, finalDmgPath);
    logger.log(`Signed and notarized DMG created at: ${finalDmgPath}`);
    return finalDmgPath;
  } finally {
    if (workspace) {
      await fileSystem.rm(workspace, { recursive: true, force: true });
    }
  }
}

async function verifyExportedApp({ appPath, run, teamId }) {
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const detailsResult = await run("codesign", ["-d", "--verbose=4", appPath], {
    capture: true,
  });
  const details = parseCodeSigningDetails(`${detailsResult.stdout}\n${detailsResult.stderr}`);

  if (!details.authority || details.teamId !== teamId) {
    throw new Error(`The exported app is not signed with a Developer ID Application certificate for Apple team ${teamId}`);
  }
  if (!details.hardenedRuntime) {
    throw new Error("The exported app does not have Hardened Runtime enabled");
  }

  const entitlementsResult = await run("codesign", ["-d", "--entitlements", "-", appPath], {
    capture: true,
  });
  const entitlements = `${entitlementsResult.stdout}\n${entitlementsResult.stderr}`;
  if (hasEnabledEntitlement(entitlements, "com.apple.security.get-task-allow")) {
    throw new Error("The exported app contains the forbidden get-task-allow entitlement");
  }
  if (hasEnabledEntitlement(entitlements, "com.apple.security.app-sandbox")) {
    throw new Error("The direct-download app was unexpectedly exported with App Sandbox enabled");
  }

  const architecturesResult = await run("lipo", ["-archs", join(appPath, "Contents/MacOS/Shellular")], { capture: true });
  const architectures = new Set(architecturesResult.stdout.trim().split(/\s+/));
  if (!architectures.has("arm64") || !architectures.has("x86_64")) {
    throw new Error("The exported app is not a universal arm64/x86_64 build");
  }

  return details;
}

async function submitForNotarization({ dmgPath, logger, notaryProfile, run }) {
  let result;
  try {
    result = await run(
      "xcrun",
      [
        "notarytool",
        "submit",
        dmgPath,
        "--keychain-profile",
        notaryProfile,
        "--wait",
        "--timeout",
        "30m",
        "--output-format",
        "json",
        "--no-progress",
      ],
      { capture: true },
    );
  } catch (error) {
    const response = tryParseNotaryResponse(error.stdout || error.stderr || "");
    if (response?.id) await printNotaryLog(response.id, notaryProfile, run, logger);
    throw error;
  }

  const response = parseNotaryResponse(result.stdout || result.stderr);
  if (response.status !== "Accepted") {
    if (response.id) await printNotaryLog(response.id, notaryProfile, run, logger);
    throw new Error(`Apple notarization failed with status ${response.status || "Unknown"}${response.id ? ` (submission ${response.id})` : ""}`);
  }
  return response;
}

async function printNotaryLog(submissionId, notaryProfile, run, logger) {
  try {
    const result = await run("xcrun", ["notarytool", "log", submissionId, "--keychain-profile", notaryProfile, "--output-format", "json"], {
      capture: true,
    });
    logger.error(result.stdout || result.stderr);
  } catch (error) {
    logger.error(`Unable to retrieve notarization log: ${error.message}`);
  }
}

function validatePackageMetadata(version, versionCode) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`Invalid package versionCode: ${versionCode}`);
  }
}

function validateSigningSettings(teamId, notaryProfile) {
  if (!teamId || !TEAM_ID_PATTERN.test(teamId)) {
    throw new Error("Signing.xcconfig must define a valid 10-character DEVELOPMENT_TEAM");
  }
  if (!notaryProfile || notaryProfile === "NOTARY_PROFILE_NAME") {
    throw new Error("Signing.xcconfig must define SHELLULAR_NOTARY_PROFILE");
  }
}

function hasEnabledEntitlement(entitlements, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:<key>${escapedName}</key>\\s*<true\\s*/>|["']${escapedName}["']\\s*(?:=>|:)\\s*true)`).test(entitlements)) {
    return true;
  }

  const nativeBlock = entitlements.match(new RegExp(`\\[Key\\]\\s+${escapedName}([\\s\\S]*?)(?=\\n\\s*\\[Key\\]|$)`))?.[1];
  return !!nativeBlock && /\[Bool\]\s+true/.test(nativeBlock);
}

function tryParseNotaryResponse(output) {
  try {
    return parseNotaryResponse(output);
  } catch {
    return undefined;
  }
}

function createExportOptionsPlist(teamId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>method</key>
  <string>developer-id</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${teamId}</string>
</dict>
</plist>
`;
}
