"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";

// 320 dots: 20×16 grid with per-dot jitter for organic look
const COLS = 34;
const ROWS = 26;
const DOTS = Array.from({ length: COLS * ROWS }, (_, i) => ({
  id: i,
  left: (i % COLS) * (100 / COLS) + ((i * 7 + 3) % (100 / COLS)),
  top:  Math.floor(i / COLS) * (100 / ROWS) + ((i * 5 + 11) % (100 / ROWS)),
  delay:    -((i * 1.7) % 7),
  duration: 3 + ((i * 17) % 40) / 10,
  small: i % 3 === 0,  // every third dot is smaller
}));

const HOW_IT_WORKS = [
  {
    label: "To receive",
    accent: "text-blue-primary",
    bubble: "bg-blue-primary/10 text-blue-primary",
    steps: [
      "Sign up with email",
      "Get your link: woosh.app/pay/you",
      "Share it. Get paid from anywhere.",
    ],
  },
  {
    label: "To pay",
    accent: "text-blue-secondary",
    bubble: "bg-blue-secondary/10 text-blue-secondary",
    steps: [
      "Open the payment link",
      "Enter amount, confirm",
      "Arrives in under a second.",
    ],
  },
  {
    label: "Built for agents",
    accent: "text-green-300",
    bubble: "bg-green-300/10 text-green-300",
    steps: [
      "Every payment link is machine-readable",
      "Payments settle on-chain, verifiable instantly",
      "Programmatic API in V2",
    ],
  },
];

export default function HomePage() {
  // refs for the inner parallax container and individual dots
  const bgRef    = useRef<HTMLDivElement | null>(null);
  const dotsRef  = useRef<(HTMLSpanElement | null)[]>(Array(COLS * ROWS).fill(null));
  const mouseRef   = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef(DOTS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })));
  const bgPos    = useRef({ x: 0, y: 0 }); // current parallax offset (lerped)
  const rafRef   = useRef(0);

  useEffect(() => {
    const RADIUS        = 160;    // px — repulsion reach
    const FORCE         = 1.4;   // impulse per frame at zero distance
    const FRICTION      = 0.88;  // velocity decay per frame
    const SPRING        = 0.0002; // very weak pull back to origin (~10x slower than push)
    const PARALLAX_MAX  = 12;    // px — max background offset
    const PARALLAX_LERP = 0.018; // smoothing (lower = lazier)

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove);

    const tick = () => {
      const mouse = mouseRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Parallax: move bg opposite to cursor (skip until first mouse move) ──
      const targetBgX = mouse ? ((mouse.x - vw / 2) / (vw / 2)) * -PARALLAX_MAX : 0;
      const targetBgY = mouse ? ((mouse.y - vh / 2) / (vh / 2)) * -PARALLAX_MAX : 0;
      const mx = mouse?.x ?? -9999;
      const my = mouse?.y ?? -9999;
      bgPos.current.x += (targetBgX - bgPos.current.x) * PARALLAX_LERP;
      bgPos.current.y += (targetBgY - bgPos.current.y) * PARALLAX_LERP;
      if (bgRef.current) {
        bgRef.current.style.transform =
          `translate(${bgPos.current.x.toFixed(2)}px, ${bgPos.current.y.toFixed(2)}px)`;
      }

      // ── Per-dot repulsion physics ──
      DOTS.forEach((dot, i) => {
        const el = dotsRef.current[i];
        if (!el) return;

        const nx = (dot.left / 100) * vw;
        const ny = (dot.top  / 100) * vh;
        const s  = stateRef.current[i];

        const dist = Math.hypot(mx - (nx + s.x), my - (ny + s.y));
        if (dist < RADIUS && dist > 0) {
          const strength = ((RADIUS - dist) / RADIUS) * FORCE;
          const angle    = Math.atan2((ny + s.y) - my, (nx + s.x) - mx);
          s.vx += Math.cos(angle) * strength;
          s.vy += Math.sin(angle) * strength;
        }

        // Weak spring pulling back to origin
        s.vx += -s.x * SPRING;
        s.vy += -s.y * SPRING;

        s.vx *= FRICTION;
        s.vy *= FRICTION;
        s.x  += s.vx;
        s.y  += s.vy;

        if (Math.abs(s.vx) > 0.005 || Math.abs(s.vy) > 0.005 || Math.abs(s.x) > 0.05 || Math.abs(s.y) > 0.05) {
          el.style.transform = `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px)`;
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <main className="min-h-screen md:h-screen md:min-h-[660px] bg-navy text-text-primary md:flex md:flex-col">
      {/* Full-screen animated background */}
      <div className="woosh-bg" aria-hidden="true">
        <div ref={bgRef} style={{ position: "absolute", inset: "-50px" }}>
          {DOTS.map(({ id, left, top, delay, duration, small }, i) => (
            <span
              key={id}
              ref={(el) => { dotsRef.current[i] = el; }}
              className="woosh-dot"
              style={{
                left: `${left}%`,
                top:  `${top}%`,
                animationDelay:    `${delay}s`,
                animationDuration: `${duration}s`,
                width:  small ? "1.5px" : undefined,
                height: small ? "1.5px" : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* Nav */}
      <div className="relative z-10 shrink-0">
        <BrandHeader />
      </div>

      {/* Middle area: hero + how-it-works share remaining space on desktop */}
      <div className="relative z-10 md:flex-1 md:flex md:flex-col md:justify-center">

      {/* Hero */}
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
          Get your payment link
        </Link>
      </section>

      {/* How it works */}
      <section className="mt-8 md:mt-12 px-6 pb-20 md:pb-8 max-w-5xl mx-auto w-full shrink-0">
        <h2 className="text-2xl font-semibold text-center mb-8 md:mb-4">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map(({ label, accent, bubble, steps }) => (
            <div
              key={label}
              className="glass-card rounded-card p-6 md:p-4"
            >
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

      </div>{/* end middle */}

      <Footer />
    </main>
  );
}
