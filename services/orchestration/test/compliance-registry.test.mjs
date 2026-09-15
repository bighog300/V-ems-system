import test from "node:test";
import assert from "node:assert/strict";
import { registerProfile, getProfile, listProfiles, getActiveProfile } from "../src/compliance/registry.mjs";
import { referenceNemsisProfile } from "../src/compliance/profiles/reference-nemsis.mjs";

test("the reference NEMSIS-shaped profile is registered by default", () => {
  const profile = getProfile("reference-nemsis-v3");
  assert.equal(profile.id, referenceNemsisProfile.id);
});

test("getActiveProfile defaults to the reference profile when VEMS_COMPLIANCE_PROFILE is unset", () => {
  const profile = getActiveProfile({});
  assert.equal(profile.id, "reference-nemsis-v3");
});

test("getActiveProfile honors VEMS_COMPLIANCE_PROFILE when set to a registered profile", () => {
  registerProfile({ id: "custom-test-profile", name: "Custom", version: "0.0.1", requiredFields: [], codeLists: {} });
  const profile = getActiveProfile({ VEMS_COMPLIANCE_PROFILE: "custom-test-profile" });
  assert.equal(profile.id, "custom-test-profile");
});

test("getProfile throws a clear error for an unknown profile id", () => {
  assert.throws(() => getProfile("does-not-exist"), /Unknown compliance profile: does-not-exist/);
});

test("getActiveProfile throws when VEMS_COMPLIANCE_PROFILE names an unregistered profile", () => {
  assert.throws(() => getActiveProfile({ VEMS_COMPLIANCE_PROFILE: "nope" }), /Unknown compliance profile: nope/);
});

test("registerProfile requires an id", () => {
  assert.throws(() => registerProfile({ name: "No id" }), /must have an id/);
});

test("listProfiles includes every registered profile", () => {
  const ids = listProfiles().map((p) => p.id);
  assert.ok(ids.includes("reference-nemsis-v3"));
});
