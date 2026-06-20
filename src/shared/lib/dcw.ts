/**
 * Circle Developer-Controlled Wallets — SERVER-SIDE ONLY.
 *
 * Powers the autonomous strategy executor: a single Woosh-controlled wallet that signs
 * strategy executions (recurring transfers, DCA swap releases) programmatically, with NO
 * user PIN. The entity secret lives in CIRCLE_ENTITY_SECRET on the server and is NEVER
 * exposed to the client. Contrast with src/shared/lib/circle.ts (UCW, PIN per action).
 *
 * Setup (one-time):
 *   1. Generate + register the entity secret in Circle Console (or via
 *      registerEntitySecretCiphertext), set CIRCLE_ENTITY_SECRET.
 *   2. Provision the executor wallet (POST /api/admin/provision-executor), set
 *      EXECUTOR_WALLET_ID + EXECUTOR_ADDRESS.
 *   3. Call WooshStrategyRegistry.setExecutor(EXECUTOR_ADDRESS) from the admin key.
 *   4. Fund the executor wallet with USDC (USDC is gas on Arc).
 */
import {
  initiateDeveloperControlledWalletsClient,
  Blockchain,
} from "@circle-fin/developer-controlled-wallets";

function getClient() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey) throw new Error("CIRCLE_API_KEY is not set");
  if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET is not set");
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

/** The configured executor wallet id. Throws if the executor hasn't been provisioned. */
export function getExecutorWalletId(): string {
  const id = process.env.EXECUTOR_WALLET_ID;
  if (!id) throw new Error("EXECUTOR_WALLET_ID is not set — provision the executor wallet first");
  return id;
}

/** The executor wallet's on-chain address (must match WooshStrategyRegistry.executor). */
export function getExecutorAddress(): `0x${string}` {
  const addr = process.env.EXECUTOR_ADDRESS;
  if (!addr) throw new Error("EXECUTOR_ADDRESS is not set — provision the executor wallet first");
  return addr as `0x${string}`;
}

/**
 * One-time provisioning: create a wallet set + one EOA wallet on Arc Testnet.
 * Returns the ids + address to paste into env, after which the admin calls
 * setExecutor(address) on the registry and funds the wallet with USDC for gas.
 */
export async function provisionExecutorWallet() {
  const client = getClient();
  const setRes = await client.createWalletSet({ name: "Woosh Strategy Executor" });
  const walletSetId = setRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("Failed to create wallet set");

  const walletsRes = await client.createWallets({
    walletSetId,
    blockchains: [Blockchain.ArcTestnet],
    count: 1,
    accountType: "EOA",
  });
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet) throw new Error("Failed to create executor wallet");

  return { walletSetId, walletId: wallet.id, address: wallet.address };
}

/**
 * Programmatic contract execution from the executor wallet (no PIN). Used to call
 * WooshStrategyRegistry.executePayment / releaseForSwap on schedule.
 * @param amount optional native value (USDC) to send with a payable call
 * @returns the created transaction { id, state }
 */
export async function dcwExecuteContract(
  contractAddress: string,
  abiFunctionSignature: string,
  abiParameters: unknown[],
  amount?: string,
) {
  const client = getClient();
  const res = await client.createContractExecutionTransaction({
    walletId: getExecutorWalletId(),
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    ...(amount ? { amount } : {}),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return res.data;
}

/**
 * Programmatic token transfer from the executor wallet (no PIN). Used in DCA to forward
 * the swapped output token to the strategy owner. `tokenAddress` is the ERC-20 contract
 * (EURC/cirBTC); leave it "" for native USDC. The blockchain is inferred from the wallet.
 */
export async function dcwTransfer(
  destinationAddress: string,
  amount: string,
  tokenAddress = "",
) {
  const client = getClient();
  const res = await client.createTransaction({
    walletId: getExecutorWalletId(),
    tokenAddress,
    destinationAddress,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return res.data;
}

const TERMINAL_STATES = new Set(["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"]);

/**
 * Poll a DCW transaction until it reaches a terminal state or the timeout elapses.
 * Returns the final state string ("COMPLETE"/"CONFIRMED" = success).
 */
export async function waitForTx(id: string, timeoutMs = 60_000): Promise<string> {
  const client = getClient();
  const deadline = Date.now() + timeoutMs;
  let state = "INITIATED";
  while (Date.now() < deadline) {
    const res = await client.getTransaction({ id });
    state = res.data?.transaction?.state ?? state;
    if (TERMINAL_STATES.has(state)) return state;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return state;
}
