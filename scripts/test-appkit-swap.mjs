import fs from "node:fs";
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const kit = new AppKit();
const adapter = createCircleWalletsAdapter({ apiKey: env.CIRCLE_API_KEY, entitySecret: env.CIRCLE_ENTITY_SECRET });
const address = env.EXECUTOR_ADDRESS;

async function tryEst(tokenIn, tokenOut, allowance) {
  const params = {
    from: { adapter, chain: "Arc_Testnet", address },
    tokenIn,
    tokenOut,
    amountIn: "1.00",
    config: { kitKey: env.CIRCLE_KIT_KEY, ...(allowance ? { allowanceStrategy: "approve" } : {}) },
  };
  try {
    const est = await kit.estimateSwap(params);
    console.log(`${tokenIn}->${tokenOut} [allow=${!!allowance}]: OK`, JSON.stringify(est).slice(0, 350));
  } catch (e) {
    console.log(`${tokenIn}->${tokenOut} [allow=${!!allowance}]: FAIL -> ${e?.message ?? e}`);
  }
}

await tryEst("USDC", "cirBTC", true);
await tryEst("USDC", "cirBTC", false);
await tryEst("USDC", "EURC", true);
