"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSession, clearAll } from "@/shared/lib/session";

/** Authenticated app navigation. Desktop: inline links. Mobile: burger drawer. */

type NavItem = { href: string; label: string; match: (path: string) => boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", match: (p) => p === "/dashboard" },
  { href: "/pay", label: "Send", match: (p) => p === "/pay" || p.startsWith("/pay/") },
  { href: "/dashboard/swap", label: "Swap", match: (p) => p.startsWith("/dashboard/swap") },
  { href: "/dashboard/automations", label: "Automations", match: (p) => p.startsWith("/dashboard/automations") },
  { href: "/dashboard/savings", label: "Savings", match: (p) => p.startsWith("/dashboard/savings") },
  { href: "/dashboard/invoices", label: "Invoices", match: (p) => p.startsWith("/dashboard/invoices") },
];

function formatEmail(email: string, maxLocal = 6): string {
  const at = email.indexOf("@");
  if (at === -1 || at <= maxLocal) return email;
  return `${email.slice(0, maxLocal)}…${email.slice(at)}`;
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const s = getSession();
    setEmail(s?.email);
    setSlug(s?.slug);
  }, []);

  // Close the mobile drawer + account menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return;
    function onDown(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const initial = (slug ?? email ?? "?").charAt(0).toUpperCase();

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleLogout() {
    clearAll();
    router.replace("/");
  }

  const linkBase = "text-sm transition-colors";

  return (
    <nav className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-4 max-w-[73rem] mx-auto w-full">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
        <Image src="/woosh_logo.png" alt="Woosh" width={32} height={32} className="rounded-md" priority />
        <span className="text-lg font-bold tracking-tight">woosh</span>
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-6">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${linkBase} ${active ? "text-text-primary font-medium" : "text-text-secondary hover:text-text-primary"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop right: account avatar + dropdown */}
      <div className="hidden md:block relative shrink-0" ref={accountRef}>
        <button
          onClick={() => setAccountOpen((v) => !v)}
          aria-label="Account"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-primary/15 text-blue-primary text-sm font-semibold hover:bg-blue-primary/25 transition-colors"
        >
          {initial}
        </button>

        {accountOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 z-30 min-w-[200px] rounded-input border border-border bg-[#0d1222] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          >
            {(slug || email) && (
              <div className="px-4 py-2.5 border-b border-border">
                {slug && <p className="text-sm text-text-primary font-medium truncate">@{slug}</p>}
                {email && <p className="text-xs text-text-secondary/50 truncate">{email}</p>}
              </div>
            )}
            <button
              role="menuitem"
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-white/5 transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      {/* Mobile burger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="md:hidden flex items-center justify-center h-9 w-9 -mr-1 rounded-input text-text-primary hover:bg-white/5 transition-colors"
      >
        <span className="relative block h-4 w-5">
          <span className={`absolute left-0 top-0 h-0.5 w-5 bg-current rounded-full transition-all ${open ? "translate-y-[7px] rotate-45" : ""}`} />
          <span className={`absolute left-0 top-[7px] h-0.5 w-5 bg-current rounded-full transition-all ${open ? "opacity-0" : ""}`} />
          <span className={`absolute left-0 top-[14px] h-0.5 w-5 bg-current rounded-full transition-all ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
        </span>
      </button>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 z-10 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="md:hidden absolute left-0 right-0 top-full z-20 mx-3 mt-1 rounded-card border border-border bg-[#0d1222] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col">
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-input px-3 py-3 text-sm transition-colors ${active ? "bg-blue-primary/10 text-blue-primary font-medium" : "text-text-primary hover:bg-white/5"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="my-2 border-t border-border" />
            <div className="flex items-center justify-between px-3 py-2">
              {email && <span className="text-xs text-text-secondary/50 truncate mr-3">{formatEmail(email, 10)}</span>}
              <button onClick={handleLogout} className="shrink-0 text-sm text-text-secondary hover:text-text-primary transition-colors">
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
