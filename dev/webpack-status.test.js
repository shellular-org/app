import { describe, expect, it } from "vitest";
import { createWebpackCompilationDetector, isSuccessfulWebpackCompilation } from "./webpack-status.js";

describe("webpack compilation status", () => {
  it.each(["compiled successfully", "compiled with 1 warning", "compiled with 3 warnings"])(
    "accepts a successful summary: %s",
    (summary) => {
      expect(isSuccessfulWebpackCompilation(`webpack 5.106.2 ${summary} in 100 ms`)).toBe(true);
    },
  );

  it.each(["compiled with 1 error", "compiled with 4 errors"])("rejects a failed summary: %s", (summary) => {
    expect(isSuccessfulWebpackCompilation(`webpack 5.106.2 ${summary} in 100 ms`)).toBe(false);
  });

  it("detects a summary split across output chunks", () => {
    const detectCompilation = createWebpackCompilationDetector();

    expect(detectCompilation("webpack compiled with 2 war")).toBe(false);
    expect(detectCompilation("nings in 100 ms")).toBe(true);
  });

  it("uses the latest complete compilation summary", () => {
    expect(isSuccessfulWebpackCompilation("compiled successfully\ncompiled with 1 error")).toBe(false);
  });
});
