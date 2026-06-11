import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export default function config(mode = "development", platform = "android") {
  let babelrc;
  const babelrcPath = resolve(process.cwd(), ".babelrc");

  try {
    if (existsSync(babelrcPath)) {
      babelrc = JSON.parse(readFileSync(babelrcPath, "utf8"));
    }
  } catch (_error) {
    babelrc = null;
  }

  if (!babelrc) {
    return;
  }

  if (mode === "development") {
    babelrc.presets = [];
    babelrc.compact = false;
  } else {
    if (platform === "android") {
      babelrc.presets = ["@babel/preset-env"];
    }
    babelrc.compact = true;
  }

  if (babelrc) {
    babelrc = JSON.stringify(babelrc, undefined, 2);
    writeFileSync(babelrcPath, babelrc, "utf8");
  }
}
