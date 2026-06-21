import fs from "node:fs";
import { SwapKit, getSupportedChains } from "@circle-fin/swap-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const adapter = createCircleWalletsAdapter({ apiKey: env.CIRCLE_API_KEY, entitySecret: env.CIRCLE_ENTITY_SECRET });
const kit = new SwapKit();
const address = env.EXECUTOR_ADDRESS;

try {
  console.log("getSupportedChains:", JSON.stringify(getSupportedChains?.()).slice(0, 600));
} catch (e) { console.log("getSupportedChains err:", e?.message); }

async function tryEstimate(tokenIn, tokenOut, amountIn) {
  try {
    const e = await kit.estimate({
      from: { adapter, chain: "Arc_Testnet", address },
      tokenIn,
      tokenOut,
      amountIn,
      config: { kitKey: env.CIRCLE_KIT_KEY },
    });
    console.log(`${tokenIn} -> ${tokenOut} (${amountIn}): OK`, JSON.stringify(e).slice(0, 300));
  } catch (e) {
    console.log(`${tokenIn} -> ${tokenOut} (${amountIn}): FAIL -> ${e?.message ?? e}`);
  }
}

await tryEstimate("USDC", "EURC", "1");
await tryEstimate("cirBTC", "USDC", "0.00001"); // exact direction + size from the screenshot
await tryEstimate("USDC", "cirBTC", "1");
