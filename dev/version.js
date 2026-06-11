import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const type = args.find((arg) => /(patch|minor|major)/i.test(arg));
const revert = !!args.find((arg) => /revert/i.test(arg));
let version = args.find((arg) => /^\d+\.\d+\.\d+$/.test(arg));
let versionCode = parseInt(args.find((arg) => /^\d+$/.test(arg)) || 0, 10);
const INCREMENT = revert ? -1 : 1;
const packageJsonFile = resolve(process.cwd(), "package.json");
const manifestXmlFile = resolve(process.cwd(), "platforms/android/app/src/main/AndroidManifest.xml");
const pbxprojFile = resolve(process.cwd(), "platforms/ios/shellular.xcodeproj/project.pbxproj");

main();

async function main() {
  const packageContent = readFileSync(packageJsonFile, "utf8");
  const manifestContent = readFileSync(manifestXmlFile, "utf8");
  const pbxprojContent = readFileSync(pbxprojFile, "utf8");
  const packageJson = JSON.parse(packageContent);

  if (!version) {
    let [major, minor, patch] = packageJson.version.split(".");

    switch (type) {
      case "patch":
        patch = parseInt(patch, 10) + INCREMENT;
        break;
      case "minor":
        minor = parseInt(minor, 10) + INCREMENT;
        patch = 0;
        break;
      case "major":
        major = parseInt(major, 10) + INCREMENT;
        minor = 0;
        patch = 0;
        break;
      default:
        throw new Error("Invalid version type. Use patch, minor or major");
    }

    version = `${major}.${minor}.${patch}`;
    versionCode = packageJson.versionCode + INCREMENT;
  }

  let newConfigContent = manifestContent.replace(/android:versionName="(\d+\.\d+\.\d+)"/gi, `android:versionName="${version}"`);
  newConfigContent = newConfigContent.replace(/android:versionCode="(\d+)"/gi, `android:versionCode="${versionCode}"`);
  writeFileSync(manifestXmlFile, newConfigContent, "utf8");

  let newPbxprojContent = pbxprojContent.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${version};`);
  newPbxprojContent = newPbxprojContent.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
  writeFileSync(pbxprojFile, newPbxprojContent, "utf8");

  writeFileSync(packageJsonFile, JSON.stringify({ ...packageJson, version, versionCode }, undefined, 2), "utf8");

  console.log(`Version updated to ${version} and versionCode to ${versionCode}`);
  process.exit(0);
}
