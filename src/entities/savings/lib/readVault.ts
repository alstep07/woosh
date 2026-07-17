import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { USDC, EURC, CIRBTC } from "@/shared/lib/tokens";
import { SAVINGS_VAULT_ABI } from "@/entities/savings/model/abi";
import type { VaultHoldings } from "@/entities/savings/model/types";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

type RawSweepRule = {
  threshold: bigint;
  capPerRun: bigint;
  intervalSeconds: bigint;
  nextRunAt: bigint;
  enabled: boolean;
};

const EMPTY: VaultHoldings = {
  usdc: "0",
  eurc: "0",
  cirbtc: "0",
  sweepRule: { threshold: "0", capPerRun: "0", intervalSeconds: 0, nextRunAt: 0, enabled: false },
};

/** The owner's vault holdings (USDC, EURC, cirBTC) and sweep rule, read straight
 *  from the chain in two calls. Empty holdings only when the vault is unconfigured;
 *  RPC errors propagate so callers (react-query, chat) can distinguish "empty" from
 *  "could not load". */
export async function getVaultHoldings(owner: `0x${string}`): Promise<VaultHoldings> {
  if (!env.savingsVaultAddress) return EMPTY;

  // EURC/cirBTC addresses are only set once configured; skip an unconfigured one from
  // the read rather than querying the zero address (which would double-count the USDC
  // leg). Track each token's index so results line up even when one is skipped.
  const tokens: `0x${string}`[] = [ZERO];
  const eurcIdx = EURC.address ? tokens.push(EURC.address) - 1 : -1;
  const cirbtcIdx = CIRBTC.address ? tokens.push(CIRBTC.address) - 1 : -1;

  const [rawBalances, rawRule] = await Promise.all([
    arcPublicClient.readContract({
      address: env.savingsVaultAddress,
      abi: SAVINGS_VAULT_ABI,
      functionName: "getBalances",
      args: [owner, tokens],
    }) as Promise<readonly bigint[]>,
    arcPublicClient.readContract({
      address: env.savingsVaultAddress,
      abi: SAVINGS_VAULT_ABI,
      functionName: "getSweepRule",
      args: [owner],
    }) as Promise<RawSweepRule>,
  ]);

  return {
    usdc: formatUnits(rawBalances[0] ?? 0n, USDC.decimals),
    eurc: eurcIdx >= 0 ? formatUnits(rawBalances[eurcIdx] ?? 0n, EURC.decimals) : "0",
    cirbtc: cirbtcIdx >= 0 ? formatUnits(rawBalances[cirbtcIdx] ?? 0n, CIRBTC.decimals) : "0",
    sweepRule: {
      threshold: formatUnits(rawRule.threshold, 18),
      capPerRun: formatUnits(rawRule.capPerRun, 18),
      intervalSeconds: Number(rawRule.intervalSeconds),
      nextRunAt: Number(rawRule.nextRunAt),
      enabled: rawRule.enabled,
    },
  };
}
