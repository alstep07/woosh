/**
 * Circle User-Controlled Wallets — server-side only.
 * Docs: https://developers.circle.com/w3s/docs
 */
import {
  initiateUserControlledWalletsClient,
  Blockchain,
} from "@circle-fin/user-controlled-wallets";

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
      const res = await client.createUserWallet(userToken, {
        idempotencyKey: crypto.randomUUID(),
        blockchains: [Blockchain.ArcTestnet],
        accountType: "EOA",
      });
      return { challengeId: res.data!.data!.challengeId! };
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
 * Creates a payment challenge from the sender's Woosh wallet.
 * Returns { challengeId } to be executed client-side via W3SSdk.
 */
export async function createPaymentChallenge(
  userToken: string,
  walletId: string,
  destinationAddress: string,
  amount: string // human-readable, e.g. "10.50"
) {
  const client = getClient();
  const res = await client.createTransaction({
    userToken,
    walletId,
    destinationAddress,
    amounts: [parseFloat(amount).toFixed(2)],
    blockchain: Blockchain.ArcTestnet,
    tokenAddress: "", // native USDC on Arc — no contract address
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { challengeId: res.data!.challengeId! };
}
