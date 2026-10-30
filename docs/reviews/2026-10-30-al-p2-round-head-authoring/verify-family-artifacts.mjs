import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { z } from 'zod';

const folder = process.argv[2], output = process.argv[3];
assert(folder && output, 'Supply the family workflow output folder and a new receipt path.');
const read = async name => JSON.parse(await readFile(`${folder}/${name}.json`, 'utf8'));
const before = await read('before'), after = await read('after'), runtime = await read('receipt');
const heads = file => [file.sourceGraph, ...file.members.map(member => member.graph)].map(graph => graph.nodes.find(node => node.type === 'PlaceOpening').parameters.upperFrontRoundHead);
assert.deepEqual(heads(before), [1,1,1,1,1,1,1]); assert.deepEqual(heads(after), heads(before));
assert.equal(before.materialSource.contentHash, after.materialSource.contentHash);
assert.deepEqual(before.sourceGraph, after.sourceGraph); assert.deepEqual(before.sourceGeneration, after.sourceGeneration);
for (let i = 0; i < 6; i++) if (i !== 1) assert.deepEqual(before.members[i], after.members[i]);
assert.notDeepEqual(before.members[1].graph, after.members[1].graph);
assert.equal(runtime.providerCallsBefore, runtime.providerCallsAfter); assert(runtime.providerCallsBefore > 0);
assert.equal(runtime.reopenedMember, true); assert.deepEqual(runtime.errors, []);
const receipt = z.object({ schemaVersion: z.literal('0.1.0'), kind: z.literal('round-head-family-review'), api: z.literal('webgpu'),
  headsRetained: z.literal(7), siblingsUnchanged: z.literal(true), sourceUnchanged: z.literal(true), selectedMemberChanged: z.literal(true),
  materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), reopenedMember: z.literal(true) }).strict().parse({
  schemaVersion: '0.1.0', kind: 'round-head-family-review', api: runtime.api, headsRetained: 7, siblingsUnchanged: true,
  sourceUnchanged: true, selectedMemberChanged: true, materialHash: after.materialSource.contentHash, providerCallsDelta: 0, reopenedMember: true
});
await writeFile(output, JSON.stringify(receipt, null, 2), { flag: 'wx' });
