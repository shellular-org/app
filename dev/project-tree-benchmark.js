import { performance } from "node:perf_hooks";
import { preparePresortedFileTreeInput } from "@pierre/trees";

const directoryCount = 100;
const filesPerDirectory = 1_000;
const rootPaths = Array.from({ length: directoryCount }, (_, index) => `folder-${String(index).padStart(3, "0")}/`);
const repositoryPaths = rootPaths.flatMap((directory) => [
  directory,
  ...Array.from({ length: filesPerDirectory }, (_, index) => `${directory}file-${String(index).padStart(4, "0")}.ts`),
]);

if (repositoryPaths.length !== 100_100) {
  throw new Error(`Expected 100,100 deterministic paths, got ${repositoryPaths.length}`);
}

preparePresortedFileTreeInput(rootPaths);
const iterations = 20;
const started = performance.now();
for (let index = 0; index < iterations; index += 1) {
  preparePresortedFileTreeInput(rootPaths);
}
const averageMs = (performance.now() - started) / iterations;

console.log(
  `Lazy project explorer: ${rootPaths.length} root entries from a ${repositoryPaths.length.toLocaleString()}-path repository in ${averageMs.toFixed(2)}ms average.`,
);
if (averageMs >= 50) {
  throw new Error(`Root preparation exceeded the 50ms budget (${averageMs.toFixed(2)}ms).`);
}
