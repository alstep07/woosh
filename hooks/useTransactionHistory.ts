"use client";

import { useQuery } from "@tanstack/react-query";
import { arcPublicClient } from "@/lib/arc";
import { formatUnits } from "viem";

export type TxRecord = {
  hash: `0x${string}`;
  from: `0x${string}`;
  amount: string;   // formatted USDC e.g. "50.00"
  timestamp: number; // unix seconds
};

const SCAN_BLOCKS = 50n;

/** Fetches incoming native USDC transfers to `address` from Arc. */
export function useTransactionHistory(address?: `0x${string}`) {
  return useQuery<TxRecord[], Error>({
    queryKey: ["tx-history", address],
    enabled: !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const latest = await arcPublicClient.getBlockNumber();
      const fromBlock = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;

      const blockNumbers: bigint[] = [];
      for (let b = latest; b >= fromBlock; b--) {
        blockNumbers.push(b);
      }

      // Fetch all blocks in parallel
      const results = await Promise.allSettled(
        blockNumbers.map((b) =>
          arcPublicClient.getBlock({ blockNumber: b, includeTransactions: true })
        )
      );

      const txs: TxRecord[] = [];
      for (const result of results) {
        if (result.status === "rejected") continue;
        const block = result.value;
        if (!block.transactions) continue;
        for (const tx of block.transactions) {
          if (typeof tx === "string") continue;
          if (tx.to?.toLowerCase() !== address!.toLowerCase()) continue;
          if (tx.value === 0n) continue;
          txs.push({
            hash: tx.hash,
            from: tx.from,
            amount: parseFloat(formatUnits(tx.value, 6)).toFixed(2),
            timestamp: Number(block.timestamp),
          });
          if (txs.length >= 20) break;
        }
        if (txs.length >= 20) break;
      }

      return txs;
    },
  });
}
