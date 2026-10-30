import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { z } from 'zod';

const folder = process.argv[2], output = process.argv[3];
assert(folder && output, 'Supply the family workflow output folder and a new receipt path.');
const read = async name => JSON.parse(await readFile(`${folder}/${name}.json`, 'utf8'));
const before = await read('before'), after = await read('after'), run = await read('receipt');
assert.equal(before.schemaVersion, '0.3.0'); assert.equal(after.schemaVersion, '0.3.0');
assert.deepEqual(before.initialComposition, after.initialComposition);
const choices = before.initialComposition.members;
assert.equal(choices.length, 6); assert.equal(new Set(choices.map(({ ordinal, ...rest }) => { void ordinal; return JSON.stringify(rest); })).size, 6);
for (let i = 0; i < 6; i++) {
  const graph = before.members[i].graph, choice = choices[i];
  assert.equal(graph.nodes.find(node => node.type === 'PlaceOpening').parameters.upperFrontRoundHead, choice.head);
  assert.equal(graph.nodes.find(node => node.type === 'AssembleWindow').parameters.layout, choice.sash);
  assert.equal(graph.nodes.find(node => node.type === 'PlaceStorefront').parameters.mode, choice.frontage);
  assert.equal(graph.nodes.find(node => node.type === 'BuildingRoof').parameters.corniceAssembly, choice.cornice);
  assert.equal(graph.nodes.find(node => node.type === 'BuildingRoof').parameters.parapetSilhouette, choice.parapet);
  if (i !== 1) assert.deepEqual(before.members[i], after.members[i]);
}
assert.notDeepEqual(before.members[1].graph, after.members[1].graph);
assert.deepEqual(before.sourceGraph, after.sourceGraph); assert.deepEqual(before.sourceGeneration, after.sourceGeneration);
assert.equal(before.materialSource.contentHash, after.materialSource.contentHash);
assert.equal(run.providerCallsBefore, run.providerCallsAfter); assert(run.providerCallsBefore > 0);
assert.equal(run.reopenedMember, true); assert.deepEqual(run.errors, []);
const receipt = z.object({ schemaVersion: z.literal('0.1.0'), kind: z.literal('family-variety-review'), api: z.enum(['webgpu', 'webgl']),
  familySeed: z.string().min(1), choices: z.array(z.object({ ordinal: z.number().int(), head: z.number().int(), sash: z.number().int(), frontage: z.number().int(), cornice: z.number().int(), parapet: z.number().int() }).strict()).length(6),
  sourceUnchanged: z.literal(true), siblingsUnchanged: z.literal(true), selectedMemberChanged: z.literal(true), policyRetained: z.literal(true),
  materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), reopenedMember: z.literal(true) }).strict().parse({
  schemaVersion: '0.1.0', kind: 'family-variety-review', api: run.api, familySeed: before.familySeed, choices,
  sourceUnchanged: true, siblingsUnchanged: true, selectedMemberChanged: true, policyRetained: true,
  materialHash: after.materialSource.contentHash, providerCallsDelta: 0, reopenedMember: true
});
await writeFile(output, JSON.stringify(receipt, null, 2), { flag: 'wx' });
