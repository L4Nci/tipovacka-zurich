import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateEnvironment } from "./check-env.mjs";

const existingRef = "hkhkbtzdyjbdeeoiurvw";
const otherRef = "abcdefghijklmnopqrst";
const sample = () => ({
  APP_URL: "http://localhost:3000",
  VITE_SUPABASE_URL: `https://${existingRef}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: "sb_publishable_FAKE_NOT_A_REAL_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FAKE_NOT_A_REAL_KEY",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_FAKE_NOT_A_REAL_KEY",
  CLERK_ISSUER_URL: "https://fake-instance.clerk.accounts.dev",
  CLERK_AUTHORIZED_PARTIES: "http://localhost:3000",
});
const liveSample = () => ({
  ...sample(),
  VITE_CLERK_PUBLISHABLE_KEY: "pk_live_FAKE_NOT_A_REAL_KEY",
  CLERK_ISSUER_URL: "https://identity.example.com",
});
const hasError = (result, phrase) => result.errors.some((message) => message.includes(phrase));
const jwt = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fake-signature`;

test("ordinary app configuration needs neither beta markers nor a Clerk secret", () => {
  assert.deepEqual(validateEnvironment(sample()), { ok: true, errors: [] });
  assert.equal(validateEnvironment(sample(), sample()).ok, true);
  assert.equal(validateEnvironment({ ...sample(), APP_ENV: "production" }).ok, true);
});

test("requires all seven app configuration fields", () => {
  assert.equal(validateEnvironment({}).ok, false);
  for (const name of Object.keys(sample())) {
    const config = sample();
    delete config[name];
    assert.equal(hasError(validateEnvironment(config), `Chybí ${name}.`), true, name);
  }
});

test("allows optional matching project declarations and rejects mismatched declarations", () => {
  const config = { ...sample(), SUPABASE_PROJECT_REF: existingRef };
  assert.equal(validateEnvironment(config).ok, true);
  assert.equal(validateEnvironment({ ...config, SUPABASE_PROJECT_REF: otherRef }).ok, false);
  assert.equal(validateEnvironment({ ...config, SUPABASE_PROJECT_REF: "invalid" }).ok, false);
  assert.equal(validateEnvironment({ ...config, SUPABASE_PROJECT_REF: "" }).ok, true);
  assert.equal(validateEnvironment({ ...config, VITE_SUPABASE_URL: `https://${otherRef}.supabase.co` }).ok, false);
});

test("accepts local Supabase with or without an explicit local reference", () => {
  const local = { ...sample(), VITE_SUPABASE_URL: "http://127.0.0.1:54321" };
  assert.equal(validateEnvironment(local).ok, true);
  assert.equal(validateEnvironment({ ...local, SUPABASE_PROJECT_REF: "local" }).ok, true);
  assert.equal(validateEnvironment({ ...local, SUPABASE_PROJECT_REF: existingRef }).ok, false);
  assert.equal(validateEnvironment({ ...local, VITE_SUPABASE_URL: "http://localhost:3000" }).ok, false);
  assert.equal(validateEnvironment({ ...local, VITE_SUPABASE_URL: "http://remote.example:54321" }).ok, false);
});

test("compares server and client Supabase origins and rejects unsafe URLs", () => {
  assert.equal(validateEnvironment({ ...sample(), SUPABASE_URL: sample().VITE_SUPABASE_URL }).ok, true);
  assert.equal(validateEnvironment({ ...sample(), SUPABASE_URL: `https://${otherRef}.supabase.co` }).ok, false);
  for (const url of [
    `https://name:password@${existingRef}.supabase.co`,
    `https://${existingRef}.supabase.co/?key=hidden`,
    `https://${existingRef}.supabase.co/#hidden`,
    `https://${existingRef}.supabase.co/rest/v1`,
    `http://${existingRef}.supabase.co`,
  ]) {
    assert.equal(validateEnvironment({ ...sample(), VITE_SUPABASE_URL: url }).ok, false);
  }
});

test("checks matching legacy anon and service-role refs against the hosted URL without a declaration", () => {
  assert.deepEqual(validateEnvironment({
    ...sample(),
    VITE_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: existingRef }),
    SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: existingRef }),
  }), { ok: true, errors: [] });
  for (const [name, role] of [["VITE_SUPABASE_ANON_KEY", "anon"], ["SUPABASE_SERVICE_ROLE_KEY", "service_role"]]) {
    const result = validateEnvironment({ ...sample(), [name]: jwt({ role, ref: otherRef }) });
    assert.equal(hasError(result, `${name} obsahuje referenci jiného Supabase projektu`), true);
  }
});

