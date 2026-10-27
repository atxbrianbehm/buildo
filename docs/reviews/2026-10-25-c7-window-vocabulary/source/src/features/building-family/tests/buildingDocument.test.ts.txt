import { describe, expect, it, vi } from 'vitest';
import {
  BUILDING_DOCUMENT_RESOLVER_VERSION,
  BuildingDocumentResolutionSchema,
  BuildingDocumentSchema,
  BuildingWindowSlotAddressSchema,
  type BuildingWindowSlotAddress,
} from '../contracts/buildingDocument';
import { normalizeBuildingSpec } from '../core/specNormalizer';
import stylePack from '../style-packs/late-19c-commercial-demo.json';

const sha = 'a'.repeat(64);
const lock = {
  semanticPath: 'component/window.frame',
  scope: 'building' as const,
  lockedValue: { componentKey: 'window.frame' },
  reason: 'Keep the authored component',
};

function documentInput() {
  return {
    schemaVersion: '0.1.0',
    documentId: 'building/document-test',
    revision: 0,
    intentRef: { contentHash: sha },
    stylePackRef: { stylePackId: stylePack.id, contentHash: sha },
    seeds: { family: 'fam', building: 'building-seed', material: 'mat', trim: 'trim' },
    authored: {},
    locks: [],
  };
}

function rejectedReceipt() {
  return {
    schemaVersion: '0.1.0',
    resolverVersion: BUILDING_DOCUMENT_RESOLVER_VERSION,
    status: 'rejected',
    documentId: 'building/document-test',
    revision: 0,
    documentHash: sha,
    authoredFields: [],
    diagnostics: [{ code: 'document.referenceMismatch', severity: 'error', message: 'Pinned input differs.' }],
  };
}

