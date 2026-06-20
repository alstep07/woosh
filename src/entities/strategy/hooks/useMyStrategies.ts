"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyStrategies } from "@/entities/strategy/lib/readStrategy";
import type { OnchainStrategy } from "@/entities/strategy/model/types";

/**
 * The owner's automated strategies, read from the contract by owner address.
 * Polls so status/next-run/balance reflect on-chain executions shortly after they land.
 */
export function useMyStrategies(owner?: `0x${string}`) {
  const [strategies, setStrategies] = useState<OnchainStrategy[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!owner) return;
    const list = await getMyStrategies(owner);
    setStrategies(list);
    setLoading(false);
  }, [owner]);

  useEffect(() => {
    void refetch();
    if (!owner) return;
    const t = setInterval(() => void refetch(), 15_000);
    return () => clearInterval(t);
  }, [owner, refetch]);

  return { strategies, loading, refetch };
}
