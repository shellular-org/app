import { execSync } from "node:child_process";
import { type } from "node:os";
import config from "./config.js";

config("production");

const args = process.argv.slice(2);
const platform = args.find((arg) => /(android|ios|browser)/i.test(arg));

if (!platform) {
  console.error("Please specify a platform: android, ios, or browser");
  process.exit(1);
}

const { default: build } = await import(`./${platform}/build.js`);

const RED = type() === "Windows_NT" ? "\x1b[31m" : "\x1b[91m";
const BLUE = type() === "Windows_NT" ? "\x1b[34m" : "\x1b[94m";
const GREEN = type() === "Windows_NT" ? "\x1b[32m" : "\x1b[92m";
const YELLOW = type() === "Windows_NT" ? "\x1b[33m" : "\x1b[93m";
const NC = type() === "Windows_NT" ? "\x1b[0m" : "\x1b[39m";

const buildCommand = `webpack --progress --mode production --env platform=${platform}`;

(async () => {
  try {
    // run pnpm install
    console.log(`\n${YELLOW}pnpm install${NC}`);
    execSync("pnpm install", { stdio: "inherit" });

    console.log(`${YELLOW}${buildCommand}${NC}`);
    execSync(buildCommand, { stdio: "inherit" });
    console.log(`${YELLOW}-> Compiling console using${NC} ${BLUE}webpack${NC}`);
    execSync(`webpack --mode production --env console=true --env platform=${platform}`);
    console.log(`${GREEN}-> Console compiled successfully${NC}`);

    console.log(`${YELLOW}Building for ${platform}...${NC}`);
    await build();
    console.log(`${GREEN}Build completed successfully${NC}`);
  } catch (error) {
    console.error(error);
    console.error(`${RED}Build failed: ${error?.message || error || "Unknown error"}${NC}`);
    process.exit(1);
  }

  process.exit(0);
})();
