"use client";

import { useEffect, useRef } from "react";

/**
 * LiquidHero — night-sky background for the landing page.
 *
 * Layers:
 * 1. WebGL quad — dark domain-warped aurora (pure time-based, no cursor glow).
 * 2. Canvas2D — twinkling star field (~320 stars, biased toward small/dim).
 * 3. Shooting stars — appear randomly, fall diagonally with a fading trail.
 * 4. Parallax — slow depth-aware drift: near stars shift more as cursor moves.
 * 5. Scatter — fast-moving cursor sends nearby stars flying; they drift home
 *    exponentially (no spring bounce).
 */

// ── WebGL shaders ─────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Aurora only — no cursor glow, deliberately dim so stars are the subject.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform float uIntro;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.08;

  // Two-octave domain warp — organic, slow drift
  vec2 q = p;
  q += 0.22 * vec2(sin(p.y * 1.9 + t * 2.6), cos(p.x * 1.7 - t * 2.1));
  q += 0.10 * vec2(sin(q.y * 3.9 - t * 1.8 + 2.4), sin(q.x * 3.3 + t * 2.3 + 0.8));

  // Diagonal flow bands
  float w  = q.x * 0.85 - q.y * 1.25;
  float b1 = 0.5 + 0.5 * sin(w * 2.0 + t * 3.0);
  float b2 = 0.5 + 0.5 * sin(w * 3.4 - t * 2.2 + 1.7);
  float b3 = 0.5 + 0.5 * sin((q.x + q.y * 0.6) * 1.5 + t * 1.5 + 4.2);

  // Very dark palette — aurora is atmosphere, not subject
  vec3 navy = vec3(0.033, 0.047, 0.094);   // slightly darker than #0A0F1E
  vec3 deep = vec3(0.043, 0.071, 0.145);
  vec3 blue = vec3(0.055, 0.647, 0.914);
  vec3 cyan = vec3(0.024, 0.714, 0.831);

  vec3 col = navy;
  col = mix(col, deep, b3 * 0.40);
  col = mix(col, blue * 0.10, smoothstep(0.38, 1.0, b1) * 0.45);
  col = mix(col, cyan * 0.09, smoothstep(0.48, 1.0, b2) * 0.35);

  // Darken reading area so hero text stays readable
  vec2 g = (uv - vec2(0.5, 0.60)) * vec2(1.3, 2.0);
  col = mix(col, navy, 0.60 * exp(-dot(g, g) * 2.4));

  col = mix(navy, col, uIntro);

  // Grain dither — kills banding on very dark gradients
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.010;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ── WebGL helpers ─────────────────────────────────────────────────────────────

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[LiquidHero]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// ── Star types ────────────────────────────────────────────────────────────────

type Star = {
  x: number; y: number;        // rest position, normalised 0..1
  z: number;                   // depth: 0.3 (far) … 1.0 (near)
  r: number;                   // draw radius
  a: number;                   // base alpha
  twPhase: number; twSpeed: number;
  color: string;               // "r,g,b"
  ox: number; oy: number;      // parallax + scatter offset in pixels
  vx: number; vy: number;      // scatter velocity
  flare: number;               // transient brightness on hover
};

// A shooting star — head position + velocity + life 1→0
type Shoot = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  trailLen: number;
  alpha: number;
};

// ── Star factory ──────────────────────────────────────────────────────────────

const STAR_COUNT  = 650;
const STAR_COLORS = ["241,245,249", "210,230,248", "148,210,243", "186,222,247", "255,255,255"];

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => {
    // Exponent 3.5 → heavy bias toward tiny far stars; near stars rare but bright
    const z = 0.15 + Math.pow(Math.random(), 3.5) * 0.85;
    return {
      x: Math.random(), y: Math.random(),
      z,
      r: 0.15 + z * 1.6,
      a: 0.04 + z * 0.55,
      twPhase: Math.random() * Math.PI * 2,
      twSpeed: 0.4 + Math.random() * 1.2,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      ox: 0, oy: 0, vx: 0, vy: 0, flare: 0,
    };
  });
}

// ── Shooting-star factory ─────────────────────────────────────────────────────

