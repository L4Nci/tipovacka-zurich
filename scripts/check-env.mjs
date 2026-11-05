import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

const requiredNames = [
  "APP_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_ISSUER_URL",
  "CLERK_AUTHORIZED_PARTIES",
];

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value) {
  try {
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^\s/?#\\]+\/?$/i.test(value)) return null;
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.hostname.includes("*")) return null;
    return url;
  } catch {
    return null;
  }
}

// Decode only for configuration rejection, never for authentication or authorization.
function jwtMetadata(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** Offline configuration checks. No network, DB writes or process.env mutation. */
export function validateEnvironment(config, inherited = {}) {
  const errors = [];
  const values = Object.fromEntries(Object.entries(config).map(([name, value]) => [name, String(value).trim()]));
  const add = (message) => errors.push(message);

  for (const name of requiredNames) {
    if (!values[name]) add(`Chybí ${name}.`);
  }

  for (const name of new Set([...requiredNames, "SUPABASE_URL", "SUPABASE_PROJECT_REF", "CLERK_SECRET_KEY", ...Object.keys(values)])) {
    if (inherited[name] !== undefined && String(inherited[name]).trim() !== (values[name] ?? "")) {
      add(`Proměnná ${name} v prostředí procesu koliduje s vybraným souborem.`);
    }
  }
  for (const name of Object.keys(inherited)) {
    if (name.startsWith("VITE_") && !(name in values)) {
      add(`Frontendová proměnná ${name} pochází mimo vybraný soubor.`);
    }
  }

  const ref = values.SUPABASE_PROJECT_REF;
  if (ref && ref !== "local" && !/^[a-z0-9]{20}$/.test(ref)) {
    add("SUPABASE_PROJECT_REF musí být reference vybraného projektu nebo local.");
  }

  const projectRefs = new Set(ref ? [ref] : []);
  for (const name of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
    if (!values[name]) continue;
    const url = parseOrigin(values[name]);
    if (!url) {
      add(`${name} musí být úplná URL bez přihlašovacích údajů, cesty, query a fragmentu.`);
      continue;
    }
    const local = localHosts.has(url.hostname);
    const urlRef = local ? "local" : url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
    if (local && (url.protocol !== "http:" || url.port !== "54321")) {
      add(`${name} musí lokálně odkazovat na HTTP port 54321.`);
    } else if (!local && (url.protocol !== "https:" || url.port)) {
      add(`${name} musí odkazovat na Supabase přes HTTPS bez vlastního portu.`);
    }
    if (ref && urlRef !== ref) {
      add(`${name} neodpovídá deklarovanému Supabase projektu.`);
    }
    if (urlRef) projectRefs.add(urlRef);
  }

  if (values.SUPABASE_URL && values.VITE_SUPABASE_URL) {
    const serverUrl = parseOrigin(values.SUPABASE_URL);
    const clientUrl = parseOrigin(values.VITE_SUPABASE_URL);
    if (serverUrl && clientUrl && serverUrl.origin !== clientUrl.origin) {
      add("Frontend a server odkazují na rozdílné Supabase projekty.");
    }
  }

  for (const [name, value] of Object.entries(values)) {
    const metadata = jwtMetadata(value);
    if (name.startsWith("VITE_")) {
      if (value && /SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|AUTH_TOKEN|ACCESS_TOKEN|API_.*KEY/.test(name)) {
        add(`${name} nesmí být frontendová proměnná pro tajný údaj.`);
      }
      if (/^(sb_secret_|sk_test_|sk_live_)/.test(value) || metadata?.role === "service_role") {
        add(`${name} obsahuje serverový typ klíče.`);
      }
    }
    if (["VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].includes(name)) {
      if (metadata?.ref && [...projectRefs].some(ref => metadata.ref !== ref)) {
        add(`${name} obsahuje referenci jiného Supabase projektu.`);
      }
      if (metadata?.ref) projectRefs.add(metadata.ref);
    }
  }

  if (values.VITE_SUPABASE_ANON_KEY) {
    const key = values.VITE_SUPABASE_ANON_KEY;
    if (!key.startsWith("sb_publishable_") && jwtMetadata(key)?.role !== "anon") {
      add("VITE_SUPABASE_ANON_KEY musí být publishable klíč nebo legacy anon klíč.");
    }
  }
  if (values.SUPABASE_SERVICE_ROLE_KEY) {
    const key = values.SUPABASE_SERVICE_ROLE_KEY;
    if (!key.startsWith("sb_secret_") && jwtMetadata(key)?.role !== "service_role") {
      add("SUPABASE_SERVICE_ROLE_KEY musí být serverový secret nebo legacy service-role klíč.");
    }
  }

  const clerkEnvironment = values.VITE_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_.+/)?.[1];
  const secretEnvironment = values.CLERK_SECRET_KEY?.match(/^sk_(test|live)_.+/)?.[1];
  if (values.VITE_CLERK_PUBLISHABLE_KEY && !clerkEnvironment) {
    add("VITE_CLERK_PUBLISHABLE_KEY musí být Clerk publishable klíč (pk_test_ nebo pk_live_).");
  }
  if (values.CLERK_SECRET_KEY && !secretEnvironment) {
    add("CLERK_SECRET_KEY musí být Clerk secret klíč (sk_test_ nebo sk_live_).");
  } else if (secretEnvironment && clerkEnvironment && secretEnvironment !== clerkEnvironment) {
    add("Clerk publishable a secret klíč musí patřit stejnému prostředí test nebo live.");
  }

  if (values.CLERK_ISSUER_URL) {
    const issuer = parseOrigin(values.CLERK_ISSUER_URL);
    if (!issuer || issuer.protocol !== "https:") add("CLERK_ISSUER_URL musí být úplný HTTPS issuer origin.");
    if (clerkEnvironment === "live" && issuer && (issuer.hostname === "clerk.accounts.dev" || issuer.hostname.endsWith(".clerk.accounts.dev"))) {
      add("CLERK_ISSUER_URL nesmí pro live Clerk klíč odkazovat na testovací Clerk instanci.");
    }
  }
  if (values.CLERK_AUTHORIZED_PARTIES) {
    const parties = values.CLERK_AUTHORIZED_PARTIES.split(",").map(value => value.trim());
    const origins = new Set();
    for (const value of parties) {
      const url = parseOrigin(value);
      if (!url || (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname)))) {
        add("CLERK_AUTHORIZED_PARTIES musí obsahovat přesné HTTPS origins nebo lokální HTTP origins.");
      }
      if (url) origins.add(url.origin);
    }
    const appUrl = parseOrigin(values.APP_URL ?? "");
    if (appUrl && !origins.has(appUrl.origin)) add("APP_URL musí být mezi CLERK_AUTHORIZED_PARTIES.");
  }
  if (values.APP_URL) {
    const appUrl = parseOrigin(values.APP_URL);
    if (!appUrl || (appUrl.protocol !== "https:" && !(appUrl.protocol === "http:" && localHosts.has(appUrl.hostname)))) {
      add("APP_URL musí být HTTPS origin nebo lokální HTTP origin.");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function checkEnvFile(filename = ".env", inherited = {}) {
  const config = dotenv.parse(readFileSync(filename, "utf8"));
  return validateEnvironment(config, inherited);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0] === "--help") {
    console.log("Použití: npm run env:check -- [soubor-konfigurace]");
    console.log("Výchozí soubor je .env. Kontrola nespouští aplikaci a nepřipojuje se k databázi.");
    return args.length === 1 && args[0] === "--help" ? 0 : 2;
  }

  let result;
  try {
    result = checkEnvFile(args[0], process.env);
  } catch {
    console.error("Konfiguraci nelze načíst. Hodnoty proměnných nebyly vypsány.");
    return 2;
  }
  if (!result.ok) {
    console.error("Konfigurace neprošla kontrolou:");
    for (const message of result.errors) console.error(`- ${message}`);
    return 1;
  }
  console.log("Konfigurace splňuje lokální kontroly cíle a typů klíčů.");
  console.log("Připojení, platnost klíčů a oprávnění nejsou touto offline kontrolou ověřené.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
