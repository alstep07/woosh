// Read-only probe: does Synthra have USDC/cirBTC and USDC/EURC pools on Arc testnet?
// Discovers the factory from the router, looks up pools at fee 3000, reads slot0 price.
import fs from "fs";
import { createPublicClient, http } from "viem";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const RPC = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";
const client = createPublicClient({ transport: http(RPC) });

const ROUTER = "0x7fcEF1330B4C21f884D6894f3d6a56036E587aA9";
const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = process.env.NEXT_PUBLIC_CIRBTC_ADDRESS || "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";
const EURC = process.env.NEXT_PUBLIC_EURC_ADDRESS || "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ZERO = "0x0000000000000000000000000000000000000000";

const fnFactory = [{ name: "factory", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const fnGetPool = [{ name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] }];
const fnSlot0 = [{ name: "slot0", type: "function", stateMutability: "view", inputs: [], outputs: [
  { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "obsIdx", type: "uint16" },
  { name: "obsCard", type: "uint16" }, { name: "obsCardNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" },
] }];
const fnLiquidity = [{ name: "liquidity", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] }];

try {
  const factory = await client.readContract({ address: ROUTER, abi: fnFactory, functionName: "factory" });
  console.log("router.factory() ->", factory);

  for (const [label, token, fee] of [["USDC/cirBTC", CIRBTC, 3000], ["USDC/EURC", EURC, 3000], ["USDC/EURC", EURC, 500], ["USDC/cirBTC", CIRBTC, 500]]) {
    const pool = await client.readContract({ address: factory, abi: fnGetPool, functionName: "getPool", args: [USDC, token, fee] });
    if (!pool || pool === ZERO) { console.log(`\n[${label} fee ${fee}] no pool`); continue; }
    const slot0 = await client.readContract({ address: pool, abi: fnSlot0, functionName: "slot0" });
    const liq = await client.readContract({ address: pool, abi: fnLiquidity, functionName: "liquidity" });
    console.log(`\n[${label} fee ${fee}] pool ${pool}\n  sqrtPriceX96=${slot0[0]} tick=${slot0[1]} liquidity=${liq}`);
  }
} catch (e) {
  console.log("FAIL:", (e && e.message) || String(e));
}
