import type { GenerationRunEvent } from "../features/building-family/contracts/generationRun";

export function latestMaterialSourceCacheHit(events: GenerationRunEvent[]): boolean | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.stage === "generatingMaterialSources" && event.cacheHit !== undefined) {
      return event.cacheHit;
    }
  }

  return undefined;
}
