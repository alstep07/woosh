/**
 * Circle User-Controlled Wallets — server-side only.
 * Docs: https://developers.circle.com/w3s/docs
 */
import {
  initiateUserControlledWalletsClient,
  Blockchain,
} from "@circle-fin/user-controlled-wallets";
import { parseUnits } from "viem";

function getClient() {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) throw new Error("CIRCLE_API_KEY is not set");
  return initiateUserControlledWalletsClient({ apiKey: key });
}

/** Step 1: Send OTP to user email. Returns tokens needed for SDK config. */
export async function requestOtp(deviceId: string, email: string) {
  const client = getClient();
  const res = await client.createDeviceTokenForEmailLogin({ deviceId, email });
  return res.data!; // { deviceToken, deviceEncryptionKey, otpToken }
}

/**
 * Step 3: Initialize user + create wallet challenge.
 * Returns { challengeId } or { alreadyExists: true } if user already has wallets.
 */
export async function initializeUser(userToken: string) {
  const client = getClient();
  try {
    const res = await client.createUserPinWithWallets({
      userToken,
      blockchains: [Blockchain.ArcTestnet],
      accountType: "EOA",
    });
    return { challengeId: res.data!.challengeId! };
  } catch (err: unknown) {
    const code =
      (err as { response?: { data?: { code?: number } } })?.response?.data?.code
      ?? (err as { code?: number })?.code;
    const msg = err instanceof Error ? err.message : "";
    if (code === 155106 || msg.toLowerCase().includes("already been initialized")) {
      // User has a PIN but may not have a wallet (e.g. closed PIN window on first signup)
      const wallets = await getUserWallets(userToken);
      if (wallets.length > 0) return { alreadyExists: true as const };

      // No wallet — create one (requires PIN challenge client-side)
      const res = await client.createWallet({
        userToken,
        idempotencyKey: crypto.randomUUID(),
        blockchains: [Blockchain.ArcTestnet],
        accountType: "EOA",
      });
      return { challengeId: res.data!.challengeId! };
    }
    throw err;
  }
}

/** Fetch all wallets for the authenticated user. */
export async function getUserWallets(userToken: string) {
  const client = getClient();
  const res = await client.listWallets({ userToken });
  return res.data?.wallets ?? [];
}

/**
 * Creates a contract execution challenge to register a slug onchain.
 * Returns { challengeId } to be executed client-side via W3SSdk.
 */
