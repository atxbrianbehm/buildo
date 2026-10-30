import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { z } from 'zod';

const [api, beforePath, folder, output] = process.argv.slice(2);
assert(['webgpu', 'webgl'].includes(api) && beforePath && folder && output);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const before = await read(beforePath), after = await read(`${folder}/after.json`), run = await read(`${folder}/receipt.json`);
assert.equal(run.api, api); assert.equal(run.edits.length, 6);
assert.deepEqual(before.sourceGraph, after.sourceGraph); assert.deepEqual(before.sourceGeneration, after.sourceGeneration);
assert.deepEqual(before.initialComposition, after.initialComposition); assert.equal(before.materialSource.contentHash, after.materialSource.contentHash);
for (let i = 0; i < 6; i++) {
  const expected = structuredClone(before.members[i].graph), edit = run.edits[i];
  assert.equal(edit.ordinal, i + 1);
  const opening = expected.nodes.find(node => node.type === 'PlaceOpening');
  assert.equal(String(opening.parameters.upperFrontRoundHead), edit.previous);
  opening.parameters.upperFrontRoundHead = Number(edit.next);
  assert.notEqual(edit.previous, edit.next); assert.deepEqual(expected, after.members[i].graph);
  assert.deepEqual(before.members[i].generation, after.members[i].generation);
}
assert.deepEqual(run.errors, []);
const receipt = z.object({ schemaVersion: z.literal('0.1.0'), kind: z.literal('family-all-members-review'), api: z.enum(['webgpu', 'webgl']),
  editedMembers: z.literal(6), memberGraphsMatchEdits: z.literal(true), sourceUnchanged: z.literal(true), initialCompositionUnchanged: z.literal(true),
  materialHash: z.string().regex(/^[a-f0-9]{64}$/), errors: z.array(z.string()).length(0) }).strict().parse({
  schemaVersion: '0.1.0', kind: 'family-all-members-review', api, editedMembers: 6, memberGraphsMatchEdits: true,
  sourceUnchanged: true, initialCompositionUnchanged: true, materialHash: after.materialSource.contentHash, errors: run.errors
});
await writeFile(output, JSON.stringify(receipt, null, 2), { flag: 'wx' });
