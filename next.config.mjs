/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pino-pretty is an optional dev dependency of pino (used by WalletConnect).
    // It's not needed in the browser — stub it out to silence the build warning.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
