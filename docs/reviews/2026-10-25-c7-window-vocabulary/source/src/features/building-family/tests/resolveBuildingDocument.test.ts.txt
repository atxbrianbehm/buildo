import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { BuildingDocumentSchema, type BuildingDocumentResolution } from '../contracts/buildingDocument';
import { BuildingIntentSchema } from '../contracts/buildingIntent';
import { HistoricalStylePackSchema } from '../contracts/historicalStylePack';
import { hashCanonicalJson } from '../core/contentHash';
import { resolveBuildingDocument } from '../core/resolveBuildingDocument';
import { normalizeBuildingSpec } from '../core/specNormalizer';
import stylePackInput from '../style-packs/late-19c-commercial-demo.json';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

async function fixture() {
  const intent = BuildingIntentSchema.parse({
    schemaVersion: '0.1.0', prompt: 'four floor brick commercial block',
    stylePackId: 'late-19c-commercial-demo',
    requested: {
      floorCount: 4, bayCount: 4, wallMaterial: 'brick-red', roofType: 'flat',
      trimDensity: 'ornate', windowFamily: 'tall-arched', corniceFamily: 'bracketed-metal',
    },
    seeds: { family: 'fam', building: 'building-seed', material: 'mat', trim: 'trim' },
    locks: [], psg: { evaluatedVariables: {}, traceId: 'building-document-test' },
  });
  const stylePack = HistoricalStylePackSchema.parse(clone(stylePackInput));
  const document = BuildingDocumentSchema.parse({
    schemaVersion: '0.1.0', documentId: 'building/authored-test', revision: 0,
    intentRef: { contentHash: await hashCanonicalJson(intent) },
    stylePackRef: { stylePackId: stylePack.id, contentHash: await hashCanonicalJson(stylePack) },
    seeds: clone(intent.seeds), authored: {}, locks: [],
  });
  return { document, intent, stylePack };
}

async function repin(input: Awaited<ReturnType<typeof fixture>>) {
  input.document.intentRef.contentHash = await hashCanonicalJson(input.intent);
  input.document.stylePackRef.contentHash = await hashCanonicalJson(input.stylePack);
}

function resolved(receipt: BuildingDocumentResolution) {
  expect(receipt.status).toBe('resolved');
  if (receipt.status !== 'resolved') throw new Error(JSON.stringify(receipt.diagnostics));
  return receipt;
}

function rejected(receipt: BuildingDocumentResolution, code: string, path: string) {
  expect(receipt.status).toBe('rejected');
  expect(receipt.diagnostics).toContainEqual(expect.objectContaining({ code, path }));
  for (const key of ['spec', 'intentHash', 'stylePackHash', 'resolvedSpecHash']) {
    expect(Object.hasOwn(receipt, key)).toBe(false);
  }
  return receipt;
}

