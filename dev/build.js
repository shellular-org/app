import { execFileSync } from "node:child_process";
import { type } from "node:os";
import { parseBuildArgs } from "./build-args.js";
import config from "./config.js";

let buildOptions;
try {
  buildOptions = parseBuildArgs(process.argv.slice(2));
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}

const { platform, packageType } = buildOptions;
config("production");

const { default: build } = await import(`./${platform}/build.js`);

const RED = type() === "Windows_NT" ? "\x1b[31m" : "\x1b[91m";
const BLUE = type() === "Windows_NT" ? "\x1b[34m" : "\x1b[94m";
const GREEN = type() === "Windows_NT" ? "\x1b[32m" : "\x1b[92m";
const YELLOW = type() === "Windows_NT" ? "\x1b[33m" : "\x1b[93m";
const NC = type() === "Windows_NT" ? "\x1b[0m" : "\x1b[39m";

(async () => {
  try {
    console.log(`\n${YELLOW}pnpm install${NC}`);
    execFileSync("pnpm", ["install"], { stdio: "inherit" });

    console.log(`${YELLOW}webpack --progress --mode production --env platform=${platform}${NC}`);
    execFileSync("webpack", ["--progress", "--mode", "production", "--env", `platform=${platform}`], { stdio: "inherit" });
    console.log(`${YELLOW}-> Compiling console using${NC} ${BLUE}webpack${NC}`);
    execFileSync("webpack", ["--mode", "production", "--env", "console=true", "--env", `platform=${platform}`], { stdio: "inherit" });
    console.log(`${GREEN}-> Console compiled successfully${NC}`);

    console.log(`${YELLOW}Building for ${platform}...${NC}`);
    await build({ packageType });
    console.log(`${GREEN}Build completed successfully${NC}`);
  } catch (error) {
    console.error(error);
    console.error(`${RED}Build failed: ${error?.message || error || "Unknown error"}${NC}`);
    process.exit(1);
  }

  process.exit(0);
})();
