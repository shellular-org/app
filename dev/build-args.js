const SUPPORTED_PLATFORMS = new Set(["android", "ios", "macos", "browser"]);
const SUPPORTED_PACKAGES = new Map([["macos", new Set(["dmg"])]]);

export function parseBuildArgs(args) {
  let platform;
  let packageType;
  let packageOptionSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const rawArgument = args[index];
    const argument = rawArgument.toLowerCase();

    if (SUPPORTED_PLATFORMS.has(argument)) {
      if (platform) {
        throw new Error(`Multiple build platforms were provided: ${platform}, ${argument}`);
      }
      platform = argument;
      continue;
    }

    if (argument === "--package" || argument.startsWith("--package=")) {
      if (packageOptionSeen) {
        throw new Error("The --package option may only be provided once");
      }
      packageOptionSeen = true;

      if (argument === "--package") {
        const value = args[index + 1];
        if (!value || value.startsWith("-")) {
          throw new Error("The --package option requires a value");
        }
        packageType = value.toLowerCase();
        index += 1;
      } else {
        packageType = rawArgument.slice(rawArgument.indexOf("=") + 1).toLowerCase();
        if (!packageType) {
          throw new Error("The --package option requires a value");
        }
      }
      continue;
    }

    throw new Error(`Unknown build argument: ${rawArgument}`);
  }

  if (!platform) {
    throw new Error("Please specify a platform: android, ios, macos, or browser");
  }

  if (packageType) {
    const supportedForPlatform = SUPPORTED_PACKAGES.get(platform);
    if (!supportedForPlatform) {
      throw new Error(`The --package option is not supported for ${platform}`);
    }
    if (!supportedForPlatform.has(packageType)) {
      throw new Error(`Unsupported ${platform} package type: ${packageType}`);
    }
  }

  return { platform, packageType };
}
