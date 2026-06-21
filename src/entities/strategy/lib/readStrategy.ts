import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { STRATEGY_REGISTRY_ABI } from "@/entities/strategy/model/abi";
import {
  STRATEGY_STATUS_BY_ENUM,
  type OnchainStrategy,
} from "@/entities/strategy/model/types";

const ZERO = "0x0000000000000000000000000000000000000000";

type RawStrategy = {
  owner: `0x${string}`;
  kind: number;
  recipient: `0x${string}`;
  tokenOut: `0x${string}`;
  amountPerPeriod: bigint;
  intervalSeconds: bigint;
  periodsTotal: number;
  periodsDone: number;
  nextRunAt: bigint;
  balance: bigint;
  status: number;
  createdAt: bigint;
};

function decode(id: `0x${string}`, raw: RawStrategy): OnchainStrategy {
  return {
    id,
    owner: raw.owner,
    kind: raw.kind === 1 ? "swap" : "payment",
    recipient: raw.recipient.toLowerCase() === ZERO ? null : raw.recipient,
    tokenOut: raw.tokenOut.toLowerCase() === ZERO ? null : raw.tokenOut,
    amountPerPeriod: formatUnits(raw.amountPerPeriod, 18),
    intervalSeconds: Number(raw.intervalSeconds),
    periodsTotal: Number(raw.periodsTotal),
    periodsDone: Number(raw.periodsDone),
    nextRunAt: Number(raw.nextRunAt),
    balance: formatUnits(raw.balance, 18),
    status: STRATEGY_STATUS_BY_ENUM[raw.status] ?? "active",
    createdAt: Number(raw.createdAt),
  };
}

/** Read one strategy from the contract. null if not found / not configured / RPC error. */
export async function getStrategy(id: `0x${string}`): Promise<OnchainStrategy | null> {
  if (!env.strategyRegistryAddress) return null;
  try {
    const raw = (await arcPublicClient.readContract({
      address: env.strategyRegistryAddress,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "getStrategy",
      args: [id],
    })) as RawStrategy;
    if (raw.owner.toLowerCase() === ZERO) return null;
    return decode(id, raw);
  } catch {
    return null;
  }
}

/** The owner's strategies, read straight from the chain (newest first). */
export async function getMyStrategies(owner: `0x${string}`): Promise<OnchainStrategy[]> {
  if (!env.strategyRegistryAddress) return [];
  try {
    const ids = (await arcPublicClient.readContract({
      address: env.strategyRegistryAddress,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "getStrategyIds",
      args: [owner],
    })) as readonly `0x${string}`[];

    const strategies = await Promise.all([...ids].reverse().map((id) => getStrategy(id)));
    return strategies.filter((x): x is OnchainStrategy => x !== null);
  } catch {
    return [];
  }
}