function spawnShoot(vw: number, vh: number): Shoot {
  // Spawn on left/right edges or top strip; direction determines which side makes sense
  const fromSide = Math.random() < 0.55;
  const sx = fromSide
    ? (Math.random() < 0.5 ? Math.random() * vw * 0.08 : vw * (0.92 + Math.random() * 0.08))
    : Math.random() * vw;
  const sy = fromSide
    ? Math.random() * vh * 0.70
    : Math.random() * vh * 0.25;

  // Direction: mostly sideways with slight downward drift (20°–55° from horizontal)
  const angle = Math.PI * (0.11 + Math.random() * 0.19);
  const nx = Math.cos(angle) * (Math.random() < 0.5 ? 1 : -1);
  const ny = Math.sin(angle); // small downward component
  const spd = (5.25 + Math.random() * 6.75);
  return {
    x: sx, y: sy,
    vx: nx * spd,
    vy: ny * spd,
    life: 1,
    trailLen: 55 + Math.random() * 85,
    alpha: 0.55 + Math.random() * 0.35,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiquidHero() {
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const starsCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.display = "";

    const gl =
      canvas.getContext("webgl", { antialias: false, depth: false, stencil: false }) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl || gl.isContextLost()) { canvas.style.display = "none"; return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { canvas.style.display = "none"; return; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[LiquidHero]", gl.getProgramInfoLog(prog));
      canvas.style.display = "none"; return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(prog, "uRes");
    const uTime  = gl.getUniformLocation(prog, "uTime");
    const uIntro = gl.getUniformLocation(prog, "uIntro");

    // ── Star + shoot layers ───────────────────────────────────────────────────
    const starsCanvas = starsCanvasRef.current;
    const sctx = starsCanvas?.getContext("2d") ?? null;
    const stars  = makeStars();
    const shoots: Shoot[] = [];
    let nextShootAt = 2.0; // seconds until first shooting star

    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
    const sdpr  = Math.min(window.devicePixelRatio || 1, 1.5);
    let vw = window.innerWidth;
    let vh = window.innerHeight;

    function resize() {
      vw = window.innerWidth; vh = window.innerHeight;
      const w = Math.max(1, Math.round(vw * scale));
      const h = Math.max(1, Math.round(vh * scale));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w; canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
      if (starsCanvas && sctx) {
        starsCanvas.width  = Math.round(vw * sdpr);
        starsCanvas.height = Math.round(vh * sdpr);
        sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
      }
    }
    resize();
    window.addEventListener("resize", resize);

    // ── Cursor tracking ───────────────────────────────────────────────────────
    const mousePx = { x: -9999, y: -9999, vx: 0, vy: 0 };
    const cursorNorm = { x: 0.5, y: 0.5 };
    let hasPointer = false;

    function onPointerMove(e: PointerEvent) {
      hasPointer = true;
      if (mousePx.x > -9000) {
        mousePx.vx = e.clientX - mousePx.x;
        mousePx.vy = e.clientY - mousePx.y;
      }
      mousePx.x = e.clientX;
      mousePx.y = e.clientY;
      cursorNorm.x = e.clientX / window.innerWidth;
      cursorNorm.y = e.clientY / window.innerHeight;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    function onPointerDown(e: PointerEvent) {
      // Burst of 5 stars flying into "space" — upper semicircle only (π … 2π).
      // In canvas coords y increases downward, so sin(π…2π) is negative = upward.
      const COUNT = 5;
      for (let i = 0; i < COUNT; i++) {
        // Spread evenly across upper arc with per-star jitter
        const base = Math.PI * (1.0 + i / (COUNT - 1));
        const angle = base + (Math.random() - 0.5) * 0.55;
        const spd = 8 + Math.random() * 6;
        shoots.push({
          x: e.clientX, y: e.clientY,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1,
          trailLen: 60 + Math.random() * 70,
          alpha: 0.65 + Math.random() * 0.35,
        });
      }
    }
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    // Parallax — smoothly follows cursor, different depth offset per star.
    // par.x/y are in the range -0.5 … +0.5 and lerp slowly toward the cursor.
    const par = { x: 0, y: 0 };
    const PAR_LERP   = 0.025; // how fast parallax catches up (lower = softer)
    const PAR_MAX_X  = 70;    // max px offset for a near star (z≈1) horizontally
    const PAR_MAX_Y  = 42;    // max px offset vertically

    const SCATTER_RADIUS = 130;
    const DAMP = 0.88;
    const HOME = 0.993;

    function stepStars(t: number, animate: boolean) {
      // Parallax: lerp toward cursor (or back to 0 when no cursor)
      const targetPX = hasPointer ? cursorNorm.x - 0.5 : 0;
      const targetPY = hasPointer ? cursorNorm.y - 0.5 : 0;
      par.x += (targetPX - par.x) * PAR_LERP;
      par.y += (targetPY - par.y) * PAR_LERP;

      // Gentle scatter — glow on hover, very small push (impulse 4× lower than before)
      const cSpeed = Math.hypot(mousePx.vx, mousePx.vy);
      if (animate && cSpeed > 0.5 && mousePx.x > -9000) {
        const boost = Math.min(cSpeed, 36);
        for (const s of stars) {
          const sx = s.x * vw + s.ox;
          const sy = s.y * vh + s.oy;
          const dx = sx - mousePx.x;
          const dy = sy - mousePx.y;
          const d  = Math.hypot(dx, dy);
          if (d < SCATTER_RADIUS && d > 0.001) {
            const k   = 1 - d / SCATTER_RADIUS;
            const imp = k * k * boost * 0.012 * (0.4 + 0.6 * s.z);
            s.vx += (dx / d) * imp + mousePx.vx * 0.003 * k;
            s.vy += (dy / d) * imp + mousePx.vy * 0.003 * k;
            s.flare = Math.min(1, s.flare + k * boost * 0.018);
          }
        }
      }
      for (const s of stars) {
        s.vx *= DAMP; s.vy *= DAMP;
        s.ox = (s.ox + s.vx) * HOME;
        s.oy = (s.oy + s.vy) * HOME;
        if (animate) s.flare *= 0.94;
      }
      mousePx.vx *= 0.82; mousePx.vy *= 0.82;

      // Shooting stars — advance + spawn
      if (animate) {
        for (let i = shoots.length - 1; i >= 0; i--) {
          const ss = shoots[i];
          ss.x += ss.vx; ss.y += ss.vy;
          ss.life -= 1 / 90; // ~1.5 second lifetime at 60fps
          if (ss.life <= 0 || ss.x < -200 || ss.x > vw + 200 || ss.y > vh + 200) {
            shoots.splice(i, 1);
          }
        }
        if (t > nextShootAt && shoots.length < 3) {
          shoots.push(spawnShoot(vw, vh));
          nextShootAt = t + 1.5 + Math.random() * 3.5; // 1.5–5 s gap
        }
      }
    }

    function drawStars(t: number, intro: number, animate: boolean) {
      if (!sctx) return;
      sctx.clearRect(0, 0, vw, vh);

      // ── Shooting stars ────────────────────────────────────────────────────
      for (const ss of shoots) {
        // Fade in for first 20% of life, full for middle, fade out for last 40%
        let a = ss.alpha;
        if (ss.life > 0.8) a *= (1 - ss.life) / 0.2;
        else if (ss.life < 0.4) a *= ss.life / 0.4;
        a *= intro;
        if (a <= 0.005) continue;

        const spd = Math.hypot(ss.vx, ss.vy);
        if (spd < 0.001) continue;
        const nx = ss.vx / spd, ny = ss.vy / spd;
        // Trail grows to full length over first 15% of life
        const tLen = ss.trailLen * Math.min(1, (1 - ss.life) / 0.15);
        const tailX = ss.x - nx * tLen;
        const tailY = ss.y - ny * tLen;

        const grad = sctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0,   `rgba(255,255,255,0)`);
        grad.addColorStop(0.6, `rgba(210,235,255,${(a * 0.3).toFixed(3)})`);
        grad.addColorStop(1,   `rgba(255,255,255,${a.toFixed(3)})`);
        sctx.strokeStyle = grad;
        sctx.lineWidth = 1.4;
        sctx.beginPath();
        sctx.moveTo(tailX, tailY);
        sctx.lineTo(ss.x, ss.y);
        sctx.stroke();

        // Bright head dot
        sctx.fillStyle = `rgba(255,255,255,${Math.min(1, a * 1.4).toFixed(3)})`;
        sctx.beginPath();
        sctx.arc(ss.x, ss.y, 1.4, 0, 6.2832);
        sctx.fill();
      }

      // ── Regular stars with parallax ───────────────────────────────────────
      for (const s of stars) {
        const tw    = animate ? 0.65 + 0.35 * Math.sin(t * s.twSpeed + s.twPhase) : 0.8;
        const alpha = Math.min(1, s.a * tw * intro + s.flare * 0.30);
        const radius = s.r * (1 + s.flare * 0.28);

        // Parallax offset — deeper stars move less
        const depth = Math.max(0, s.z - 0.15); // 0 for very far, up to ~0.85 for near
        const px = s.x * vw + s.ox + par.x * PAR_MAX_X * depth;
        const py = s.y * vh + s.oy + par.y * PAR_MAX_Y * depth;

        if (s.r > 1.1) {
          // Soft halo on the few bright stars
          sctx.fillStyle = `rgba(${s.color},${(alpha * 0.10).toFixed(3)})`;
          sctx.beginPath();
          sctx.arc(px, py, radius * 3, 0, 6.2832);
          sctx.fill();
        }
        sctx.fillStyle = `rgba(${s.color},${alpha.toFixed(3)})`;
        sctx.beginPath();
        sctx.arc(px, py, radius, 0, 6.2832);
        sctx.fill();
      }
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let raf = 0;

    function frame(now: number, animate: boolean) {
      const t     = (now - start) / 1000;
      const intro = Math.min(1, t / 1.8);
      const eased = intro * intro * (3 - 2 * intro);

      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, t);
      gl!.uniform1f(uIntro, eased);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);

      drawStars(t, eased, animate);
    }

    function loop(now: number) {
      const t = (now - start) / 1000;
      stepStars(t, true);
      frame(now, true);
      raf = requestAnimationFrame(loop);
    }

    function renderStatic() {
      stepStars(14, false);
      frame(start + 14000, false);
    }

    function startStop() {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      if (reducedMotion.matches) renderStatic();
      else raf = requestAnimationFrame(loop);
    }
    startStop();
    document.addEventListener("visibilitychange", startStop);
    reducedMotion.addEventListener("change", startStop);

    function onContextLost(e: Event) {
      e.preventDefault();
      cancelAnimationFrame(raf);
    }
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", startStop);
      reducedMotion.removeEventListener("change", startStop);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <>
      <div className="liquid-fallback" />
      <canvas ref={canvasRef}      className="absolute inset-0 h-full w-full" />
      <canvas ref={starsCanvasRef} className="absolute inset-0 h-full w-full" />
    </>
  );
}
