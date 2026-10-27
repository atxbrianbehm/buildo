import {
  ConstructionOpeningSelectionSchema, ConstructionOpeningTargetSchema,
  ConstructionOpeningWidthPlanSchema, ConstructionOpeningWidthRequestSchema,
  type ConstructionOpeningTarget, type ConstructionOpeningWidthPlan
} from "../contracts/constructionOpeningEdit";
import { canonicalJson } from "./canonicalJson";

export const MIN_CONSTRUCTION_OPENING_PIER_M = 0.08;

/** Decode only a canonical upper-front frame address; the caller must verify live ownership. */
export function constructionOpeningTargetFromSelection(input: unknown): ConstructionOpeningTarget {
  const source = ConstructionOpeningSelectionSchema.parse(input);
  const prefix = `building/${source.documentId}/node/${source.windowNodeId}/${source.storeysNodeId}/floor/`;
  if (!source.semanticPath.startsWith(prefix)) throw new Error("Choose an upper-front window in the current construction.");
  const match = source.semanticPath.slice(prefix.length).match(/^([1-9][0-9]*)\/bay\/(0|[1-9][0-9]*)\/frame$/);
  if (!match) throw new Error("Choose an upper-front window frame, not a storefront, door or another elevation.");
  return ConstructionOpeningTargetSchema.parse({ documentId: source.documentId, storeysNodeId: source.storeysNodeId,
    windowNodeId: source.windowNodeId, face: "front", floorIndex: Number(match[1]), bayIndex: Number(match[2]) });
}

/** Fit an absolute width without moving the window, changing height or clamping a bad edit. */
export function resolveConstructionOpeningWidth(input: unknown): ConstructionOpeningWidthPlan {
  const source = ConstructionOpeningWidthRequestSchema.parse(input);
  const { target, scope, widthM, frameWidthM } = source;
  if (scope.id !== `${target.storeysNodeId}/floor/${target.floorIndex}/bay/${target.bayIndex}` ||
      scope.face !== target.face || scope.floorIndex !== target.floorIndex || scope.bayIndex !== target.bayIndex) {
    throw new Error("The opening edit does not match its exact structural scope.");
  }
  const piers = (width: number) => [scope.opening.centerAlongM - width / 2 - scope.originM[0],
    scope.originM[0] + scope.sizeM[0] - scope.opening.centerAlongM - width / 2];
  // Account only for arithmetic roundoff at translated cell coordinates, not a physical fit tolerance.
  const slackM = Number.EPSILON * 8 * Math.max(1, ...scope.originM.map(Math.abs), ...scope.sizeM);
  const withinPiers = (width: number) => piers(width).every(pier => pier + slackM >= MIN_CONSTRUCTION_OPENING_PIER_M);
  const sillM = scope.opening.centerYM - scope.opening.heightM / 2 - scope.originM[1];
  const headM = scope.originM[1] + scope.sizeM[1] - scope.opening.centerYM - scope.opening.heightM / 2;
  if (!withinPiers(scope.opening.widthM) || sillM + slackM < 0.08 || headM + slackM < 0.08 ||
      scope.opening.widthM <= frameWidthM * 4 || scope.opening.heightM <= frameWidthM * 4) {
    throw new Error("The source opening must fit its masonry scope and frame.");
  }
  if (!withinPiers(widthM) || widthM <= frameWidthM * 4) {
    throw new Error("The selected opening width must retain 80 mm masonry piers and fit its frame.");
  }
  const [leftPierM, rightPierM] = piers(widthM);
  return ConstructionOpeningWidthPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-opening-width-plan",
    source, opening: { ...scope.opening, widthM }, leftPierM, rightPierM });
}

/** Serialized plans own their data and must exactly reproduce their source-derived result. */
export function readConstructionOpeningWidthPlan(input: unknown): ConstructionOpeningWidthPlan {
  const parsed = ConstructionOpeningWidthPlanSchema.parse(input);
  const expected = resolveConstructionOpeningWidth(parsed.source);
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("Opening edit plan does not match its source.");
  return expected;
}
