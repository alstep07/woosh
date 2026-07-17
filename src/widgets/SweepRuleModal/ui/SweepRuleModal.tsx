"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { Field, FIELD_CLS, LABEL_CLS } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { INTERVAL_PRESETS, intervalLabel } from "@/entities/strategy/lib/format";
import { fmtAmount } from "@/shared/lib/format";
import { USDC_ERC20_ADDRESS } from "@/shared/lib/tokens";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import type { Session } from "@/entities/user/model/types";
import type { VaultHoldings } from "@/entities/savings/model/types";

const AMOUNT_RE = /^\d+(\.\d+)?$/;

/** Allowance at or above this is treated as "already approved" (mirrors CreateSavingsModal). */
const SWEEP_ALLOWANCE_FLOOR = 2n ** 128n;

interface Props {
  session: Session;
  vault: VaultHoldings;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * Configure or turn off the "auto-sweep" funding method: the executor pulls the wallet
 * balance above a threshold into the savings vault on a schedule, bounded on-chain by
 * the owner-set threshold/cap/interval. One of potentially several funding methods that
 * all land in the same vault balance; manual Deposit (VaultCard) is another.
 */
export default function SweepRuleModal({ session, vault, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const alreadyOn = vault.sweepRule.enabled;

  const [threshold, setThreshold] = useState(alreadyOn ? vault.sweepRule.threshold : "");
  const [capPerRun, setCapPerRun] = useState(alreadyOn ? vault.sweepRule.capPerRun : "");
  const [interval, setInterval] = useState(
    alreadyOn
      ? INTERVAL_PRESETS.find((p) => p.seconds === vault.sweepRule.intervalSeconds)?.seconds ?? INTERVAL_PRESETS[0].seconds
      : INTERVAL_PRESETS[0].seconds
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [turningOff, setTurningOff] = useState(false);

  // Setup needs a one-time allowance first; stage "approve" runs before "setup" when the
  // vault doesn't already have a big enough allowance (cached tokens skip the OTP, so it
  // chains straight into the next PIN). "disable" never needs an allowance.
  const stageRef = useRef<"approve" | "setup" | "disable">("setup");
  const [stageUi, setStageUi] = useState<"approve" | "setup" | "disable">("setup");

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request: (userToken) =>
      stageRef.current === "approve"
        ? fetch("/api/wallet/savings-sweep-approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken }),
          })
        : stageRef.current === "disable"
          ? fetch("/api/wallet/savings-sweep-disable", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userToken }),
            })
          : fetch("/api/wallet/savings-sweep-setup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userToken,
                threshold: threshold.trim() || "0",
                capPerRun: capPerRun.trim(),
                intervalSeconds: interval,
              }),
            }),
    onSuccess: () => {
      if (stageRef.current === "approve") {
        stageRef.current = "setup";
        setStageUi("setup");
        flow.start();
        return;
      }
      setDone(true);
      // One delayed refetch pass (see SavingsActionModal): the rule change shows up in
      // the vault's sweepRule the next time it's read.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["vault-balances", session.walletAddress] });
        onDone?.();
      }, 2_000);
    },
  });

  async function startSetup() {
    const t = threshold.trim() || "0";
    const c = capPerRun.trim();
    if (!AMOUNT_RE.test(t)) {
      setFormError("Enter a valid balance to keep in your wallet");
      return;
    }
    if (!AMOUNT_RE.test(c) || parseFloat(c) <= 0) {
      setFormError("Enter a valid max per sweep");
      return;
    }
    setFormError(null);

    // Skip the approve step when the vault already has a big enough allowance.
    let stage: "approve" | "setup" = "setup";
    if (env.savingsVaultAddress) {
      try {
        const allowance = await arcPublicClient.readContract({
          address: USDC_ERC20_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [session.walletAddress as `0x${string}`, env.savingsVaultAddress],
        });
        if (allowance < SWEEP_ALLOWANCE_FLOOR) stage = "approve";
      } catch {
        stage = "approve"; // can't read: safer to (re)approve than to fail the sweep later
      }
    }
    stageRef.current = stage;
    setStageUi(stage);
    flow.start();
  }

  function startDisable() {
    stageRef.current = "disable";
    setStageUi("disable");
    setTurningOff(true);
    flow.start();
  }

  const error = formError ?? flow.error;

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="md">
      {done ? (
        <ModalSuccess
          title={turningOff ? "Auto-sweep off" : "Auto-sweep on"}
          body={
            turningOff
              ? "Your wallet balance is no longer swept into savings automatically."
              : "Balance above your threshold moves into savings on its own, on schedule."
          }
          onClose={onClose}
          closeLabel="Done"
        />
      ) : flow.phase === "running" ? (
        <div className="text-center py-4">
          <span className="shimmer-text text-sm font-medium">
            {stageUi === "approve"
              ? "Step 1 of 2: approving the sweep allowance… a PIN window will appear."
              : stageUi === "disable"
                ? "Turning off auto-sweep… a PIN window will appear."
                : "Setting up auto-sweep… confirm with your PIN."}
          </span>
        </div>
      ) : flow.phase === "auth" ? (
        <ChallengeAuthSteps
          knownEmail={session.email}
          auth={flow.auth}
          onBack={flow.backToIdle}
          intro="We need to verify you to change this onchain."
        />
      ) : (
        <div className="space-y-4">
          <ModalHeader
            title="Auto-sweep"
            subtitle="Keep a minimum in your wallet; anything above it moves into savings on its own."
            icon="⇢"
            iconClassName="bg-blue-primary/10 text-blue-primary"
          />

          {alreadyOn && (
            <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
              <p className="text-sm text-text-primary">
                Currently sweeps up to {fmtAmount(vault.sweepRule.capPerRun)} USDC {intervalLabel(vault.sweepRule.intervalSeconds)},
                keeping at least {fmtAmount(vault.sweepRule.threshold)} USDC in your wallet.
              </p>
            </div>
          )}

          <Field label="Keep at least this much in your wallet" htmlFor="sweep-threshold">
            <div className="relative">
              <input
                id="sweep-threshold"
                type="number"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => { setThreshold(e.target.value); setFormError(null); }}
                placeholder="0.00"
                className={`${FIELD_CLS} pr-16`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
            </div>
          </Field>

          <Field label="Max swept per run" htmlFor="sweep-cap">
            <div className="relative">
              <input
                id="sweep-cap"
                type="number"
                inputMode="decimal"
                value={capPerRun}
                onChange={(e) => { setCapPerRun(e.target.value); setFormError(null); }}
                placeholder="0.00"
                className={`${FIELD_CLS} pr-16`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
            </div>
          </Field>

          <div>
            <span className={LABEL_CLS}>How often</span>
            <div className="grid grid-cols-3 gap-2">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  type="button"
                  aria-pressed={interval === p.seconds}
                  onClick={() => setInterval(p.seconds)}
                  className={`rounded-input py-2 text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
                    interval === p.seconds
                      ? "border-blue-primary bg-blue-primary/10 text-text-primary"
                      : "border-border bg-border/30 text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button onClick={startSetup}>{alreadyOn ? "Update auto-sweep" : "Turn on auto-sweep"}</Button>
          {alreadyOn && (
            <button
              onClick={startDisable}
              className="w-full text-center text-xs text-text-secondary/40 hover:text-red-400 transition-colors"
            >
              Turn off auto-sweep
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
