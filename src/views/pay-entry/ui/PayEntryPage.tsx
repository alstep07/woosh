"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";

/**
 * Recipient picker for "Pay someone". Enter a Woosh username or a wallet address;
 * we resolve it (slug -> address, or pass through a raw 0x) and then hand off to the
 * existing /pay/[slug] screen, so the actual payment UI is reused as-is.
 */
export default function PayEntryPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit() {
    const raw = value.trim().replace(/^@/, "");
    if (!raw || checking) return;
    setError(null);

    const isAddress = /^0x[0-9a-fA-F]{40}$/.test(raw);
    const query = isAddress ? raw : raw.toLowerCase();

    setChecking(true);
    const resolved = await resolveSlug(query);
    setChecking(false);

    if (!resolved) {
      setError(isAddress ? "That doesn't look like a valid wallet address." : `No one is registered as "${raw}".`);
      return;
    }
    router.push(`/pay/${query}`);
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Send a payment</h1>
          <p className="text-text-secondary text-sm mb-6">
            Enter a Woosh username or a wallet address.
          </p>
          <div className="space-y-4">
            <Input
              id="recipient"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="username or 0x…"
              error={error}
              autoFocus
            />
            <Button onClick={handleSubmit} disabled={!value.trim() || checking}>
              {checking ? "Checking…" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