test("crosschecks both legacy key refs even when a custom HTTPS URL has no inferable ref", () => {
  const config = {
    ...sample(),
    VITE_SUPABASE_URL: "https://database.example.com",
    VITE_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: existingRef }),
    SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: existingRef }),
  };
  assert.equal(validateEnvironment(config).ok, true);
  assert.equal(validateEnvironment({ ...config, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: otherRef }) }).ok, false);
});

test("rejects hosted legacy key references when the URL targets local Supabase", () => {
  for (const ref of [existingRef, otherRef]) {
    assert.equal(validateEnvironment({ ...sample(), VITE_SUPABASE_URL: "http://localhost:54321", SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref }) }).ok, false);
  }
});

test("rejects server keys in frontend variables including legacy service-role JWTs", () => {
  for (const config of [
    { ...sample(), VITE_EXTRA_SECRET: "fake-sensitive-value" },
    { ...sample(), VITE_SUPABASE_ANON_KEY: "sb_secret_FAKE" },
    { ...sample(), VITE_OTHER: "sk_test_FAKE" },
    { ...sample(), VITE_OTHER: "sk_live_FAKE" },
    { ...sample(), VITE_SUPABASE_ANON_KEY: jwt({ role: "service_role", ref: existingRef }) },
  ]) {
    assert.equal(validateEnvironment(config).ok, false);
  }
});

test("allows empty secret-looking frontend placeholders but rejects nonempty values", () => {
  for (const empty of ["", "   "]) {
    assert.equal(validateEnvironment({ ...sample(), VITE_TURSO_AUTH_TOKEN: empty }).ok, true);
  }
  const nonempty = validateEnvironment({ ...sample(), VITE_TURSO_AUTH_TOKEN: "fake-sensitive-value" });
  assert.equal(hasError(nonempty, "VITE_TURSO_AUTH_TOKEN nesmí být frontendová proměnná pro tajný údaj"), true);
  assert.equal(validateEnvironment(sample(), { VITE_TURSO_AUTH_TOKEN: "" }).ok, false);
});