describe('BuildingDocumentSchema', () => {
  it('roundtrips the six supported authored fields and current component-lock metadata', () => {
    const input = {
      ...documentInput(),
      revision: 3,
      authored: {
        floorCount: 5, bayCount: 7, roofType: 'gable', trimDensity: 'restrained',
        windowFamily: 'tall-arched', corniceFamily: 'bracketed-metal',
      },
      locks: [lock],
    };
    const parsed = BuildingDocumentSchema.parse(input);
    expect(BuildingDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(parsed.authored.bayCount).toBe(7);
    expect(parsed.locks).toEqual([lock]);
  });

  it('requires explicit authored/locks containers while permitting empty overrides', () => {
    expect(BuildingDocumentSchema.parse(documentInput()).authored).toEqual({});
    const withoutAuthored = Object.fromEntries(Object.entries(documentInput()).filter(([key]) => key !== 'authored'));
    const withoutLocks = Object.fromEntries(Object.entries(documentInput()).filter(([key]) => key !== 'locks'));
    expect(BuildingDocumentSchema.safeParse(withoutAuthored).success).toBe(false);
    expect(BuildingDocumentSchema.safeParse(withoutLocks).success).toBe(false);
  });

  it.each([
    { floorCount: 3.5 }, { bayCount: 0 }, { roofType: 'hip' }, { windowFamily: '' },
  ])('rejects malformed authored values: %j', (authored) => {
    expect(BuildingDocumentSchema.safeParse({ ...documentInput(), authored }).success).toBe(false);
  });

  it.each([
    { ...documentInput(), schemaVersion: '0.2.0' },
    { ...documentInput(), revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...documentInput(), intentRef: { contentHash: sha.toUpperCase() } },
    { ...documentInput(), authored: { massing: { widthM: 30 } } },
    { ...documentInput(), graph: { nodes: [] } },
  ])('rejects unsupported version, reference or authoring payloads', (input) => {
    expect(BuildingDocumentSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { locks: [{ ...lock, semanticPath: 'component/door.frame' }] },
    { locks: [lock, lock] },
    { locks: [{ ...lock, scope: 'element', lockedValue: { family: 'tall-arched' } }] },
  ])('rejects inconsistent, duplicate or unsupported locks', ({ locks }) => {
    expect(BuildingDocumentSchema.safeParse({ ...documentInput(), locks }).success).toBe(false);
  });
});

describe('BuildingDocumentResolutionSchema', () => {
  it('keeps resolved and rejected receipts strict and JSON-roundtrippable', async () => {
    const rejected = rejectedReceipt();
    expect(BuildingDocumentResolutionSchema.parse(JSON.parse(JSON.stringify(rejected)))).toEqual(rejected);
    expect(BuildingDocumentResolutionSchema.safeParse({ ...rejected, intentHash: sha }).success).toBe(false);
    expect(BuildingDocumentResolutionSchema.safeParse({ ...rejected, spec: {} }).success).toBe(false);
    const { spec } = await normalizeBuildingSpec({
      schemaVersion: '0.1.0', prompt: 'A brick commercial building',
      requested: { floorCount: 4, bayCount: 4, wallMaterial: 'brick-red', roofType: 'flat' },
      seeds: documentInput().seeds, locks: [], psg: { evaluatedVariables: {}, traceId: 'document-schema-test' },
    }, stylePack);
    const resolved = {
      ...rejected, status: 'resolved', diagnostics: [], intentHash: sha,
      stylePackHash: sha, resolvedSpecHash: sha, spec,
    };
    expect(BuildingDocumentResolutionSchema.parse(resolved).status).toBe('resolved');
    const missingHash = Object.fromEntries(Object.entries(resolved).filter(([key]) => key !== 'resolvedSpecHash'));
    expect(BuildingDocumentResolutionSchema.safeParse(missingHash).success).toBe(false);
  });

  it.each([
    { received: { bad: undefined } },
    { received: () => 'unsafe' },
    { received: new Date('2026-10-14T00:00:00Z') },
    { received: Number.POSITIVE_INFINITY },
    { allowedValues: [undefined] },
    { allowedValues: [{ bad: () => true }] },
  ])('rejects non-JSON payloads at the standalone diagnostic receipt boundary', (payload) => {
    const receipt = rejectedReceipt();
    receipt.diagnostics = [{ ...receipt.diagnostics[0], ...payload }];
    expect(BuildingDocumentResolutionSchema.safeParse(receipt).success).toBe(false);
  });
});

describe('R3.P2 BuildingWindowSlotAddressSchema', () => {
  const address = () => ({ schemaVersion: '0.1.0', facade: 'front', floorIndex: 0, bayIndex: 0 });

  it.each(['front', 'rear', 'left', 'right'])('accepts %s and the complete nonnegative safe-integer boundary', (facade) => {
    for (const floorIndex of [0, Number.MAX_SAFE_INTEGER]) {
      for (const bayIndex of [0, Number.MAX_SAFE_INTEGER]) {
        const input = { ...address(), facade, floorIndex, bayIndex };
        expect(BuildingWindowSlotAddressSchema.parse(input)).toEqual(input);
      }
    }
  });

  it.each([
    undefined, null, false, [], 'front',
    {}, { ...address(), schemaVersion: '0.2.0' }, { ...address(), facade: 'Front' },
    { ...address(), facade: 'roof' }, { ...address(), floorIndex: undefined },
    { ...address(), bayIndex: undefined },
  ])('rejects malformed shapes, missing fields, unknown facades and unsupported versions: %j', (input) => {
    expect(BuildingWindowSlotAddressSchema.safeParse(input).success).toBe(false);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0', null, true, 0n])('rejects invalid indices without coercion: %s', (index) => {
    expect(BuildingWindowSlotAddressSchema.safeParse({ ...address(), floorIndex: index }).success).toBe(false);
    expect(BuildingWindowSlotAddressSchema.safeParse({ ...address(), bayIndex: index }).success).toBe(false);
  });

  it.each(['documentId', 'familyId', 'moduleId', 'semanticPath', 'instanceIndex', 'recipeId'])('rejects competing identity field %s, including undefined extras', (field) => {
    expect(BuildingWindowSlotAddressSchema.safeParse({ ...address(), [field]: 'not-address-authority' }).success).toBe(false);
    expect(BuildingWindowSlotAddressSchema.safeParse({ ...address(), [field]: undefined }).success).toBe(false);
  });

  it('rejects nonplain, symbol and nonenumerable payloads before schema property reads', () => {
    class AddressRecord { schemaVersion = '0.1.0'; facade = 'front'; floorIndex = 0; bayIndex = 0; }
    const inherited = Object.assign(Object.create({ owner: 'external' }), address());
    const symbolKey = { ...address(), [Symbol('hidden-owner')]: 1 };
    const symbolValue = { ...address(), facade: Symbol('front') };
    const nonenumerable = Object.defineProperty(address(), 'extra', { value: 1, enumerable: false });
    for (const input of [new AddressRecord(), inherited, new Date(), new Map(), symbolKey, symbolValue, nonenumerable]) {
      expect(BuildingWindowSlotAddressSchema.safeParse(input).success).toBe(false);
    }
    for (const field of ['floorIndex', 'extra']) {
      const getter = vi.fn(() => 0);
      const input = Object.defineProperty(address(), field, { get: getter, enumerable: true, configurable: true });
      expect(BuildingWindowSlotAddressSchema.safeParse(input).success).toBe(false);
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it('owns parsed values and has a deterministic versioned JSON roundtrip', () => {
    const input = { bayIndex: 7, floorIndex: 2, facade: 'rear', schemaVersion: '0.1.0' };
    const parsed: BuildingWindowSlotAddress = BuildingWindowSlotAddressSchema.parse(input);
    expect(parsed).not.toBe(input);
    const serialized = JSON.stringify(parsed);
    expect(serialized).toBe('{"schemaVersion":"0.1.0","facade":"rear","floorIndex":2,"bayIndex":7}');
    expect(JSON.stringify(BuildingWindowSlotAddressSchema.parse(JSON.parse(serialized)))).toBe(serialized);
    input.floorIndex = 5;
    expect(parsed.floorIndex).toBe(2);
    parsed.bayIndex = 9;
    expect(input.bayIndex).toBe(7);
    expect(BuildingWindowSlotAddressSchema.parse(Object.freeze(address()))).toEqual(address());
  });

  it('leaves existing document and resolution boundaries unchanged', () => {
    const target = BuildingWindowSlotAddressSchema.parse(address());
    expect(BuildingDocumentSchema.parse(documentInput())).toEqual(documentInput());
    expect(BuildingDocumentSchema.safeParse({ ...documentInput(), target }).success).toBe(false);
    expect(BuildingDocumentResolutionSchema.safeParse({ ...rejectedReceipt(), target }).success).toBe(false);
  });
});
