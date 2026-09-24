import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schema = JSON.parse(readFileSync(new URL("./development/modules.json", import.meta.url), "utf8"));
const registry = JSON.parse(readFileSync(new URL("./field-ownership.json", import.meta.url), "utf8"));
const allowed = new Set(["vems_mirror", "vtiger_metadata"]);

export function validateFieldOwnership(modules, ownership) {
  const errors = [];
  const moduleNames = Object.keys(modules).sort();
  const registryNames = Object.keys(ownership.modules ?? {}).sort();
  for (const name of new Set([...moduleNames, ...registryNames])) {
    const schemaFields = modules[name];
    const item = ownership.modules?.[name];
    if (!schemaFields || !item) {
      errors.push(`${name}: module missing from ${schemaFields ? "ownership registry" : "schema"}`);
      continue;
    }
    if (item.write_authority !== "vems") errors.push(`${name}: write_authority must be vems`);
    const classified = item.fields ?? {};
    for (const field of new Set([...schemaFields, ...Object.keys(classified)])) {
      if (!schemaFields.includes(field)) errors.push(`${name}.${field}: not in module schema`);
      else if (!allowed.has(classified[field])) errors.push(`${name}.${field}: missing or invalid ownership class`);
    }
    if (classified.vems_external_key !== "vems_mirror") {
      errors.push(`${name}: vems_external_key must be a V-EMS mirror`);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = validateFieldOwnership(schema, registry);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Vtiger ownership contract covers ${Object.keys(schema).length} modules`);
  }
}
