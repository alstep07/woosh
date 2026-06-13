"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { getSession } from "@/shared/lib/session";
import { env } from "@/shared/config/env";

const LiquidHero = dynamic(() => import("@/widgets/LiquidHero/ui/LiquidHero"), {
  ssr: false,
  loading: () => <div className="liquid-fallback" />,
});

const HOW_IT_WORKS = [
  {
    label: "Get paid",
    accent: "text-blue-primary",
    bubble: "bg-blue-primary/10 text-blue-primary",
    steps: [
      "Sign up with email. Wallet included, no seed phrase.",
      `Share your link ${env.baseUrl}/pay/yourname, or send an invoice for an exact amount.`,
      "Money lands in under a second. Invoices flip to Paid onchain.",
    ],
  },
  {
    label: "Pay anyone",
    accent: "text-blue-secondary",
    bubble: "bg-blue-secondary/10 text-blue-secondary",
    steps: [
      "Open a payment link. Nothing to install.",
      "Pay from your Woosh account or any wallet.",
      "One currency: USDC. No ETH, no gas juggling.",
    ],
  },
  {
    label: "Ask Woosh Agent",
    accent: "text-green-300",
    bubble: "bg-green-300/10 text-green-300",
    steps: [
      "Say \"Send $20 to alex\" or \"invoice 10 for design\".",
      "Check balance, history and invoices in plain English.",
      "You approve every action with your PIN.",
    ],
  },
];

export default function HomePage() {
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    setHasSession(!!getSession());
  }, []);

  return (
    <main className="min-h-screen md:h-screen md:min-h-[660px] bg-navy text-text-primary md:flex md:flex-col">
      <div className="woosh-bg" aria-hidden="true">
        <LiquidHero />
      </div>

      <div className="relative z-10 shrink-0">
        <BrandHeader />
      </div>

      <div className="relative z-10 md:flex-1 md:flex md:flex-col md:justify-center">

        <section className="flex flex-col items-center justify-center text-center px-6 pt-16 pb-6 md:pt-10 md:pb-0 max-w-2xl mx-auto w-full">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4 text-balance">
            Send a link.{" "}
            <span className="text-blue-primary block">Get paid in seconds.</span>
          </h1>
          <p className="text-lg text-text-secondary mb-10 text-balance">
            Share your personal payment link. They pay, you receive. No bank required.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center bg-blue-primary hover:bg-blue-secondary text-white font-semibold px-8 py-4 rounded-input text-base transition-colors shadow-glow min-w-[200px] min-h-[44px]"
          >
            {hasSession ? "Open your wallet" : "Get your payment link"}
          </Link>
        </section>

        <section className="mt-8 md:mt-12 px-6 pb-20 md:pb-8 max-w-5xl mx-auto w-full shrink-0">
          <h2 className="text-2xl font-semibold text-center mb-8 md:mb-4">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {HOW_IT_WORKS.map(({ label, accent, bubble, steps }) => (
              <div key={label} className="glass-card rounded-card p-6 md:p-4">
                <p className={`text-xs font-semibold uppercase tracking-widest mb-3 md:mb-2 ${accent}`}>
                  {label}
                </p>
                <ol className="space-y-3 md:space-y-2">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${bubble}`}>
                        {i + 1}
                      </span>
                      <span className="text-text-secondary text-sm">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

      </div>

      <div className="relative z-10 shrink-0">
        <Footer />
      </div>
    </main>
  );
}
