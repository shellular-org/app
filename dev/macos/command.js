import { spawn } from "node:child_process";

export class CommandExecutionError extends Error {
  constructor(command, args, code, stdout, stderr) {
    const detail = stderr.trim() || stdout.trim();
    super(`${command} exited with code ${code}${detail ? `: ${detail}` : ""}`);
    this.name = "CommandExecutionError";
    this.command = command;
    this.args = args;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function runCommand(command, args, options = {}) {
  const { capture = false, cwd, env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", (error) => {
      reject(new CommandExecutionError(command, args, "unavailable", stdout, stderr || error.message));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new CommandExecutionError(command, args, code, stdout, stderr));
    });
  });
}