export async function createSlugRegistrationChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  slug: string
) {
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: "register(string)",
    abiParameters: [slug],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Creates a payment challenge from the sender's Woosh wallet.
 * Returns { challengeId } to be executed client-side via W3SSdk.
 */
export async function createPaymentChallenge(
  userToken: string,
  walletId: string,
  destinationAddress: string,
  amount: string // human-readable decimal string, e.g. "10.50"
) {
  if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const client = getClient();
  const res = await client.createTransaction({
    userToken,
    walletId,
    destinationAddress,
    amounts: [amount],
    blockchain: Blockchain.ArcTestnet,
    tokenAddress: "", // native USDC on Arc — no contract address
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Creates a challenge to transfer an ERC-20 token (e.g. EURC/cirBTC) from the user's wallet,
 * used to fund a reverse swap (token -> USDC) into the executor. For native USDC use
 * createPaymentChallenge (tokenAddress is the empty string there).
 */
export async function createTokenTransferChallenge(
  userToken: string,
  walletId: string,
  destinationAddress: string,
  amount: string,
  tokenAddress: string
) {
  if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const client = getClient();
  const res = await client.createTransaction({
    userToken,
    walletId,
    destinationAddress,
    amounts: [amount],
    blockchain: Blockchain.ArcTestnet,
    tokenAddress,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Creates a challenge to register a payment request on-chain via
 * WooshInvoiceRegistry.create(salt, amount, memo). Stores amount + memo on-chain.
 */
export async function createInvoiceCreateChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  salt: string,   // uint256 as a decimal string
  amount: string, // human-readable decimal string, e.g. "50"
  memo: string
) {
  if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const amountWei = parseUnits(amount, 18).toString(); // Arc native USDC = 18 decimals
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: "create(uint256,uint256,string)",
    abiParameters: [salt, amountWei, memo],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Creates a challenge to settle a payment request via WooshInvoiceRegistry.pay(id).
 * Sends `amount` as native value (msg.value); the contract enforces it equals the
 * stored invoice amount.
 */
export async function createInvoicePayChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  id: string,     // bytes32 invoice id
  amount: string  // human-readable decimal string — must equal the stored amount
) {
  if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: "pay(bytes32)",
    abiParameters: [id],
    amount, // native value to send with the call; Circle converts to base units
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Challenge to create + fund an automated strategy via
 * WooshStrategyRegistry.create(salt, kind, recipient, tokenOut, amountPerPeriod,
 * intervalSeconds, periodsTotal). The native value sent (`funding`) is the strategy's
 * starting budget, custodied by the contract.
 *
 * @param kind 0 = Payment (recurring transfer), 1 = Swap (DCA)
 * @param recipient Payment: who gets paid. Swap: pass the zero address.
 * @param tokenOut Swap: target token. Payment: pass the zero address.
 * @param amountPerPeriod human decimal USDC released/sent each execution
 * @param funding human decimal USDC to deposit now (must be >= amountPerPeriod)
 */
export async function createStrategyCreateChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  salt: string,
  kind: 0 | 1,
  recipient: string,
  tokenOut: string,
  amountPerPeriod: string,
  intervalSeconds: number,
  periodsTotal: number,
  funding: string
) {
  if (!/^\d+(\.\d+)?$/.test(amountPerPeriod) || parseFloat(amountPerPeriod) <= 0) {
    throw new Error(`Invalid amountPerPeriod: ${amountPerPeriod}`);
  }
  if (!/^\d+(\.\d+)?$/.test(funding) || parseFloat(funding) < parseFloat(amountPerPeriod)) {
    throw new Error(`Funding must be >= amountPerPeriod`);
  }
  const amountWei = parseUnits(amountPerPeriod, 18).toString(); // Arc native USDC = 18 decimals
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: "create(uint256,uint8,address,address,uint256,uint64,uint32)",
    abiParameters: [
      salt,
      String(kind),
      recipient || ZERO_ADDRESS,
      tokenOut || ZERO_ADDRESS,
      amountWei,
      String(intervalSeconds),
      String(periodsTotal),
    ],
    amount: funding, // native budget deposited with create()
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Challenge to create a Portfolio strategy via WooshStrategyRegistry.createPortfolio.
 * Deposit mode: `funding` is the custodied budget (payable). Sweep mode: no value;
 * `amountPerPeriod` is the per-period pull CAP and `sweepThreshold` the floor the
 * owner's balance is never pulled below.
 */
export async function createPortfolioCreateChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  salt: string,
  tokens: string[],
  bps: number[],
  mode: 0 | 1,
  amountPerPeriod: string,
  sweepThreshold: string,
  intervalSeconds: number,
  periodsTotal: number,
  funding: string | null
) {
  if (!/^\d+(\.\d+)?$/.test(amountPerPeriod) || parseFloat(amountPerPeriod) <= 0) {
    throw new Error(`Invalid amountPerPeriod: ${amountPerPeriod}`);
  }
  if (mode === 0 && (!funding || parseFloat(funding) < parseFloat(amountPerPeriod))) {
    throw new Error("Funding must be >= amountPerPeriod");
  }
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature:
      "createPortfolio(uint256,address[],uint16[],uint8,uint256,uint256,uint64,uint32)",
    abiParameters: [
      salt,
      tokens.map((t) => t || ZERO_ADDRESS),
      bps.map(String),
      String(mode),
      parseUnits(amountPerPeriod, 18).toString(),
      parseUnits(sweepThreshold || "0", 18).toString(),
      String(intervalSeconds),
      String(periodsTotal),
    ],
    ...(mode === 0 && funding ? { amount: funding } : {}),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Challenge for the ONE-TIME allowance a Sweep portfolio needs: approve(registry, max)
 * on the USDC ERC-20 precompile so the registry can pull the owner's excess. Revocable
 * any time by approving 0. The registry bounds every pull on-chain (threshold + cap).
 */
export async function createSweepApproveChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`
) {
  const MAX_UINT256 =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: "0x3600000000000000000000000000000000000000",
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [registryAddress, MAX_UINT256],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/** Challenge to top up a strategy via WooshStrategyRegistry.fund(id). */
export async function createStrategyFundChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  id: string,
  amount: string
) {
  if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: "fund(bytes32)",
    abiParameters: [id],
    amount,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}

/**
 * Challenge for an owner action on a strategy: pause(id) / resume(id) / cancel(id).
 * All three take a single bytes32 id and are non-payable.
 */
export async function createStrategyActionChallenge(
  userToken: string,
  walletId: string,
  registryAddress: `0x${string}`,
  action: "pause" | "resume" | "cancel",
  id: string
) {
  const client = getClient();
  const res = await client.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress: registryAddress,
    abiFunctionSignature: `${action}(bytes32)`,
    abiParameters: [id],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  });
  return { challengeId: res.data!.challengeId! };
}
