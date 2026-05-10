import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import path from "path";
import "dotenv/config";

const dbUrl = process.env.TURSO_DATABASE_URL || `file:///${path.join(process.cwd(), "local.db")}`;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

const playersToAdd = [
  "Bíca", "B-Jakub", "Christian", "Daník", "Honza", "Jaromír", "Lukáš",
  "Maksud", "Michal", "O-Jakub", "Radek", "Veronika", "Yvona", "Ivo"
];

async function seed() {
  console.log("🚀 Zahajuji přidávání hráčů s unikátními hesly...");
  const credentials: { name: string, pass: string }[] = [];
  
  for (const name of playersToAdd) {
    const id = "u-" + Math.random().toString(36).substring(2, 9);
    // Remove special characters or spaces from name for password part if needed, 
    // but user suggested name+number
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, "");
    const randomNum = Math.floor(100 + Math.random() * 900);
    const password = `${cleanName}${randomNum}`;
    
    const hash = await bcrypt.hash(password, 10);
    
    try {
      // Use REPLACE or update password if exists
      await db.execute({
        sql: "INSERT INTO players (id, username, password_hash, role) VALUES (?, ?, ?, 'player') ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash",
        args: [id, name, hash]
      });
      credentials.push({ name, pass: password });
      console.log(`✅ Hráč nastaven: ${name}`);
    } catch (err) {
      console.error(`❌ Chyba u hráče ${name}:`, err);
    }
  }
  
  console.log("\n🔑 SEZNAM PŘIHLAŠOVACÍCH ÚDAJŮ (předej hráčům):");
  console.log("------------------------------------------");
  credentials.forEach(c => {
    console.log(`Jméno: ${c.name.padEnd(12)} | Heslo: ${c.pass}`);
  });
  console.log("------------------------------------------");
  
  console.log("\n✨ Všichni hráči byli zpracováni.");
  process.exit(0);
}

seed();