test("rejects malformed Supabase keys and incorrect legacy key roles", () => {
  assert.equal(validateEnvironment({ ...sample(), VITE_SUPABASE_ANON_KEY: "not-a-key" }).ok, false);
  assert.equal(validateEnvironment({ ...sample(), VITE_SUPABASE_ANON_KEY: jwt({ role: "authenticated" }) }).ok, false);
  assert.equal(validateEnvironment({ ...sample(), SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_FAKE" }).ok, false);
  assert.equal(validateEnvironment({ ...sample(), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "anon", ref: existingRef }) }).ok, false);
});

test("accepts test and live Clerk keys with optional matching secrets regardless of NODE_ENV", () => {
  for (const NODE_ENV of ["development", "production"]) {
    for (const [config, secret] of [[sample(), "sk_test_FAKE"], [liveSample(), "sk_live_FAKE"]]) {
      assert.equal(validateEnvironment({ ...config, NODE_ENV }).ok, true);
      assert.equal(validateEnvironment({ ...config, NODE_ENV, CLERK_SECRET_KEY: secret }).ok, true);
      assert.equal(validateEnvironment(config, { NODE_ENV }).ok, true);
    }
  }
});

test("rejects mixed Clerk key environments and malformed prefixes", () => {
  assert.equal(validateEnvironment({ ...sample(), CLERK_SECRET_KEY: "sk_live_FAKE" }).ok, false);
  assert.equal(validateEnvironment({ ...liveSample(), CLERK_SECRET_KEY: "sk_test_FAKE" }).ok, false);
  for (const key of ["pk_unknown_FAKE", "sk_test_FAKE", "pk_test_"]) {
    assert.equal(validateEnvironment({ ...sample(), VITE_CLERK_PUBLISHABLE_KEY: key }).ok, false);
  }
  assert.equal(validateEnvironment({ ...sample(), CLERK_SECRET_KEY: "not-a-clerk-secret" }).ok, false);
});

test("rejects live Clerk keys paired with a known test-instance issuer", () => {
  assert.equal(validateEnvironment({ ...sample(), VITE_CLERK_PUBLISHABLE_KEY: "pk_live_FAKE" }).ok, false);
  assert.equal(validateEnvironment({ ...liveSample(), CLERK_ISSUER_URL: "https://clerk.accounts.dev" }).ok, false);
  assert.equal(validateEnvironment({ ...liveSample(), CLERK_ISSUER_URL: "https://custom-auth.example.org" }).ok, true);
});

test("requires exact trusted app origins and HTTPS issuer origins", () => {
  for (const parties of ["", "https://foreign.example", "http://remote.example", "https://*.example.com", "http://localhost:3000,"]) {
    assert.equal(validateEnvironment({ ...sample(), CLERK_AUTHORIZED_PARTIES: parties }).ok, false);
  }
  for (const issuer of [
    "http://localhost:3000",
    "https://fake.clerk.accounts.dev/path",
    "https://fake.clerk.accounts.dev/path/..",
    "https://fake.clerk.accounts.dev/?",
    "https://fake.clerk.accounts.dev/#",
    "https://fake.clerk.accounts.dev/?key=hidden",
    "https://name:password@fake.clerk.accounts.dev",
  ]) {
    assert.equal(validateEnvironment({ ...sample(), CLERK_ISSUER_URL: issuer }).ok, false);
  }
  assert.equal(validateEnvironment({ ...sample(), APP_URL: "http://example.com" }).ok, false);
  assert.equal(validateEnvironment({ ...sample(), CLERK_AUTHORIZED_PARTIES: "http://localhost:3000/, https://app.example.com" }).ok, true);
});

test("rejects inherited process conflicts and undeclared frontend variables", () => {
  assert.equal(validateEnvironment({}, sample()).ok, false);
  for (const inherited of [
    { VITE_SUPABASE_URL: `https://${otherRef}.supabase.co` },
    { SUPABASE_PROJECT_REF: otherRef },
    { CLERK_SECRET_KEY: "sk_live_FAKE" },
  ]) {
    assert.equal(hasError(validateEnvironment(sample(), inherited), "koliduje"), true);
  }
  assert.equal(validateEnvironment(sample(), { VITE_UNDECLARED_SECRET: "fake-sensitive-value" }).ok, false);
});

test("CLI defaults to .env, supports an explicit file, and never prints values", () => {
  const directory = mkdtempSync(join(tmpdir(), "tipovacka-env-"));
  try {
    const entry = fileURLToPath(new URL("./check-env.mjs", import.meta.url));
    const envFile = join(directory, "app.env");
    const values = sample();
    const checkedNames = new Set([...Object.keys(values), "SUPABASE_URL", "SUPABASE_PROJECT_REF", "CLERK_SECRET_KEY"]);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !checkedNames.has(name) && !name.startsWith("VITE_")));
    const contents = () => Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
    const run = (args = [], environment = env) => spawnSync(process.execPath, [entry, ...args], { cwd: directory, env: environment, encoding: "utf8" });

    writeFileSync(join(directory, ".env"), contents());
    const validDefault = run();
    assert.equal(validDefault.status, 0);
    assert.match(validDefault.stdout, /nejsou touto offline kontrolou ověřené/);

    writeFileSync(join(directory, ".env"), "VITE_SUPABASE_URL=https://ignored-default.example\n");
    writeFileSync(envFile, contents());
    const explicit = run([envFile]);
    assert.equal(explicit.status, 0);
    assert.equal(run().status, 1);
    assert.equal(run([join(directory, "missing.env")]).status, 2);
    assert.equal(run(["--help"]).status, 0);
    assert.equal(run([envFile, "extra"]).status, 2);

    const conflict = run([envFile], { ...env, VITE_SUPABASE_URL: "https://FAKE_DO_NOT_PRINT_PROCESS_SENTINEL.example" });
    assert.equal(conflict.status, 1);
    assert.equal((conflict.stdout + conflict.stderr).includes("FAKE_DO_NOT_PRINT_PROCESS_SENTINEL"), false);

    values.VITE_SUPABASE_ANON_KEY = "sb_secret_FAKE_DO_NOT_PRINT_SENTINEL";
    writeFileSync(envFile, contents());
    const unsafe = run([envFile]);
    assert.equal(unsafe.status, 1);
    assert.equal((unsafe.stdout + unsafe.stderr).includes("FAKE_DO_NOT_PRINT_SENTINEL"), false);
    for (const value of Object.values(values)) {
      assert.equal((unsafe.stdout + unsafe.stderr + explicit.stdout + explicit.stderr).includes(value), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
