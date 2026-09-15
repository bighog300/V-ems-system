// Stage 13 milestone 13a: profile registry and env-driven active-profile
// selection -- the seam a real deployment swaps a real jurisdiction's
// profile through (a data/config change) without touching the framework
// or terminology/validation call sites built against it in 13b/13c.

import { referenceNemsisProfile } from "./profiles/reference-nemsis.mjs";

const profiles = new Map();

export function registerProfile(profile) {
  if (!profile?.id) throw new Error("A compliance profile must have an id");
  profiles.set(profile.id, profile);
}

export function getProfile(id) {
  const profile = profiles.get(id);
  if (!profile) throw new Error(`Unknown compliance profile: ${id}`);
  return profile;
}

export function listProfiles() {
  return [...profiles.values()];
}

const DEFAULT_PROFILE_ID = referenceNemsisProfile.id;

export function getActiveProfile(env = process.env) {
  return getProfile(env.VEMS_COMPLIANCE_PROFILE ?? DEFAULT_PROFILE_ID);
}

registerProfile(referenceNemsisProfile);
