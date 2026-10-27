import { ConstructionCorniceDetailPlanSchema, ConstructionCorniceDetailRequestSchema,
  type ConstructionCorniceDetailPlan } from "../contracts/constructionCorniceDetail";
import { canonicalJson } from "./canonicalJson";

const FACES = ["front", "right", "rear", "left"] as const;
const PROFILE = [[1, 0], [.8, .45], [.65, .45], [.5, .72], [.25, .72], [.15, 1], [0, 1], [0, 0]] as const;
const UNIT_BUDGET = 512;
const ROUND_OFF_M = 1e-10;

/** Plan carving and repeat cadence only; no mesh, renderer, material or store access. */
export function resolveConstructionCorniceDetail(input: unknown): ConstructionCorniceDetailPlan {
  const source = ConstructionCorniceDetailRequestSchema.parse(input);
  const { building: b, cornice: c, assembly } = source;
  if (c.heightM >= b.heightM) throw new Error("Cornice height must fit below the building's wall top.");
  const envelopeProfile = PROFILE.map(([drop, projection]) => ({ yM: b.heightM - c.heightM * drop, depthM: c.projectionM * projection }));
  if (assembly === "moulded") return ConstructionCorniceDetailPlanSchema.parse({
    schemaVersion: "0.1.0", kind: "construction-cornice-detail-plan", source, unitBudget: UNIT_BUDGET,
    envelopeProfile, backingProfile: envelopeProfile.map(point => ({ ...point })), recipe: { kind: "none" }, units: [],
    faces: FACES.map(face => { const spanM = face === "front" || face === "rear" ? b.widthM : b.depthM;
      return { face, spanM, count: 0, pitchM: 0, endInsetM: 0, occupiedM: 0, marginM: spanM / 2, firstCenterM: 0 }; })
  });

  const widthM = c.heightM * .65, gapM = widthM * (assembly === "dentil-course" ? 1 : 3), pitchM = widthM + gapM;
  const endInsetM = Math.max(c.projectionM, widthM) / 2;
  const faces = FACES.map(face => {
    const spanM = face === "front" || face === "rear" ? b.widthM : b.depthM;
    const count = Math.floor((spanM - 2 * endInsetM + gapM + ROUND_OFF_M) / pitchM);
    if (count < 1) throw new Error(`Cornice units do not fit between the corner clearances on the ${face} face.`);
    const occupiedM = (count - 1) * pitchM + widthM, marginM = (spanM - occupiedM) / 2;
    if (marginM < endInsetM - ROUND_OFF_M) throw new Error("Cornice units exceed their available face span.");
    return { face, spanM, count, pitchM, endInsetM, occupiedM, marginM, firstCenterM: -(count - 1) * pitchM / 2 };
  });
  const total = faces.reduce((sum, face) => sum + face.count, 0);
  if (total > UNIT_BUDGET) throw new Error(`Cornice detail requires ${total} units, exceeding the 512-unit limit. Increase cornice height or use Moulded cornice.`);

  const lower = 1, upper = assembly === "dentil-course" ? 2 : 4, backingDepthM = c.projectionM * .12;
  const backingProfile = envelopeProfile.flatMap((point, index) => index < lower || index > upper ? [{ ...point }]
    : index === lower ? [{ ...point }, { yM: point.yM, depthM: backingDepthM }]
      : index === upper ? [{ yM: point.yM, depthM: backingDepthM }, { ...point }] : []);
  const backDepthM = backingDepthM - .002;
  function envelopeDepth(drop: number) {
    for (let i = 0; i < PROFILE.length - 2; i++) {
      const [a, da] = PROFILE[i], [z, dz] = PROFILE[i + 1];
      if (drop === a) return da * c.projectionM;
      if (drop === z) return dz * c.projectionM;
      if (drop < a && drop > z) return (da + (dz - da) * (a - drop) / (a - z)) * c.projectionM;
    }
    throw new Error("Cornice profile coordinate is outside its detail band.");
  }
  const drops = [...new Set([.8, .65, .5, .25, ...Array.from({ length: 9 }, (_, i) => Number((.8 - .55 * i / 8).toFixed(12)))])].sort((a, z) => z - a);
  const recipe = assembly === "dentil-course" ? {
    kind: "dentil" as const, widthM, bottomM: envelopeProfile[lower].yM, topM: envelopeProfile[upper].yM,
    backDepthM, frontDepthM: c.projectionM * .45,
    bevelM: Math.min(widthM, envelopeProfile[upper].yM - envelopeProfile[lower].yM, c.projectionM * .45 - backDepthM) * .08
  } : {
    kind: "bracket" as const, widthM, backDepthM, profile: drops.map(drop => {
      const t = (.8 - drop) / .55, outer = envelopeDepth(drop), factor = .18 + .82 * t * t * (3 - 2 * t);
      return { yM: b.heightM - c.heightM * drop, depthM: drop === .25 ? outer : backingDepthM + (outer - backingDepthM) * factor };
    })
  };
  return ConstructionCorniceDetailPlanSchema.parse({
    schemaVersion: "0.1.0", kind: "construction-cornice-detail-plan", source, unitBudget: UNIT_BUDGET,
    envelopeProfile, backingProfile, recipe, faces,
    units: faces.flatMap(face => Array.from({ length: face.count }, (_, ordinal) => ({
      id: `${face.face}/${ordinal}`, face: face.face, ordinal, centerAlongM: (ordinal - (face.count - 1) / 2) * pitchM
    })))
  });
}

/** Reject altered dimensions, cadence, profiles, ordering or unit addresses. */
export function readConstructionCorniceDetailPlan(input: unknown): ConstructionCorniceDetailPlan {
  const plan = ConstructionCorniceDetailPlanSchema.parse(input), expected = resolveConstructionCorniceDetail(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Cornice detail plan does not match its source.");
  return expected;
}
