const COMPILATION_SUMMARY = /\bcompiled (?:successfully|with \d+ (?:warnings?|errors?))\b/gi;

export function isSuccessfulWebpackCompilation(output) {
  const summaries = [...String(output).matchAll(COMPILATION_SUMMARY)];
  const latest = summaries.at(-1)?.[0];

  return Boolean(latest && !/errors?/i.test(latest));
}

export function createWebpackCompilationDetector() {
  let recentOutput = "";

  return (chunk) => {
    recentOutput = `${recentOutput}${String(chunk)}`.slice(-1024);
    return isSuccessfulWebpackCompilation(recentOutput);
  };
}
