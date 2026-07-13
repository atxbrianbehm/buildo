/**
 * Authored cross-section profiles (point sets) for geometry-node-like expanders.
 * Coordinates are pure meters — no Three/React. Profiles are source of truth for
 * moldings; expanders convert them to box-stack approximations (no preassembled meshes).
 */

export interface ProfilePoint2 {
  /** Coordinate along the profile's "height" axis (up for cornice, up for pilaster local). */
  u: number;
  /** Projection / depth out from the wall plane (positive = exterior). */
  d: number;
}

export interface ProfileDefinition {
  id: string;
  label: string;
  /** Cross-section points ordered along u ascending. */
  points: ProfilePoint2[];
}

function validateProfile(profile: ProfileDefinition): void {
  if (profile.points.length < 2) {
    throw new Error(`Profile ${profile.id} needs at least two points.`);
  }
  for (let index = 1; index < profile.points.length; index += 1) {
    if (profile.points[index].u < profile.points[index - 1].u) {
      throw new Error(`Profile ${profile.id} points must be non-decreasing in u.`);
    }
  }
}

/**
 * Late-19c layered cornice section (u up from bed, d out from facade).
 * V2: deeper crown so clay silhouette sells before openings are inspected.
 */
export const late19cCorniceProfile: ProfileDefinition = {
  id: "profile.cornice.late19c.layered",
  label: "Late 19c layered cornice",
  points: [
    { u: 0.0, d: 0.12 },
    { u: 0.06, d: 0.18 },
    { u: 0.12, d: 0.28 },
    { u: 0.22, d: 0.34 },
    { u: 0.3, d: 0.48 },
    { u: 0.42, d: 0.55 },
    { u: 0.52, d: 0.68 },
    { u: 0.62, d: 0.78 },
    { u: 0.72, d: 0.9 },
    { u: 0.82, d: 1.0 },
    { u: 0.92, d: 0.95 },
    { u: 1.0, d: 1.08 }
  ]
};

/**
 * Shallower alternate cornice (G7 stress) — same expand path, different profile id.
 * Selected via recipe.profileRecipeId / seed, not a compiler style fork.
 * Still deeper than pre-V2 so restrained seed keeps a readable crown.
 */
export const late19cRestrainedCorniceProfile: ProfileDefinition = {
  id: "profile.cornice.late19c.restrained",
  label: "Late 19c restrained cornice",
  points: [
    { u: 0.0, d: 0.08 },
    { u: 0.08, d: 0.12 },
    { u: 0.18, d: 0.18 },
    { u: 0.32, d: 0.24 },
    { u: 0.48, d: 0.3 },
    { u: 0.65, d: 0.34 },
    { u: 0.82, d: 0.38 },
    { u: 1.0, d: 0.42 }
  ]
};

/** Shallow belt-course section. */
export const late19cBeltProfile: ProfileDefinition = {
  id: "profile.trim.late19c.belt-course",
  label: "Late 19c belt course",
  points: [
    { u: 0.0, d: 0.06 },
    { u: 0.08, d: 0.1 },
    { u: 0.16, d: 0.14 },
    { u: 0.24, d: 0.16 },
    { u: 0.3, d: 0.12 }
  ]
};

/** Pilaster cross-section (u = half-width from center, mirrored; d = projection). */
export const late19cPilasterProfile: ProfileDefinition = {
  id: "profile.trim.late19c.pilaster",
  label: "Late 19c shallow pilaster",
  points: [
    { u: 0.0, d: 0.06 },
    { u: 0.06, d: 0.1 },
    { u: 0.12, d: 0.16 },
    { u: 0.18, d: 0.2 },
    { u: 0.22, d: 0.18 }
  ]
};

/** Parapet / roof-cap section. */
export const late19cRoofCapProfile: ProfileDefinition = {
  id: "profile.roof-cap.late19c.parapet",
  label: "Late 19c parapet cap",
  points: [
    { u: 0.0, d: 0.08 },
    { u: 0.06, d: 0.14 },
    { u: 0.12, d: 0.18 },
    { u: 0.18, d: 0.16 },
    { u: 0.24, d: 0.22 }
  ]
};

/** Ground-floor base / water table. */
export const late19cBasePlinthProfile: ProfileDefinition = {
  id: "profile.base.late19c.plinth",
  label: "Late 19c base plinth",
  points: [
    { u: 0.0, d: 0.1 },
    { u: 0.12, d: 0.16 },
    { u: 0.28, d: 0.2 },
    { u: 0.42, d: 0.18 },
    { u: 0.55, d: 0.12 }
  ]
};

const profileById: Record<string, ProfileDefinition> = {
  [late19cCorniceProfile.id]: late19cCorniceProfile,
  [late19cRestrainedCorniceProfile.id]: late19cRestrainedCorniceProfile,
  [late19cBeltProfile.id]: late19cBeltProfile,
  [late19cPilasterProfile.id]: late19cPilasterProfile,
  [late19cRoofCapProfile.id]: late19cRoofCapProfile,
  [late19cBasePlinthProfile.id]: late19cBasePlinthProfile,
  // Style-pack family aliases → same geometry expanders (lookup by id only).
  "profile.cornice.bracketed-metal.layered": late19cCorniceProfile,
  "profile.cornice.bracketed-metal.restrained": late19cRestrainedCorniceProfile,
  "profile.trim.pressed-metal.belt-course": late19cBeltProfile,
  "profile.trim.pressed-metal.shallow-pilaster": late19cPilasterProfile
};

export function getProfileDefinition(id: string): ProfileDefinition | undefined {
  return profileById[id];
}

/** Max projection depth of a profile (useful for silhouette comparisons). */
export function profileMaxProjectionM(profile: ProfileDefinition): number {
  return Math.max(...profile.points.map((point) => point.d));
}

export function requireProfileDefinition(id: string): ProfileDefinition {
  const profile = getProfileDefinition(id);
  if (!profile) {
    throw new Error(`Unknown profile definition: ${id}`);
  }
  validateProfile(profile);
  return profile;
}

/** Scale a unit-ish profile so total u span matches target height meters. */
export function scaleProfileToHeight(profile: ProfileDefinition, heightM: number): ProfileDefinition {
  validateProfile(profile);
  const span = profile.points[profile.points.length - 1].u - profile.points[0].u;
  if (span <= 0) {
    throw new Error(`Profile ${profile.id} has zero height span.`);
  }
  const scale = heightM / span;
  const u0 = profile.points[0].u;
  return {
    ...profile,
    id: `${profile.id}.scaled-${heightM.toFixed(3)}`,
    points: profile.points.map((point) => ({
      u: (point.u - u0) * scale,
      d: point.d * Math.min(1.35, 0.85 + scale * 0.15)
    }))
  };
}

/** Scale only outward projection `d` (V2 crown weight without changing height span). */
export function scaleProfileProjection(
  profile: ProfileDefinition,
  projectionScale: number
): ProfileDefinition {
  validateProfile(profile);
  const scale = Math.max(0.05, projectionScale);
  return {
    ...profile,
    id: `${profile.id}.proj-${scale.toFixed(2)}`,
    points: profile.points.map((point) => ({
      u: point.u,
      d: point.d * scale
    }))
  };
}

export function listProfileDefinitions(): ProfileDefinition[] {
  return Object.values(profileById);
}
