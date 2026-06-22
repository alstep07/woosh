// Diagnostic: call App Kit estimateSwap directly for each pair and print the real error.
// Run: node scripts/test-swap.mjs   (loads .env.local; prints no secrets)
import fs from "fs";
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const adapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});
const kit = new AppKit();
const from = { adapter, chain: "Arc_Testnet", address: process.env.EXECUTOR_ADDRESS };
const cfg = { kitKey: process.env.CIRCLE_KIT_KEY, allowanceStrategy: "approve" };

console.log("executor:", process.env.EXECUTOR_ADDRESS);
console.log("cirBTC addr:", process.env.NEXT_PUBLIC_CIRBTC_ADDRESS);
console.log("kit key set:", !!process.env.CIRCLE_KIT_KEY, "| api key set:", !!process.env.CIRCLE_API_KEY);

async function test(label, tokenOut) {
  try {
    const est = await kit.estimateSwap({ from, tokenIn: "USDC", tokenOut, amountIn: "1", config: cfg });
    console.log(`\n[${label}] OK  ->`, JSON.stringify(est.estimatedOutput));
  } catch (e) {
    console.log(`\n[${label}] FAIL ->`, (e && e.message) || String(e));
  }
}

await test("EURC by symbol", "EURC");
await test("cirBTC by symbol", "cirBTC");
await test("cirBTC by address", process.env.NEXT_PUBLIC_CIRBTC_ADDRESS);
