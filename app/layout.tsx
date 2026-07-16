import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/app/Providers";

// Self-hosted variable fonts (latin subset, weights 100-800) so dev/prod never fall
// back to a Google Fonts fetch. Non-latin glyphs fall through to the system stack.
const sans = localFont({
  src: "./fonts/Sora-Variable-latin.woff2",
  weight: "100 800",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const mono = localFont({
  src: "./fonts/JetBrainsMono-Variable-latin.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Woosh | Get paid in seconds",
  description:
    "Send a payment link. Get paid in seconds. No bank required.",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased bg-navy text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
