import { exec, execSync } from "node:child_process";
import { type } from "node:os";
import config from "./config.js";
import getIp from "./getIp.js";

const args = process.argv.slice(2);
const platform = args.find((arg) => /(android|ios|browser)/i.test(arg)) || "android";
const isRelease = args.includes("--release") || args.includes("-r") || false;
const noServer = args.includes("--no-server");
// Bind and serve overrides, needed whenever the dev server is not reached over
// the LAN: a remote workstation (VS Code Remote port forwarding) wants
// `--host localhost --http`, and `--no-open` keeps a headless box from trying
// to launch a browser.
const hostOverride = getArgValue("--host") || process.env.SHELLULAR_DEV_HOST;
const portOverride = getArgValue("--port") || process.env.SHELLULAR_DEV_PORT;
const noHttps = args.includes("--http");
const noOpen = args.includes("--no-open");

const { default: start } = await import(`./${platform}/start.js`);

const GREEN = type() === "Windows_NT" ? "\x1b[32m" : "\x1b[92m";
const YELLOW = type() === "Windows_NT" ? "\x1b[33m" : "\x1b[93m";
const BLUE = type() === "Windows_NT" ? "\x1b[34m" : "\x1b[94m";
const NC = type() === "Windows_NT" ? "\x1b[0m" : "\x1b[39m";

try {
  config(isRelease ? "production" : "development");
  main();
} catch (error) {
  printToStdOut(error);
}

/**
 * Main function for starting the development server.
 * @returns {Promise<void>} A promise that resolves when the server is started.
 */
async function main() {
  let appRan = false;
  let command;
  let devServer = null;
  const buildsOnce = isRelease || noServer;

  if (isRelease) {
    command = `webpack --mode production --env platform=${platform}`;
  } else if (noServer) {
    command = `webpack --mode development --env platform=${platform}`;
  } else {
    const host = hostOverride || getIp();
    const port = portOverride || getPort();
    const protocol = platform === "browser" && !noHttps ? "https" : "http";
    devServer = { host, port, protocol, open: !noOpen };
    command = `webpack serve --mode development --env platform=${platform} host=${host} port=${port}${noHttps ? " https=false" : ""}`;
  }

  console.log(command);
  console.log(`${YELLOW}-> Compiling console using${NC} ${BLUE}webpack${NC}`);
  execSync(`webpack --mode production --env console=true --env platform=${platform}`);
  console.log(`${YELLOW}-> Building assets using${NC} ${BLUE}webpack${NC}`);
  const webpack = exec(command);

  let webpackMuted = false;

  webpack.stdout.on("data", (chunk) => {
    if (!webpackMuted) process.stdout.write(chunk);
    tryStartApp(chunk);
  });

  webpack.stderr.on("data", (chunk) => {
    if (!webpackMuted) process.stderr.write(chunk);
    tryStartApp(chunk);
  });

  function tryStartApp(chunk) {
    if (appRan) {
      return;
    }
    // For android/ios, wait until the first successful compilation so the
    // bundle with the current port is on disk before installing the APK.
    // For one-shot builds, also wait for a real compile before starting.
    // For browser dev server, any output is fine because the browser can wait.
    const needsBundle = platform === "android" || platform === "ios" || buildsOnce;
    if (needsBundle && !chunk.includes("compiled successfully")) {
      return;
    }
    startApp();
  }

  function startApp() {
    if (appRan) {
      return;
    }
    appRan = true;
    webpackMuted = true;
    console.log(`${GREEN}-> Starting ${platform} app${NC}`);
    start(devServer, () => {
      webpackMuted = false;
    });
  }

  webpack.on("error", (error) => {
    console.error(`${YELLOW}-> Error starting webpack${NC}`);
    process.stderr.write(error.toString());
    process.exit(1);
  });

  webpack.on("close", (code) => {
    if (code && code !== 0) {
      console.error(`${YELLOW}-> Webpack exited with code ${code}${NC}`);
      process.exit(code);
    }

    if (buildsOnce) {
      startApp();
    }
  });

  // when app is closed, kill the webpack process
  process.on("exit", () => {
    webpack.kill();
  });
}

/**
 * Prints the output to standard output and standard error.
 * @param {Error} error - The error object, if any.
 * @param {string} stdout - The standard output.
 * @param {string} stderr - The standard error.
 */
function printToStdOut(error, stdout, stderr) {
  if (error) {
    process.stderr.write(error.toString());
    process.exit(1);
  }

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
}

/**
 * Reads the value of a `--flag value` or `--flag=value` argument.
 * @param {string} flag - The flag to look for.
 * @returns {string|undefined} The value, or undefined when the flag is absent.
 */
function getArgValue(flag) {
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function getPort() {
  if (platform === "browser") {
    return 7977;
  }

  return Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
}
