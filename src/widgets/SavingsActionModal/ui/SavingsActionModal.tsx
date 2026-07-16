"use client";

import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { AmountInput } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { tokenBySymbol } from "@/shared/lib/tokens";
import { fmtAmount } from "@/shared/lib/format";
import type { Session } from "@/entities/user/model/types";
import type { VaultHoldings } from "@/entities/savings/model/types";

export type SavingsActionMode = "deposit" | "withdraw";

interface Props {
  session: Session;
  mode: SavingsActionMode;
  vault: VaultHoldings;
  onClose: () => void;
  onDone?: () => void;
}

/** Withdrawable tokens: only ones with a positive vault balance. */
function withdrawableTokens(vault: VaultHoldings): { symbol: string; balance: string }[] {
  const list: { symbol: string; balance: string }[] = [];
  if (parseFloat(vault.usdc) > 0) list.push({ symbol: "USDC", balance: vault.usdc });
  if (parseFloat(vault.eurc) > 0) list.push({ symbol: "EURC", balance: vault.eurc });
  if (parseFloat(vault.cirbtc) > 0) list.push({ symbol: "cirBTC", balance: vault.cirbtc });
  return list;
}

/** Max input decimals for a token: deposit is always USDC (6dp input precision even
 *  though the token is 18dp native). Withdraw caps at the token's own decimals, up to 8
 *  (cirBTC), so a cirBTC amount can actually reach its smallest unit. */
function maxDecimals(mode: SavingsActionMode, symbol: string): number {
  if (mode === "deposit") return 6;
  const decimals = tokenBySymbol(symbol)?.decimals ?? 6;
  return Math.min(decimals, 8);
}

/** Confirm + execute a deposit into or withdrawal from the savings vault. */
export default function SavingsActionModal({ session, mode, vault, onClose, onDone }: Props) {
  const options = withdrawableTokens(vault);
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(options[0]?.symbol ?? "USDC");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The vault balance is polled and can drop the selected token's balance to 0 (e.g. a
  // withdrawal completing elsewhere); if that token disappears from the options, fall
  // back to whatever is first available rather than leaving a stale selection.
  useEffect(() => {
    if (options.length > 0 && !options.some((o) => o.symbol === token)) {
      setToken(options[0].symbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map((o) => o.symbol).join(",")]);

  const selected = options.find((o) => o.symbol === token);
  const decimals = maxDecimals(mode, token);
  const amountRe = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request: (userToken) =>
      mode === "deposit"
        ? fetch("/api/wallet/savings-deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken, amount: amount.trim() }),
          })
        : fetch("/api/wallet/savings-withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken, token, amount: amount.trim() }),
          }),
    onSuccess: () => {
      setDone(true);
      onDone?.();
      setTimeout(() => onDone?.(), 2500);
    },
  });

  function start() {
    const trimmed = amount.trim();
    if (!amountRe.test(trimmed) || parseFloat(trimmed) <= 0) {
      setFormError("Enter a valid amount");
      return;
    }
    if (mode === "withdraw" && selected) {
      const tokenDecimals = tokenBySymbol(token)?.decimals ?? 6;
      const requested = parseUnits(trimmed, tokenDecimals);
      const available = parseUnits(selected.balance, tokenDecimals);
      if (requested > available) {
        setFormError(`You only have ${fmtAmount(selected.balance)} ${token} saved`);
        return;
      }
    }
    setFormError(null);
    flow.start();
  }

  function fillMax() {
    if (mode === "withdraw" && selected) {
      setAmount(selected.balance);
      setFormError(null);
    }
  }

  const error = formError ?? flow.error;
  const title = mode === "deposit" ? "Deposit into savings" : "Withdraw from savings";
  const body =
    mode === "deposit"
      ? "USDC moves from your wallet into the savings vault, kept separate from your spendable balance."
      : "Funds move from the savings vault back into your wallet, any amount, any time.";
  const cta = mode === "deposit" ? "Deposit" : "Withdraw";

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="md">
      {done ? (
        <ModalSuccess title="Done" onClose={onClose} />
      ) : flow.phase === "running" ? (
        <div className="text-center py-4">
          <span className="shimmer-text text-sm font-medium">Confirming… a PIN window will appear.</span>
        </div>
      ) : flow.phase === "auth" ? (
        <ChallengeAuthSteps knownEmail={session.email} auth={flow.auth} onBack={flow.backToIdle} />
      ) : (
        <div className="space-y-4">
          <ModalHeader
            title={title}
            subtitle={body}
            icon={mode === "deposit" ? "↓" : "↑"}
            iconClassName="bg-violet-400/10 text-violet-400"
          />

          {mode === "withdraw" && options.length > 0 && (
            <div className="flex gap-2">
              {options.map((o) => (
                <button
                  key={o.symbol}
                  aria-pressed={token === o.symbol}
                  onClick={() => { setToken(o.symbol); setFormError(null); }}
                  className={`flex-1 text-sm font-medium py-2 rounded-input border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
                    token === o.symbol
                      ? "border-blue-primary bg-blue-primary/10 text-blue-primary"
                      : "border-border text-text-secondary/60 hover:text-text-secondary"
                  }`}
                >
                  {o.symbol}
                </button>
              ))}
            </div>
          )}

          <AmountInput
            id="savings-action-amount"
            label="Amount"
            value={amount}
            onValueChange={(v) => { setAmount(v); setFormError(null); }}
            suffix={mode === "withdraw" ? token : "USDC"}
            onMax={mode === "withdraw" && selected ? fillMax : undefined}
            autoFocus
          />

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button onClick={start}>{cta}</Button>
        </div>
      )}
    </Modal>
  );
}
