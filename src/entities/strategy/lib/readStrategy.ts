import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { STRATEGY_REGISTRY_ABI } from "@/entities/strategy/model/abi";
import {
  STRATEGY_STATUS_BY_ENUM,
  type OnchainStrategy,
  type PortfolioConfig,
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

function decode(id: `0x${string}`, raw: RawStrategy, portfolio: PortfolioConfig | null): OnchainStrategy {
  return {
    id,
    owner: raw.owner,
    kind: raw.kind === 2 ? "portfolio" : raw.kind === 1 ? "swap" : "payment",
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
    portfolio,
  };
}

/** Portfolio extras for a portfolio-kind strategy. null on RPC failure or other kinds. */
export async function getPortfolioConfig(id: `0x${string}`): Promise<PortfolioConfig | null> {
  if (!env.strategyRegistryAddress) return null;
  try {
    const [tokens, bps, mode, sweepThreshold] = (await arcPublicClient.readContract({
      address: env.strategyRegistryAddress,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "getPortfolio",
      args: [id],
    })) as [readonly `0x${string}`[], readonly number[], number, bigint];
    if (tokens.length === 0) return null;
    return {
      legs: tokens.map((t, i) => ({
        token: t.toLowerCase() === ZERO ? null : t,
        bps: Number(bps[i]),
      })),
      mode: mode === 1 ? "sweep" : "deposit",
      sweepThreshold: formatUnits(sweepThreshold, 18),
    };
  } catch {
    return null;
  }
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
    const portfolio = raw.kind === 2 ? await getPortfolioConfig(id) : null;
    return decode(id, raw, portfolio);
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
