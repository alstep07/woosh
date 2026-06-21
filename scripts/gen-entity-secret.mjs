/**
 * One-time helper to set up the Circle DCW entity secret.
 *
 * It generates a fresh 32-byte entity secret and the ciphertext that the Circle Console
 * "Entity Secret Ciphertext" field expects.
 *
 *   1. Run:  node scripts/gen-entity-secret.mjs
 *   2. Copy the CIPHERTEXT into the Console field and click Register, then download the
 *      recovery file Circle gives you and store it somewhere safe.
 *   3. Put CIRCLE_ENTITY_SECRET (the secret, not the ciphertext) into .env.local.
 *
 * Needs CIRCLE_API_KEY. The script reads it from the environment, or from .env.local.
 * The ciphertext is single-use for registration; at runtime the SDK regenerates a fresh
 * one per request automatically. NEVER commit the secret or the recovery file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

function readApiKey() {
  if (process.env.CIRCLE_API_KEY) return process.env.CIRCLE_API_KEY;
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*CIRCLE_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return "";
}

const apiKey = readApiKey();
if (!apiKey) {
  console.error("CIRCLE_API_KEY not found in env or .env.local. Set it and retry.");
  process.exit(1);
}

const entitySecret = crypto.randomBytes(32).toString("hex");
const ciphertext = await generateEntitySecretCiphertext({ apiKey, entitySecret });

console.log("\n========================================================");
console.log(" 1) Put this in .env.local (keep it secret, never commit):\n");
console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}`);
console.log("\n 2) Paste this CIPHERTEXT into the Console field, then Register:\n");
console.log(ciphertext);
console.log("\n 3) Download + safely store the recovery file Circle shows you.");
console.log("========================================================\n");
