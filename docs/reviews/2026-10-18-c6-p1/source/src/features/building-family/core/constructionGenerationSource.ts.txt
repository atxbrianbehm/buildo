import {
  ConstructionGenerationInputSchema, ConstructionGenerationSourceSchema,
  type ConstructionGenerationSource
} from "../contracts/constructionGeneration";
import { hashCanonicalJson } from "./contentHash";

/** Own all inputs, including opaque PSG values and locks, before the first await. */
export async function captureConstructionGenerationSource(input: unknown): Promise<ConstructionGenerationSource> {
  const owned = ConstructionGenerationInputSchema.parse(input);
  const referenceContentHash = await hashCanonicalJson(owned.reference);
  const payload = { ...owned, kind: "construction-generation-source" as const, referenceContentHash };
  const contentHash = await hashCanonicalJson(payload);
  return ConstructionGenerationSourceSchema.parse({ ...payload, contentHash });
}

/** Offline admission; validates both pins without fetching or regenerating anything. */
export async function readConstructionGenerationSource(input: unknown): Promise<ConstructionGenerationSource> {
  const source = ConstructionGenerationSourceSchema.parse(input);
  const { contentHash, ...payload } = source;
  const [actualReferenceHash, actualHash] = await Promise.all([
    hashCanonicalJson(source.reference), hashCanonicalJson(payload)
  ]);
  if (source.referenceContentHash !== actualReferenceHash)
    throw new Error("Generation reference snapshot does not match its saved hash.");
  if (contentHash !== actualHash)
    throw new Error("Generation source does not match its saved hash.");
  return source;
}
