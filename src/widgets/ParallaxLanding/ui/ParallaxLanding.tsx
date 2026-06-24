"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/shared/lib/session";
import Footer from "@/widgets/Footer/ui/Footer";

/**
 * Scroll-driven parallax landing. Seven full-viewport scenes; heads and stages drift in
 * opposite directions for a 3D shear, each scene reveals on enter. Self-contained scroll
 * container (.plx) so snapping + scroll math never touch the rest of the app. Styles live in
 * globals.css under `.plx`. Ported from design_handoff_parallax_landing/home-parallax.html.
 */
export default function ParallaxLanding() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(!!getSession());
  }, []);

  const appHref = hasSession ? "/dashboard" : "/signup";
  const go = (href: string) => () => router.push(href);
  const seeHow = () => {
    const target = document.getElementById("plx-s-wallet");
    const scroller = rootRef.current;
    if (!target || !scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top =
      scroller.scrollTop +
      targetRect.top -
      scrollerRect.top -
      (scroller.clientHeight - targetRect.height) / 2;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  useEffect(() => {
    const scroller = rootRef.current;
    if (!scroller) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bar = scroller.querySelector<HTMLElement>(".plx-bar");
    const neb = scroller.querySelector<HTMLElement>(".plx-nebula");
    const stages = [...scroller.querySelectorAll<HTMLElement>("[data-speed]")];
    const scenes = [...scroller.querySelectorAll<HTMLElement>(".scene")];

    // Chat reveal: add .vis to each bubble on a timer; removing .vis collapses it back.
    const chatBubbles = [...scroller.querySelectorAll<HTMLElement>(".chat .bubble")];
    const bubbleDelays = [0.36, 1.08, 1.92, 2.64, 3.48, 4.32, 5.16, 6.0];
    let chatTimers: ReturnType<typeof setTimeout>[] = [];

    const startChat = () => {
      chatTimers.forEach(clearTimeout);
      chatTimers = bubbleDelays.map((d, i) =>
        setTimeout(() => chatBubbles[i]?.classList.add("vis"), d * 1000)
      );
    };
    const resetChat = () => {
      chatTimers.forEach(clearTimeout);
      chatTimers = [];
      chatBubbles.forEach((b) => b.classList.remove("vis"));
    };

    // Reveal scenes on enter (hero stays revealed).
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            if (e.target.id === "plx-s-agent") startChat();
          } else if (e.target.id !== "plx-hero") {
            e.target.classList.remove("in");
            if (e.target.id === "plx-s-agent") resetChat();
          }
        });
      },
      { root: scroller, threshold: 0.32 }
    );
    scenes.forEach((s) => io.observe(s));

    let ticking = false;
    function onScroll() {
      if (!scroller) { ticking = false; return; }
      const y = scroller.scrollTop;
      const vh = scroller.clientHeight;
      bar?.classList.toggle("solid", y > vh * 0.6);
      if (reduceMotion) { ticking = false; return; }
      if (neb) neb.style.transform = `translate(${y * -0.03}px, ${y * 0.10}px)`;
      for (const el of stages) {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const off = (center - vh / 2) / vh;
        // Vertical-only depth, no horizontal shear (nothing drifts in from the side); halved
        // so scenes settle crisply at their snap position instead of sliding around.
        const sy = parseFloat(el.dataset.speed || "0") * 0.5;
        el.style.transform = `translateY(${off * sy}px)`;
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
      resetChat();
    };
  }, []);

  return (
    <div className="plx" ref={rootRef}>
      <div className="plx-bg">
        <div className="plx-nebula" />
        <div className="plx-aurora" />
        <div className="plx-veil" />
      </div>

      <div className="plx-bar">
        <div className="logo-row">
          <img src="/woosh_logo.png" alt="Woosh" />
          <span className="wordmark">woosh</span>
        </div>
        <button className="btn-g" onClick={go(appHref)}>Open app</button>
      </div>

      <main>
        {/* Hero */}
        <section className="scene in hero" id="plx-hero">
          <h1 className="rise d1">Get paid<br /><span className="grad">in seconds.</span></h1>
          <p className="sub rise d2">A self-custodial USDC wallet that starts with your email, and an agent that handles the rest.</p>
          <div className="cta-row rise d3">
            <button className="btn-p" onClick={go(appHref)}>{hasSession ? "Open your wallet" : "Create your wallet"}</button>
            <button className="btn-g" style={{ padding: "13px 22px", fontSize: 15 }} onClick={seeHow}>See how it works</button>
          </div>
          <div className="scroll-cue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
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
            <h2 className="rise d1">A name or a link. <span className="grad">That&apos;s it.</span></h2>
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
              <circle r="3" fill="#0ea5e9"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite"><mpath href="#plx-wire" /></animateMotion></circle>
            </svg>
            <div className="xfer-labels">
              <div className="xlbl" style={{ left: "12.5%", top: "80%" }}><b>You</b><span>0x1a2b…9f4c</span></div>
              <div className="xlbl" style={{ left: "87.5%", top: "80%" }}><b>@alex</b><span>+$20.00</span></div>
            </div>
          </div>
        </section>

        {/* 03 Agent */}
        <section className="scene" id="plx-s-agent">
          <div className="head" data-speed="22" data-speed-x="-13">
            <p className="eyebrow rise">03 / Woosh Agent</p>
            <h2 className="rise d1">Just <span className="grad">tell Woosh.</span></h2>
            <p className="sub rise d2">A built-in AI agent that speaks plain language. Send, request, check balances, and set up strategies by chat.</p>
          </div>
          <div className="stage rise d2" data-speed="-42" data-speed-x="18">
            <div className="chat">
              <div className="bubble user">send $25 to @sara</div>
              <div className="bubble agent">Sent <b>$25.00 USDC</b> to <b>@sara</b> <span className="tick">✓</span>, confirmed on Arc.</div>
              <div className="bubble user">what&apos;s my balance?</div>
              <div className="bubble agent">Your balance is <b>143.50 USDC</b>.</div>
              <div className="bubble user">request $80 from @mike for design work</div>
              <div className="bubble agent">Invoice created. Share the link: <b>woosh.app/i/0x4f2a…</b> <span className="tick">✓</span></div>
              <div className="bubble user">buy $50 of cirBTC every week automatically</div>
              <div className="bubble agent">DCA strategy set up. <b>$50 USDC → cirBTC</b>, runs every 7 days <span className="tick">✓</span></div>
            </div>
          </div>
        </section>

        {/* 04 Strategies */}
        <section className="scene" id="plx-s-strategy">
          <div className="head" data-speed="22" data-speed-x="13">
            <p className="eyebrow rise">04 / Strategies</p>
            <h2 className="rise d1">Set a rule. <span className="grad">It runs itself.</span></h2>
            <p className="sub rise d2">Recurring payments that never miss, or DCA that quietly stacks an asset week after week. On schedule, no PIN, fully automated.</p>
          </div>
          <div className="stage strat-stack rise d2" data-speed="-40" data-speed-x="-18">
            {/* Recurring — the same payment, every period, paid on time */}
            <div className="scard">
              <div className="scard-head">
                <span className="scard-ic blue">↻</span>
                <span className="t">Rent · Recurring</span>
                <span className="s">$200 / mo</span>
              </div>
              <div className="srow"><span className="d">Apr 1</span><span className="m">Sent <b>$200</b> to @landlord</span><span className="tick">✓</span></div>
              <div className="srow"><span className="d">May 1</span><span className="m">Sent <b>$200</b> to @landlord</span><span className="tick">✓</span></div>
              <div className="srow"><span className="d">Jun 1</span><span className="m">Sent <b>$200</b> to @landlord</span><span className="tick">✓</span></div>
              <div className="srow pending"><span className="d">Jul 1</span><span className="m">Scheduled</span><span className="wait">○</span></div>
            </div>
            {/* DCA — fixed $50 weekly, buying more or less cirBTC as price moves (averaging) */}
            <div className="scard">
              <div className="scard-head">
                <span className="scard-ic amber">₿</span>
                <span className="t">DCA · cirBTC</span>
                <span className="s">$50 / wk</span>
              </div>
              <div className="srow"><span className="d">Wk 1</span><span className="m"><b>$50</b> <span className="plus">→ +0.00012</span> cirBTC</span><span className="tick">✓</span></div>
              <div className="srow"><span className="d">Wk 2</span><span className="m"><b>$50</b> <span className="plus">→ +0.00015</span> cirBTC</span><span className="tick">✓</span></div>
              <div className="srow"><span className="d">Wk 3</span><span className="m"><b>$50</b> <span className="plus">→ +0.00011</span> cirBTC</span><span className="tick">✓</span></div>
              <div className="scard-total"><span className="lbl">Accumulated</span><span className="val grad">0.00038 cirBTC</span></div>
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
            <button className="btn-g" style={{ padding: "13px 22px", fontSize: 15 }} onClick={go(appHref)}>Explore the app</button>
          </div>
          <p className="sub rise d3" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.06em", marginTop: 30, opacity: 0.7 }}>
            Powered by Arc
          </p>
          <div className="plx-cta-footer"><Footer /></div>
        </section>
      </main>
    </div>
  );
}
