import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareR1PrimaryWallMaterialDelta } from "./diagnostics/r1-primary-wall-material-proof.mjs";

const root = process.cwd();
assert(process.argv[2] && process.argv[3], "Provide an exclusive material-delta JSON path and the intended capture packet ID.");
const outputFile = path.resolve(process.argv[2]);
const relative = path.relative(root, outputFile);
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "The selected material baseline must stay inside the repository.");
try { await access(outputFile); throw new Error("Refusing to overwrite an explicit selected-material baseline."); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const report = await prepareR1PrimaryWallMaterialDelta({ root, packetId: process.argv[3],
  ...(process.argv[4] ? { producerCheckpointPath: process.argv[4] } : {}) });
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ outputFile, packetId: report.packetId, baseline: report.baseline,
  before: report.before, after: report.after, immutable: report.immutable }, null, 2));
