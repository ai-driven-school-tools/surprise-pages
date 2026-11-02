import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntimeRoleStatement } from "../../scripts/setup/database.mjs";

const role = "pages_runtime_a1b2c3d4e5f";
const password = "A".repeat(43);
const neon = "postgresql://admin:example@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

test("Neon receives a generated password that its control plane accepts", () => {
  const statement = createRuntimeRoleStatement(role, password, neon);
  assert.ok(statement.includes(`password '${password}'`));
  assert.ok(!statement.includes("SCRAM-SHA-256$"));
  assert.ok(statement.includes("nosuperuser nocreatedb nocreaterole noreplication nobypassrls"));
});

test("other PostgreSQL hosts and lookalike Neon hosts keep using SCRAM", () => {
  for (const url of [undefined, "postgres://admin:example@localhost/test", "postgres://admin:example@ep-example.neon.tech.attacker.invalid/test", "postgres://admin:example@db.example.com/test?host=ep-example.neon.tech", "https://ep-example.neon.tech/test"]) {
    const statement = createRuntimeRoleStatement(role, password, url);
    assert.ok(statement.includes("SCRAM-SHA-256$"));
    assert.ok(!statement.includes(password));
  }
});

test("Neon rejects passwords outside the generated format without exposing them", () => {
  for (const invalid of ["short", "A".repeat(42) + "'", "A".repeat(42) + "\\", "A".repeat(42) + "\n"]) {
    assert.throws(() => createRuntimeRoleStatement(role, invalid, neon), error => {
      assert.ok(!error.message.includes(invalid));
      return true;
    });
  }
  assert.throws(() => createRuntimeRoleStatement('bad"role', password, neon));
});
