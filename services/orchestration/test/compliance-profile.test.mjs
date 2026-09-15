import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainstProfile, resolveCode, listCodes } from "../src/compliance/compliance-profile.mjs";

function profile(overrides = {}) {
  return {
    id: "test-profile",
    name: "Test Profile",
    version: "1.0.0",
    requiredFields: [
      { id: "name", path: "person.name", label: "Name" },
      { id: "age", path: "person.age", label: "Age" }
    ],
    codeLists: {
      widget: [
        { code: "W-1", label: "Blue Widget", aliases: ["Azure Widget"] },
        { code: "W-2", label: "Red Widget" }
      ]
    },
    ...overrides
  };
}

test("validateAgainstProfile reports ready:true when every required field is present", () => {
  const result = validateAgainstProfile(profile(), { person: { name: "Ada", age: 30 } });
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.profile_id, "test-profile");
  assert.equal(result.profile_version, "1.0.0");
});

test("validateAgainstProfile reports missing fields by id/path/label", () => {
  const result = validateAgainstProfile(profile(), { person: { name: "Ada" } });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, [{ id: "age", path: "person.age", label: "Age" }]);
});

test("validateAgainstProfile treats empty string, empty array, null and undefined as not satisfied", () => {
  const p = profile({
    requiredFields: [
      { id: "a", path: "x.a", label: "a" },
      { id: "b", path: "x.b", label: "b" },
      { id: "c", path: "x.c", label: "c" },
      { id: "d", path: "x.d", label: "d" }
    ]
  });
  const result = validateAgainstProfile(p, { x: { a: "", b: [], c: null } }); // d is undefined (missing key entirely)
  assert.deepEqual(result.missing.map((m) => m.id).sort(), ["a", "b", "c", "d"]);
});

test("validateAgainstProfile treats zero and false as satisfied (not empty)", () => {
  const p = profile({ requiredFields: [{ id: "n", path: "x.n", label: "n" }, { id: "f", path: "x.f", label: "f" }] });
  const result = validateAgainstProfile(p, { x: { n: 0, f: false } });
  assert.equal(result.ready, true);
});

test("validateAgainstProfile skips fields whose appliesWhen returns false, and reports them as not applying", () => {
  const p = profile({
    requiredFields: [
      { id: "always", path: "x.always", label: "always" },
      { id: "conditional", path: "x.conditional", label: "conditional", appliesWhen: (record) => record.flag === true }
    ]
  });
  const result = validateAgainstProfile(p, { x: { always: "ok" }, flag: false });
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
  const conditionalEval = result.evaluated.find((e) => e.id === "conditional");
  assert.equal(conditionalEval.applies, false);
  assert.equal(conditionalEval.satisfied, null);
});

test("validateAgainstProfile includes a conditional field once appliesWhen returns true", () => {
  const p = profile({
    requiredFields: [{ id: "conditional", path: "x.conditional", label: "conditional", appliesWhen: (record) => record.flag === true }]
  });
  const result = validateAgainstProfile(p, { x: {}, flag: true });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, [{ id: "conditional", path: "x.conditional", label: "conditional" }]);
});

test("validateAgainstProfile supports array-index paths (e.g. assessments.0.section_type)", () => {
  const p = profile({ requiredFields: [{ id: "first_item", path: "items.0.name", label: "First item name" }] });
  assert.equal(validateAgainstProfile(p, { items: [{ name: "x" }] }).ready, true);
  assert.equal(validateAgainstProfile(p, { items: [] }).ready, false);
});

test("resolveCode matches by exact label, case-insensitively", () => {
  const match = resolveCode(profile(), "widget", "blue widget");
  assert.equal(match.code, "W-1");
});

test("resolveCode matches by alias", () => {
  const match = resolveCode(profile(), "widget", "Azure Widget");
  assert.equal(match.code, "W-1");
});

test("resolveCode returns null for an unmapped value, an unknown category, or a missing value", () => {
  assert.equal(resolveCode(profile(), "widget", "Green Widget"), null);
  assert.equal(resolveCode(profile(), "nonexistent-category", "Blue Widget"), null);
  assert.equal(resolveCode(profile(), "widget", ""), null);
  assert.equal(resolveCode(profile(), "widget", undefined), null);
});

test("listCodes returns the profile's code list for a category, or an empty array for an unknown one", () => {
  assert.equal(listCodes(profile(), "widget").length, 2);
  assert.deepEqual(listCodes(profile(), "nonexistent"), []);
});
