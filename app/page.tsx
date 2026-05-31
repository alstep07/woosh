"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandHeader from "@/components/BrandHeader";

// Deterministic positions (avoids SSR/client hydration mismatch)
const DOTS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  left: (i % 10) * 10 + ((i * 7) % 8),
  top: Math.floor(i / 10) * 13 + ((i * 3) % 7),
  delay: (i * 0.11) % 3,
}));

const HOW_IT_WORKS = [
  {
    label: "To receive",
    accent: "text-blue-primary",
    bubble: "bg-blue-primary/10 text-blue-primary",
    steps: [
      "Sign up with your email",
      "Get your personal payment link",
      "Share it with anyone",
    ],
  },
  {
    label: "To pay",
    accent: "text-blue-secondary",
    bubble: "bg-blue-secondary/10 text-blue-secondary",
    steps: [
      "Open the payment link",
      "Enter the amount",
      "Pay from your wallet or Woosh account",
    ],
  },
  {
    label: "For AI agents",
    accent: "text-green-300",
    bubble: "bg-green-300/10 text-green-300",
    steps: [
      "Call the API with recipient and amount",
      "Payment executes on-chain",
      "Done. No UI, no friction",
    ],
  },
];

export default function Home() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(!!localStorage.getItem("woosh_session"));
  }, []);

  function handleLogout() {
    localStorage.removeItem("woosh_session");
    setHasSession(false);
  }

  const navRight = hasSession ? (
    <button
      onClick={handleLogout}
      className="text-sm text-text-secondary hover:text-text-primary transition-colors"
    >
      Log out
    </button>
  ) : (
    <Link
      href="/signup"
      className="text-sm text-text-secondary hover:text-text-primary transition-colors"
    >
      Sign up
    </Link>
  );

  return (
    <main className="min-h-screen bg-navy text-text-primary">
      {/* Full-screen animated background */}
      <div className="woosh-bg" aria-hidden="true">
        {DOTS.map(({ id, left, top, delay }) => (
          <span
            key={id}
            className="woosh-dot"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      {/* Nav */}
      <div className="relative z-10">
        <BrandHeader rightSlot={navRight} />
      </div>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-24 max-w-2xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4 text-balance">
          Send a link.{" "}
          <span className="text-blue-primary block">Get paid in seconds.</span>
        </h1>
        <p className="text-lg text-text-secondary mb-10 text-balance">
          Share your personal payment link. They pay, you receive. No bank required.
        </p>
        <Link
          href={hasSession ? "/dashboard" : "/signup"}
          className="inline-flex items-center justify-center bg-blue-primary hover:bg-blue-secondary text-white font-semibold px-8 py-4 rounded-input text-base transition-colors shadow-glow min-w-[200px] min-h-[44px]"
        >
          {hasSession ? "Open dashboard" : "Get your payment link"}
        </Link>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-12">
          How it works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map(({ label, accent, bubble, steps }) => (
            <div
              key={label}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-card p-6"
            >
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${accent}`}>
                {label}
              </p>
              <ol className="space-y-4">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full text-sm font-bold flex items-center justify-center ${bubble}`}>
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

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-6 py-8 text-center text-text-secondary text-sm">
        {new Date().getFullYear()} Woosh. Instant payments without borders.
      </footer>
    </main>
  );
}
