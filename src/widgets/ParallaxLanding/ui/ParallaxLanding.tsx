"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/shared/lib/session";

/**
 * Scroll-driven parallax landing. Seven full-viewport scenes; heads and stages drift in
 * opposite directions for a 3D shear, each scene reveals on enter. Self-contained scroll
 * container (.plx) so snapping + scroll math never touch the rest of the app. Styles live in
 * globals.css under `.plx`. Ported from design_handoff_parallax_landing/home-parallax.html.
 */
export default function ParallaxLanding() {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(!!getSession());
  }, []);

  const appHref = hasSession ? "/dashboard" : "/signup";
  const go = (href: string) => () => router.push(href);
  const seeHow = () =>
    scrollerRef.current?.querySelector("#plx-s-wallet")?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bar = scroller.querySelector<HTMLElement>(".plx-bar");
    const neb = scroller.querySelector<HTMLElement>(".plx-nebula");
    const grid = scroller.querySelector<HTMLElement>(".plx-grid");
    const stages = [...scroller.querySelectorAll<HTMLElement>("[data-speed]")];
    const scenes = [...scroller.querySelectorAll<HTMLElement>(".scene")];

    // Reveal scenes on enter (hero stays revealed).
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in");
          else if (e.target.id !== "plx-hero") e.target.classList.remove("in");
        });
      },
      { root: scroller, threshold: 0.32 }
    );
    scenes.forEach((s) => io.observe(s));

    let ticking = false;
    function onScroll() {
      const y = scroller!.scrollTop;
      const vh = scroller!.clientHeight;
      bar?.classList.toggle("solid", y > vh * 0.6);
      if (reduceMotion) { ticking = false; return; }
      if (neb) neb.style.transform = `translate(${y * -0.03}px, ${y * 0.12}px)`;
      if (grid) grid.style.transform = `translate(${y * -0.05}px, ${y * 0.06}px)`;
      for (const el of stages) {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const off = (center - vh / 2) / vh;
        const sx = parseFloat(el.dataset.speedX || "0");
        const sy = parseFloat(el.dataset.speed || "0");
        el.style.transform = `translate(${off * sx}px, ${off * sy}px)`;
      }
      ticking = false;
    }
    const handler = () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    };
    scroller.addEventListener("scroll", handler, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      scroller.removeEventListener("scroll", handler);
    };
  }, []);

  return (
    <div className="plx" ref={scrollerRef}>
      <div className="plx-bg">
        <div className="plx-nebula" />
        <div className="plx-grid" />
      </div>

      <div className="plx-bar">
        <div className="logo-row">
          <img src="/woosh_logo.png" alt="Woosh" />
          <span className="wordmark">woosh</span>
        </div>
        <button className="btn-g" onClick={go(appHref)}>Open app →</button>
      </div>

      <main>
        {/* Hero */}
        <section className="scene in hero" id="plx-hero">
          <div className="hero-mark rise">
            <img src="/woosh_logo.png" alt="Woosh" />
            <span>woosh</span>
          </div>
          <div className="rise d1"><span className="chip"><span className="chip-dot" />Arc Testnet · USDC</span></div>
          <h1 className="rise d1">Get paid<br /><span className="grad">in seconds.</span></h1>
          <p className="sub rise d2">A self-custodial USDC wallet that starts with your email, and an agent that handles the rest.</p>
          <div className="cta-row rise d3">
            <button className="btn-p" onClick={go(appHref)}>{hasSession ? "Open your wallet" : "Create your wallet"}</button>
            <button className="btn-g" style={{ padding: "13px 22px", fontSize: 15 }} onClick={seeHow}>See how it works</button>
          </div>
          <div className="scroll-cue">
            <span>Scroll</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
          </div>
        </section>

        {/* 01 Wallet */}
        <section className="scene" id="plx-s-wallet">
          <div className="head" data-speed="22" data-speed-x="-13">
            <p className="eyebrow rise">01 / Wallet</p>
            <h2 className="rise d1">Start with an <span className="grad">email.</span></h2>
            <p className="sub rise d2">Type a code, skip the seed phrase. Your self-custodial USDC wallet goes live in one tap.</p>
          </div>
          <div className="stage otp-flow" data-speed="-42" data-speed-x="18">
            <div className="email-pill rise d2">you@example.com<span className="cursor" /></div>
            <div className="connector rise d2" />
            <div className="otp-boxes">
              <div className="otp-box">1</div><div className="otp-box">3</div><div className="otp-box">3</div>
              <div className="otp-box">7</div><div className="otp-box">4</div><div className="otp-box">2</div>
            </div>
            <div className="wallet-chip">
              <div className="orb" />
              <div className="meta"><b>Wallet ready</b><span>0x1a2b…9f4c</span></div>
            </div>
          </div>
        </section>

        {/* 02 Transfers */}
        <section className="scene" id="plx-s-transfer">
          <div className="head" data-speed="22" data-speed-x="13">
            <p className="eyebrow rise">02 / Transfers</p>
            <h2 className="rise d1">Money moves in <span className="grad">seconds.</span></h2>
            <p className="sub rise d2">Send and receive USDC instantly on Arc. Fees are paid in USDC, no gas token to chase.</p>
          </div>
          <div className="stage xfer-wrap rise d2" data-speed="-46" data-speed-x="-20">
            <svg className="svg-stage" viewBox="0 0 560 180" fill="none">
              <path id="plx-wire" d="M70,90 C200,20 360,160 490,90" stroke="rgba(14,165,233,0.18)" strokeWidth="1.5" strokeDasharray="3 8" />
              <circle cx="70" cy="90" r="26" fill="#0c1628" stroke="rgba(14,165,233,0.5)" strokeWidth="1.5" />
              <circle cx="70" cy="90" r="5" fill="#0ea5e9" />
              <circle cx="70" cy="90" r="26" stroke="#0ea5e9" strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" values="26;58;26" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
              </circle>
              <circle cx="490" cy="90" r="26" fill="#0c1628" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" />
              <circle cx="490" cy="90" r="5" fill="#22d3ee" />
              <circle cx="490" cy="90" r="26" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" values="26;58;26" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
              </circle>
              <circle r="3.5" fill="#22d3ee"><animateMotion dur="2.2s" repeatCount="indefinite"><mpath href="#plx-wire" /></animateMotion></circle>
              <circle r="3" fill="#0ea5e9"><animateMotion dur="2.2s" begin="0.55s" repeatCount="indefinite"><mpath href="#plx-wire" /></animateMotion></circle>
              <circle r="2.5" fill="#38bdf8"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite"><mpath href="#plx-wire" /></animateMotion></circle>
              <circle r="3" fill="#22d3ee"><animateMotion dur="2.2s" begin="1.65s" repeatCount="indefinite"><mpath href="#plx-wire" /></animateMotion></circle>
            </svg>
            <div className="xfer-labels">
              <div className="xlbl" style={{ left: "12.5%", top: "64%" }}><b>You</b><span>0x1a2b…9f4c</span></div>
              <div className="xlbl" style={{ left: "87.5%", top: "64%" }}><b>@alex</b><span>+$20.00</span></div>
            </div>
          </div>
        </section>

        {/* 03 Agent */}
        <section className="scene" id="plx-s-agent">
          <div className="head" data-speed="22" data-speed-x="-13">
            <p className="eyebrow rise">03 / Woosh Agent</p>
            <h2 className="rise d1">Just <span className="grad">tell Woosh.</span></h2>
            <p className="sub rise d2">A built-in agent that speaks plain language. Pay, request, and check balances, by chat.</p>
          </div>
          <div className="stage rise d2" data-speed="-42" data-speed-x="18">
            <div className="chat">
              <div className="bubble user">send $20 to alex</div>
              <div className="bubble agent">Sent <b>$20.00 USDC</b> to <b>@alex</b> <span className="tick">✓</span>, confirmed on Arc.</div>
              <div className="bubble user">what&apos;s my balance?</div>
            </div>
          </div>
        </section>

        {/* 04 Strategies */}
        <section className="scene" id="plx-s-strategy">
          <div className="head" data-speed="22" data-speed-x="13">
            <p className="eyebrow rise">04 / Strategies</p>
            <h2 className="rise d1">Set a rule. <span className="grad">It runs itself.</span></h2>
            <p className="sub rise d2">Teach the agent a strategy, split income, auto-save, schedule payouts, and let it execute onchain.</p>
          </div>
          <div className="stage flow rise d2" data-speed="-40" data-speed-x="-18">
            <div className="fnode"><span className="k">When</span><span className="v">Income arrives</span></div>
            <div className="fwire" />
            <div className="fnode"><span className="k">Agent splits</span><span className="v blue">70 / 30</span></div>
            <div className="fwire" />
            <div className="fsplit">
              <div className="fnode"><span className="k">Save</span><span className="v green">→ Vault</span></div>
              <div className="fnode"><span className="k">Spend</span><span className="v">→ Wallet</span></div>
            </div>
          </div>
        </section>

        {/* 05 Invoices */}
        <section className="scene" id="plx-s-invoice">
          <div className="head" data-speed="22" data-speed-x="-13">
            <p className="eyebrow rise">05 / Invoices</p>
            <h2 className="rise d1">Bill anyone with <span className="grad">a link.</span></h2>
            <p className="sub rise d2">Create an invoice, share the link, get paid in USDC. See what is open and what is settled at a glance.</p>
          </div>
          <div className="stage rise d2" data-speed="-42" data-speed-x="18">
            <div className="invoice">
              <div className="paid-stamp">PAID</div>
              <div className="inv-head">
                <div><div className="lbl">Invoice</div><div className="num">#WSH-0042</div></div>
              </div>
              <div className="inv-row"><span>Logo design</span><span>$90.00</span></div>
              <div className="inv-row"><span>Brand guide</span><span>$30.00</span></div>
              <div className="inv-total"><span>Total</span><span className="amt grad">$120.00</span></div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="scene cta" id="plx-cta">
          <p className="eyebrow rise">Ready</p>
          <h2 className="rise d1">Your wallet is one <span className="grad">email away.</span></h2>
          <div className="cta-row rise d2">
            <button className="btn-p" onClick={go(appHref)}>{hasSession ? "Open your wallet" : "Create your wallet"}</button>
            <button className="btn-g" style={{ padding: "13px 22px", fontSize: 15 }} onClick={go(appHref)}>Explore the app →</button>
          </div>
          <p className="sub rise d3" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.06em", marginTop: 30, opacity: 0.7 }}>
            Powered by Arc · USDC · Onchain
          </p>
        </section>
      </main>
    </div>
  );
}
