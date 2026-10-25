import { describe, expect, it } from "vitest";
import brief from "../../../../docs/research/utdg-late19c-v0.1.json";
import {
  ConstructionGenerationInputSchema, ConstructionReferenceSnapshotSchema,
  type ConstructionGenerationInput
} from "../contracts/constructionGeneration";
import { captureConstructionGenerationSource, readConstructionGenerationSource } from "../core/constructionGenerationSource";
import { hashCanonicalJson } from "../core/contentHash";

function input(): ConstructionGenerationInput {
  return {
    schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: "authored-building",
    intent: {
      schemaVersion: "0.1.0", prompt: "Three-storey masonry building", requested: { floorCount: 3, bayCount: 4 },
      seeds: { family: "family", building: "building", material: "material", trim: "trim" },
      locks: [{ semanticPath: "construction/facade/count", scope: "building", lockedValue: 3, reason: "Keep height" }],
      psg: { traceId: "test-psg-trace", evaluatedVariables: { "building.floorCount": 3 } }
    },
    recipe: { id: "restrained-masonry-rectangular", version: "1", contentHash: "a".repeat(64) },
    reference: {
      schemaVersion: "0.1.0", kind: "construction-reference-snapshot",
      id: "buildo.late19c.demo", revision: "1",
      origin: { kind: "local-demo", locator: "docs/research/utdg-late19c-v0.1.json" },
      architectureCoverage: "unknown", coverageNotes: "Material research draft; architecture evidence not established.",
      claims: [{
        id: "demo-context", subject: "architecture", statement: "Local late-19c demonstration context.",
        sourceId: brief.id, locator: "docs/research/utdg-late19c-brief.md",
        basis: "demo", confidence: null, review: "unreviewed"
      }],
      materialBrief: structuredClone(brief) as ConstructionGenerationInput["reference"]["materialBrief"]
    },
    intentionalExceptions: [{ claimId: "demo-context", reason: "Artist chooses a demonstration interpretation." }]
  };
}

