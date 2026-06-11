import { clearLine, createInterface, moveCursor } from "node:readline";

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.input.on("keypress", () => {
  const { line, muted } = readline;
  if (!muted) {
    return;
  }

  moveCursor(readline.output, -line.length, 0);
  clearLine(readline.output, 1);
  readline.output.write(line.replace(/./g, "*"));
});

export default async function getUserInput(question, mute = false) {
  readline.muted = mute;
  readline.setPrompt(`${question}> `);
  readline.prompt();
  return new Promise((resolve) => {
    const listener = (line) => {
      resolve(line);
      readline.removeListener("line", listener);
    };
    readline.on("line", listener);
  });
}

export function closeInput() {
  try {
    // Remove listeners and close the interface to release TTY handles on Windows
    readline.removeAllListeners("line");
    readline.input?.removeAllListeners?.("keypress");
    if (!readline.closed) {
      readline.close();
    }
  } catch {
    // no-op
  }
}
