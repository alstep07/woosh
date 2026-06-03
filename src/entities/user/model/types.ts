export type Session = {
  email: string;
  walletAddress: `0x${string}`;
  slug?: string;
};

export type OtpTokens = {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
};

export type LoginResult = {
  userToken: string;
  encryptionKey: string;
};