describe('resolveBuildingDocument', () => {
  it.each(['ordinary', 'clamped proposal', 'declared optional undefined'])('preserves the full legacy result with empty authored overrides: %s', async (kind) => {
    const input = await fixture();
    if (kind === 'clamped proposal') input.intent.requested.floorCount = 15;
    if (kind === 'declared optional undefined') input.document.authored = { bayCount: undefined, windowFamily: undefined };
    await repin(input);
    const legacy = await normalizeBuildingSpec(input.intent, input.stylePack);
    const receipt = resolved(await resolveBuildingDocument(input));
    expect(receipt.spec).toEqual(legacy.spec);
    expect(receipt.diagnostics).toEqual(legacy.diagnostics);
    expect(receipt.authoredFields).toEqual([]);
    expect(receipt.intentHash).toBe(input.document.intentRef.contentHash);
    expect(receipt.resolvedSpecHash).toBe(await hashCanonicalJson(legacy.spec));
  });

  it('binds original references before projecting document seeds and current component-lock metadata', async () => {
    const input = await fixture();
    input.document.seeds.building = 'building-seed-variant-07';
    input.document.locks = [{
      semanticPath: 'component/window.frame', scope: 'building',
      lockedValue: { componentKey: 'window.frame' }, reason: 'Retain the authored component',
    }];
    const effective = { ...input.intent, seeds: input.document.seeds, locks: input.document.locks };
    const expected = await normalizeBuildingSpec(effective, input.stylePack);
    const receipt = resolved(await resolveBuildingDocument(input));
    expect(receipt.spec).toEqual(expected.spec);
    expect(receipt.intentHash).toBe(await hashCanonicalJson(input.intent));
    expect(receipt.spec.sourceIntentHash).toBe(await hashCanonicalJson(effective));
    expect(receipt.spec.sourceIntentHash).not.toBe(receipt.intentHash);
    expect(receipt.spec.locks).toEqual(input.document.locks);
    expect(receipt.spec.selectedFamilies.window).toBe('tall-rectangular');
  });

  it('derives correlated bay/floor/roof values from authored intent, then preserves all six explicit choices', async () => {
    const input = await fixture();
    input.document.seeds.building = 'building-seed-variant-07';
    input.document.authored = {
      floorCount: 5, bayCount: 7, roofType: 'gable', trimDensity: 'restrained',
      windowFamily: 'tall-arched', corniceFamily: 'bracketed-metal',
    };
    const effective = {
      ...input.intent, seeds: input.document.seeds, locks: input.document.locks,
      requested: { ...input.intent.requested, ...input.document.authored },
    };
    const expected = await normalizeBuildingSpec(effective, input.stylePack);
    const receipt = resolved(await resolveBuildingDocument(input));
    expect(receipt.spec).toEqual({
      ...expected.spec,
      selectedFamilies: { ...expected.spec.selectedFamilies, window: 'tall-arched' },
    });
    expect(receipt.spec.facade.frontBayCount).toBe(7);
    expect(receipt.spec.componentParameters.requestedBayCount).toBe(7);
    expect(receipt.spec.massing.floorCount).toBe(5);
    expect(receipt.spec.massing.floorHeightsM).toHaveLength(5);
    expect(receipt.spec.massing.roof.type).toBe('gable');
    expect(receipt.spec.componentParameters.trimDensity).toBe('restrained');
    expect(receipt.authoredFields).toEqual(['floorCount', 'bayCount', 'roofType', 'trimDensity', 'windowFamily', 'corniceFamily']);
    expect(receipt.spec.sourceIntentHash).toBe(await hashCanonicalJson(effective));
  });

  it('keeps the authored window after the seed proposal without changing family/material lineage or unrelated variation', async () => {
    const input = await fixture();
    input.intent.seeds.building = 'building-seed-variant-07';
    input.document.seeds = clone(input.intent.seeds);
    await repin(input);
    const proposal = resolved(await resolveBuildingDocument(input));
    expect(proposal.spec.selectedFamilies.window).toBe('tall-rectangular');
    input.document.authored = { windowFamily: 'tall-arched' };
    const authored = resolved(await resolveBuildingDocument(input));
    expect(authored.spec.selectedFamilies.window).toBe('tall-arched');
    expect(authored.spec.familyId).toBe(proposal.spec.familyId);
    expect(authored.spec.materialParameters).toEqual(proposal.spec.materialParameters);
    expect(authored.spec.componentParameters).toEqual(proposal.spec.componentParameters);
    expect(authored.spec.massing).toEqual(proposal.spec.massing);
    expect(authored.spec.facade).toEqual(proposal.spec.facade);
    expect(authored.spec.variationPolicy).toEqual(proposal.spec.variationPolicy);
  });

  it.each([
    { field: 'bayCount' as const, value: 11 },
    { field: 'floorCount' as const, value: 15 },
    { field: 'windowFamily' as const, value: 'unavailable-window' },
    { field: 'corniceFamily' as const, value: 'unavailable-cornice' },
  ])('rejects unsupported explicit $field instead of accepting a normalized substitute', async ({ field, value }) => {
    const input = await fixture();
    input.document.authored = { [field]: value };
    rejected(await resolveBuildingDocument(input), 'document.authoredConstraint', `authored.${field}`);
  });

  it('rejects an explicit roof/material dependency conflict rather than returning the legacy fallback', async () => {
    const input = await fixture();
    input.intent.requested.wallMaterial = 'painted-stucco';
    input.intent.requested.roofType = 'gable';
    await repin(input);
    const legacy = await normalizeBuildingSpec(input.intent, input.stylePack);
    expect(legacy.spec.massing.roof.type).toBe('flat');
    expect(legacy.diagnostics).toContainEqual(expect.objectContaining({ code: 'spec.incompatibleCombination' }));
    input.document.authored = { roofType: 'gable' };
    rejected(await resolveBuildingDocument(input), 'document.authoredConflict', 'authored.roofType');
  });

  it('accepts a valid authored bay count while retaining unrelated legacy proposal warnings', async () => {
    const input = await fixture();
    input.intent.requested.floorCount = 15;
    input.document.authored = { bayCount: 7 };
    await repin(input);
    const receipt = resolved(await resolveBuildingDocument(input));
    expect(receipt.spec.facade.frontBayCount).toBe(7);
    expect(receipt.spec.massing.floorCount).toBe(8);
    expect(receipt.diagnostics).toContainEqual(expect.objectContaining({ code: 'spec.clamped', path: 'requested.floorCount' }));
  });

  it.each(['intentRef.contentHash', 'stylePackRef.stylePackId', 'stylePackRef.contentHash'])('rejects a mismatched original dependency reference: %s', async (path) => {
    const input = await fixture();
    if (path === 'intentRef.contentHash') input.intent.prompt += ' changed';
    else if (path === 'stylePackRef.stylePackId') input.document.stylePackRef.stylePackId = 'another-pack';
    else input.document.stylePackRef.contentHash = '0'.repeat(64);
    rejected(await resolveBuildingDocument(input), 'document.referenceMismatch', path);
  });

  it('is deterministic across repeated resolution and full JSON roundtrips', async () => {
    const input = await fixture();
    input.document.authored = { bayCount: 7, windowFamily: 'tall-arched' };
    input.document.seeds.building = 'building-seed-variant-07';
    const first = resolved(await resolveBuildingDocument(input));
    const repeated = await resolveBuildingDocument(input);
    const roundtripped = await resolveBuildingDocument(clone(input));
    expect(repeated).toEqual(first);
    expect(roundtripped).toEqual(first);
    expect(first.documentHash).toBe(await hashCanonicalJson(input.document));
    expect(first.stylePackHash).toBe(await hashCanonicalJson(input.stylePack));
    expect(first.resolvedSpecHash).toBe(await hashCanonicalJson(first.spec));
  });

  it('snapshots document and dependency payloads before the first asynchronous hash', async () => {
    const input = await fixture();
    const nestedProposal = { detail: { height: 4 } };
    input.intent.psg.evaluatedVariables.proposal = nestedProposal;
    input.document.authored = { bayCount: 7 };
    await repin(input);
    const pinned = clone(input);
    const baseline = resolved(await resolveBuildingDocument(pinned));
    const pending = resolveBuildingDocument(input);
    nestedProposal.detail.height = 999;
    input.stylePack.id = 'changed-after-resolution-started';
    input.document.authored.bayCount = 11;
    input.document.seeds.building = 'changed-after-resolution-started';
    const receipt = resolved(await pending);
    expect(receipt).toEqual(baseline);
    expect(receipt.documentHash).toBe(await hashCanonicalJson(pinned.document));
    expect(receipt.intentHash).toBe(await hashCanonicalJson(pinned.intent));
    expect(receipt.stylePackHash).toBe(await hashCanonicalJson(pinned.stylePack));
  });

  it.each(['resolved', 'rejected'])('does not mutate frozen document, intent or style inputs on the %s path', async (status) => {
    const input = await fixture();
    input.document.authored = { bayCount: status === 'resolved' ? 7 : 11 };
    const before = clone(input);
    freeze(input);
    const receipt = await resolveBuildingDocument(input);
    expect(receipt.status).toBe(status);
    expect(input).toEqual(before);
  });

  it.each([
    { name: 'function', make: () => (() => true) },
    { name: 'unknown undefined', make: () => ({ bad: undefined }) },
    { name: 'BigInt', make: () => BigInt(1) },
    { name: 'Date', make: () => new Date('2026-10-14T00:00:00Z') },
    { name: 'Map', make: () => new Map([['key', 1]]) },
    { name: 'typed array', make: () => new Uint8Array([1]) },
    { name: 'Array subclass', make: () => new (class extends Array<number> {})(1, 2) },
    { name: 'array hole', make: () => new Array(1) },
    { name: 'cycle', make: () => { const value: { self?: unknown } = {}; value.self = value; return value; } },
  ])('rejects safe-shape unsafe JSON before dependency hashing: $name', async ({ make }) => {
    const input = await fixture();
    input.intent.psg.evaluatedVariables.payload = make();
    const receipt = await resolveBuildingDocument(input);
    expect(receipt.status).toBe('rejected');
    expect(receipt.diagnostics).toContainEqual(expect.objectContaining({ code: 'document.nonJsonDependency', path: expect.stringMatching(/^intent\./) }));
    for (const key of ['spec', 'intentHash', 'stylePackHash', 'resolvedSpecHash']) expect(Object.hasOwn(receipt, key)).toBe(false);
  });

  it('rejects non-JSON legacy lock payloads before hashing the original intent', async () => {
    const input = await fixture();
    input.intent.locks = [{
      semanticPath: 'component/window.frame', scope: 'building',
      lockedValue: { unsupported: BigInt(1) },
    }];
    const receipt = await resolveBuildingDocument(input);
    expect(receipt.status).toBe('rejected');
    expect(receipt.diagnostics).toContainEqual(expect.objectContaining({
      code: 'document.nonJsonDependency', path: expect.stringMatching(/^intent\.locks/),
    }));
    for (const key of ['spec', 'intentHash', 'stylePackHash', 'resolvedSpecHash']) expect(Object.hasOwn(receipt, key)).toBe(false);
  });

  it('retains Zod errors for JSON-safe shape-invalid document and dependency inputs', async () => {
    const input = await fixture();
    await expect(resolveBuildingDocument({ ...input, document: { ...input.document, revision: -1 } })).rejects.toBeInstanceOf(ZodError);
    await expect(resolveBuildingDocument({ ...input, intent: { ...input.intent, prompt: 123 } })).rejects.toBeInstanceOf(ZodError);
  });
});
