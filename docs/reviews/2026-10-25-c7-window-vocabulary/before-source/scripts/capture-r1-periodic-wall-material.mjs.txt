import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareR1PeriodicWallMaterialDelta } from "./diagnostics/r1-primary-wall-periodic-proof.mjs";

const root = process.cwd();
assert(process.argv[2] && process.argv[3] && process.argv.length <= 5,
  "Provide an exclusive periodic material-delta JSON path, capture packet ID, and optional frozen byte checkpoint path.");
const outputFile = path.resolve(process.argv[2]), relative = path.relative(root, outputFile);
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Periodic material baseline must stay inside the repository.");
try { await access(outputFile); throw new Error("Refusing to overwrite a periodic material baseline."); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const report = await prepareR1PeriodicWallMaterialDelta({ root, packetId: process.argv[3],
  ...(process.argv[4] ? { beforeCheckpointPath: process.argv[4] } : {}) });
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ outputFile, packetId: report.packetId, baseline: report.baseline,
  before: report.before, after: report.after, immutable: report.immutable, coverageFieldMeans: report.coverageFieldMeans }, null, 2));