describe("construction generation source boundary", () => {
  it("retains real inputs, unknown coverage, locks, exceptions and the complete material brief across JSON reopening", async () => {
    const request = input(), source = await captureConstructionGenerationSource(request);
    const reopened = await readConstructionGenerationSource(JSON.parse(JSON.stringify(source)));
    expect(reopened).toEqual(source);
    expect(reopened.intent).toEqual(request.intent);
    expect(reopened.reference.materialBrief).toEqual(brief);
    expect(reopened.reference.architectureCoverage).toBe("unknown");
    expect(reopened.intentionalExceptions).toEqual(request.intentionalExceptions);
    expect("graph" in reopened).toBe(false);
    expect(source.referenceContentHash).toBe(await hashCanonicalJson(request.reference));
  });

  it("owns all request data before asynchronous hashing, including unknown PSG values and locked values", async () => {
    const request = input();
    request.intent.locks[0].lockedValue = { nested: { keep: 3 } };
    request.intent.psg.evaluatedVariables["opaque"] = { values: [1, 2] };
    const expected = structuredClone(request), pending = captureConstructionGenerationSource(request);
    request.intent.prompt = "mutated";
    (request.intent.locks[0].lockedValue as { nested: { keep: number } }).nested.keep = 99;
    (request.intent.psg.evaluatedVariables["opaque"] as { values: number[] }).values.push(99);
    request.reference.materialBrief.nodes[0].metersPerTile = 99;
    request.intentionalExceptions[0].reason = "mutated";
    const source = await pending;
    expect(source.intent).toEqual(expected.intent);
    expect(source.reference).toEqual(expected.reference);
    expect(source.intentionalExceptions).toEqual(expected.intentionalExceptions);
  });

  it("owns imported source before hashing and returns independent reopened values", async () => {
    const source = await captureConstructionGenerationSource(input()), expected = structuredClone(source);
    const pending = readConstructionGenerationSource(source);
    source.reference.materialBrief.nodes[0].generationHints.weathering = "mutated";
    source.intent.locks[0].lockedValue = 99;
    const reopened = await pending;
    expect(reopened).toEqual(expected);
    expect(await readConstructionGenerationSource(expected)).toEqual(expected);
    reopened.reference.claims[0].statement = "changed returned object";
    expect(expected.reference.claims[0].statement).not.toBe(reopened.reference.claims[0].statement);
  });

  it("produces stable hashes independently of object key insertion order", async () => {
    const request = input();
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
    expect(await captureConstructionGenerationSource(reverse(request))).toEqual(await captureConstructionGenerationSource(request));
  });

  it.each(["prompt", "seed", "lock", "recipe", "exception"] as const)("rejects stale full-source hashes after %s changes", async kind => {
    const source = await captureConstructionGenerationSource(input());
    if (kind === "prompt") source.intent.prompt += " altered";
    if (kind === "seed") source.intent.seeds.building += " altered";
    if (kind === "lock") source.intent.locks[0].lockedValue = 4;
    if (kind === "recipe") source.recipe.version = "2";
    if (kind === "exception") source.intentionalExceptions[0].reason += " altered";
    await expect(readConstructionGenerationSource(source)).rejects.toThrow(/source.*hash/i);
  });

  it("rejects altered reference data even if an attacker recomputes only the outer hash", async () => {
    const source = await captureConstructionGenerationSource(input());
    source.reference.materialBrief.nodes[0].metersPerTile = 4;
    const { contentHash: previousHash, ...payload } = source;
    expect(previousHash).toMatch(/^[a-f0-9]{64}$/);
    source.contentHash = await hashCanonicalJson(payload);
    await expect(readConstructionGenerationSource(source)).rejects.toThrow(/reference.*hash/i);
  });

  it("changes lineage for a reference weathering change without modifying requested structure or recipe identity", async () => {
    const request = input(), first = await captureConstructionGenerationSource(request);
    request.reference.materialBrief.nodes[0].generationHints.weathering = "rain-streak";
    const second = await captureConstructionGenerationSource(request);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.referenceContentHash).not.toBe(first.referenceContentHash);
    expect(second.intent).toEqual(first.intent);
    expect(second.recipe).toEqual(first.recipe);
  });

  it.each(["extra-root", "extra-intent", "extra-brief", "extra-node", "implicit-default"] as const)("rejects lossy or implicit admission: %s", kind => {
    const request = input();
    if (kind === "extra-root") Object.assign(request, { unexpected: true });
    if (kind === "extra-intent") Object.assign(request.intent, { unexpected: true });
    if (kind === "extra-brief") Object.assign(request.reference.materialBrief, { inventedEvidence: true });
    if (kind === "extra-node") Object.assign(request.reference.materialBrief.nodes[0], { inventedEvidence: true });
    if (kind === "implicit-default") delete (request.intent.locks[0] as { scope?: string }).scope;
    expect(ConstructionGenerationInputSchema.safeParse(request).success).toBe(false);
  });

  it.each(["accessor", "cycle", "prototype", "nan", "infinity", "undefined", "hole", "symbol"] as const)("rejects unsafe serialized input before executing getters: %s", kind => {
    const request = input(); let getterCalls = 0;
    if (kind === "accessor") Object.defineProperty(request.intent, "prompt", { get() { getterCalls++; return "getter"; }, enumerable: true });
    if (kind === "cycle") request.intent.locks[0].lockedValue = request;
    if (kind === "prototype") request.intent.locks[0].lockedValue = new Date();
    if (kind === "nan") request.intent.locks[0].lockedValue = NaN;
    if (kind === "infinity") request.reference.materialBrief.nodes[0].metersPerTile = Infinity;
    if (kind === "undefined") request.intent.locks[0].lockedValue = undefined;
    if (kind === "hole") request.intent.locks = new Array(1);
    if (kind === "symbol") Object.defineProperty(request, Symbol("hidden"), { value: true });
    expect(ConstructionGenerationInputSchema.safeParse(request).success).toBe(false);
    expect(getterCalls).toBe(0);
  });

  it.each(["duplicate-lock", "empty-lock", "missing-claim", "duplicate-exception", "duplicate-claim", "retired", "unknown-edge"] as const)("rejects inconsistent references: %s", kind => {
    const request = input();
    if (kind === "duplicate-lock") request.intent.locks.push(structuredClone(request.intent.locks[0]));
    if (kind === "empty-lock") request.intent.locks[0].semanticPath = " ";
    if (kind === "missing-claim") request.intentionalExceptions[0].claimId = "missing";
    if (kind === "duplicate-exception") request.intentionalExceptions.push(structuredClone(request.intentionalExceptions[0]));
    if (kind === "duplicate-claim") request.reference.claims.push(structuredClone(request.reference.claims[0]));
    if (kind === "retired") request.reference.materialBrief.status = "retired";
    if (kind === "unknown-edge") request.reference.materialBrief.edges.push({ from: "missing", to: "missing", relation: "pairs-with" });
    expect(ConstructionGenerationInputSchema.safeParse(request).success).toBe(false);
  });

  it.each(["coverage", "confidence", "basis", "review"] as const)("does not promote demo data into historical evidence: %s", kind => {
    const reference = input().reference;
    if (kind === "coverage") reference.architectureCoverage = "supported";
    if (kind === "confidence") reference.claims[0].confidence = 1;
    if (kind === "basis") reference.claims[0].basis = "observed";
    if (kind === "review") reference.claims[0].review = "reviewed";
    expect(ConstructionReferenceSnapshotSchema.safeParse(reference).success).toBe(false);
  });

  it("retains upstream provenance while requiring explicit reviewed architecture evidence for claimed coverage", async () => {
    const request = input();
    request.reference.origin = { kind: "utdg-snapshot", snapshotId: "pinned-snapshot", contentHash: "b".repeat(64), locator: "upstream/snapshot.json" };
    request.reference.architectureCoverage = "partial";
    expect(ConstructionGenerationInputSchema.safeParse(request).success).toBe(false);
    Object.assign(request.reference.claims[0], { basis: "observed", confidence: 0.6, review: "reviewed" });
    const source = await captureConstructionGenerationSource(request);
    expect((await readConstructionGenerationSource(source)).reference).toEqual(request.reference);
    for (const confidence of [null, 0]) {
      request.reference.claims[0].confidence = confidence;
      expect(ConstructionGenerationInputSchema.safeParse(request).success).toBe(false);
    }
  });
});
