#!/usr/bin/env node
/**
 * Protocol codegen: JSON Schema (single source of truth) -> Python Pydantic
 * models + TypeScript types + a TS copy of the schema for ajv runtime
 * validation. Deterministic: re-running produces byte-identical output, so
 * `pnpm run codegen:check` can gate drift in CI.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile } from "json-schema-to-typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaRel = "packages/protocol/schemas/messages.schema.json";
const schema = JSON.parse(readFileSync(join(root, schemaRel), "utf8"));

// 1) Python Pydantic v2 models (via datamodel-code-generator in the uv env).
console.log("· generating Python Pydantic models …");
execSync(
  [
    "uv run datamodel-codegen",
    `--input ${schemaRel}`,
    "--input-file-type jsonschema",
    "--output packages/protocol/src/liveclass_protocol/models.py",
    "--output-model-type pydantic_v2.BaseModel",
    "--target-python-version 3.12",
    "--base-class liveclass_protocol._base.StrictBase",
    "--collapse-root-models",
    "--use-standard-collections",
    "--use-union-operator",
    "--enum-field-as-literal all",
    "--use-annotated",
    "--field-constraints",
    "--disable-timestamp",
    "--use-schema-description",
  ].join(" "),
  { cwd: root, stdio: "inherit" },
);

// 2) TypeScript types from the same schema.
console.log("· generating TypeScript types …");
const ts = await compile(schema, "Message", {
  additionalProperties: false,
  declareExternallyReferenced: true,
  bannerComment:
    "/* AUTO-GENERATED from packages/protocol/schemas/messages.schema.json. DO NOT EDIT — run `pnpm run codegen`. */",
});
const genDir = join(root, "packages/shared-types/src/generated");
mkdirSync(genDir, { recursive: true });
writeFileSync(join(genDir, "messages.ts"), ts, "utf8");

// 3) The schema itself as a typed TS const, so ajv validates against the exact
//    same bytes the Python side uses (no second schema to drift).
const schemaTs =
  "/* AUTO-GENERATED copy of packages/protocol/schemas/messages.schema.json. DO NOT EDIT. */\n" +
  `export const messageSchema = ${JSON.stringify(schema, null, 2)} as const;\n`;
writeFileSync(join(genDir, "schema.ts"), schemaTs, "utf8");

console.log("codegen complete.");
