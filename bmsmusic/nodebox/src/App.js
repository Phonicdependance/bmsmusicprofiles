// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import datasetRaw from "./data.json";

/* =========================================================
   Fixes in this version
   1) Undulation is REAL (SVG turbulence animation), not CSS gradients
   2) Background is PURE BLACK (no starfield code anywhere)
   3) No “score” text anywhere (energy bars only)
   4) Uses your new dataset reliably (normalizes strings/arrays)
   5) Mobile-first: tap to select, tap again to clear
   ========================================================= */

/* ---------- utilities ---------- */

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toArrayLoose(v) {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x).trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase());
  }
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toLowerCase());
}

function yearToNumber(y) {
  const s = String(y ?? "").toLowerCase();
  const m = s.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/* ---------- normalize dataset ---------- */

function normalizeDataset(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((d, idx) => {
      const id = d.id ? String(d.id).trim() : `s-${String(idx + 1).padStart(2, "0")}`;
      return {
        id,
        name: d.name ? String(d.name).trim() : id,
        year: yearToNumber(d.year),
        collab: d.collab ? String(d.collab).trim().toLowerCase() : "",
        instruments: toArrayLoose(d.instruments),
        genres: toArrayLoose(d.genres),
        artists: toArrayLoose(d.artists),
        roles: toArrayLoose(d.role ?? d.roles),
        geek: toArrayLoose(d.geek),
      };
    })
    .filter((d) => d.id);
}

/* ---------- similarity (internal only) ---------- */

function toSet(arr) {
  return new Set((arr || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean));
}

function overlapCount(A, B) {
  let c = 0;
  A.forEach((v) => {
    if (B.has(v)) c++;
  });
  return c;
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a.id === b.id) return 0;

  const Ai = toSet(a.instruments);
  const Bi = toSet(b.instruments);

  const Ag = toSet(a.genres);
  const Bg = toSet(b.genres);

  const Aa = toSet(a.artists);
  const Ba = toSet(b.artists);

  const Ar = toSet(a.roles);
  const Br = toSet(b.roles);

  const Ak = toSet(a.geek);
  const Bk = toSet(b.geek);

  const ins = overlapCount(Ai, Bi);
  const gen = overlapCount(Ag, Bg);
  const art = overlapCount(Aa, Ba);
  const rol = overlapCount(Ar, Br);
  const gek = overlapCount(Ak, Bk);

  let s = ins * 3 + gen * 2 + art * 2 + rol * 1 + gek * 1;

  const ca = (a.collab || "").toLowerCase();
  const cb = (b.collab || "").toLowerCase();
  if (ca === "yes" && (cb === "yes" || cb === "maybe")) s += 1;
  if (cb === "yes" && (ca === "yes" || ca === "maybe")) s += 1;

  return s;
}

/* ---------- deterministic centered layout ---------- */

function computePositions(data, W, H) {
  const cx = W / 2;
  const cy = H / 2;

  const spreadX = Math.max(140, W * 0.36);
  const spreadY = Math.max(120, H * 0.28);

  return data.map((d) => {
    const seed = hashSeed(d.id);
    const rnd = mulberry32(seed);

    const u1 = rnd();
    const u2 = rnd();
    const u3 = rnd();

    const r = Math.pow(u1, 0.62);
    const a = u2 * Math.PI * 2;

    const jx = (u3 * 2 - 1) * 18;
    const jy = (rnd() * 2 - 1) * 14;

    const x = cx + Math.cos(a) * r * spreadX + jx;
    const y = cy + Math.sin(a) * r * spreadY + jy;

    return {
      ...d,
      _seed: seed,
      cx: clamp(x, 26, W - 26),
      cy: clamp(y, 26, H - 26),
    };
  });
}

/* ---------- organic dot shape ---------- */

function jitteredBlobPath(cx, cy, r, seed, points, jitter) {
  const rnd = mulberry32(seed);
  const a0 = rnd() * Math.PI * 2;
  const step = (Math.PI * 2) / points;

  const pts = Array.from({ length: points }, (_, i) => {
    const a = a0 + i * step;
    const k = 1 + (rnd() * 2 - 1) * jitter;
    return {
      x: cx + Math.cos(a) * r * k,
      y: cy + Math.sin(a) * r * k,
    };
  });

  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const m0 = mid(pts[0], pts[1]);

  let d = `M ${m0.x} ${m0.y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const m = mid(p, q);
    d += ` Q ${p.x} ${p.y} ${m.x} ${m.y}`;
  }
  d += " Z";
  return d;
}

function Blob({ cx, cy, size, seed, opacity }) {
  const rnd = mulberry32(seed);
  const points = 10 + Math.floor(rnd() * 3);
  const jitter = 0.18 + rnd() * 0.18;
  const r = size * (0.98 + rnd() * 0.08);
  const d = jitteredBlobPath(cx, cy, r, seed + 77, points, jitter);
  return <path d={d} fill="#cfd6df" opacity={opacity} />;
}

/* ---------- energy bars (no numbers) ---------- */

function EnergyBars({ level = 1, max = 5 }) {
  const bars = Array.from({ length: max }, (_, i) => i < level);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
      {bars.map((on, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 8 + i * 2,
            borderRadius: 2,
            background: on ? "rgba(207,214,223,0.95)" : "rgba(207,214,223,0.16)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- viewport ---------- */

function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 360,
    h: typeof window !== "undefined" ? window.innerHeight : 640,
  }));

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return vp;
}

/* ========================================================= */

export default function App() {
  const { w: W, h: H } = useViewport();

  // IMPORTANT: this ensures new data.json changes are picked up reliably in dev
  const dataset = useMemo(() => normalizeDataset(datasetRaw), [datasetRaw]);

  const nodes = useMemo(() => computePositions(dataset, W, H), [dataset, W, H]);

  const [active, setActive] = useState(null);
  const [isTouchLike, setIsTouchLike] = useState(W < 700);
  const [mouse, setMouse] = useState({ x: 12, y: 12 });

  useEffect(() => {
    setIsTouchLike(W < 700);
  }, [W]);

  const links = useMemo(() => {
    if (!active) return [];

    const base = active;

    const scored = nodes
      .filter((n) => n.id !== base.id)
      .map((n) => ({ n, s: similarityScore(base, n) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    const max = scored.length ? scored[0].s : 1;

    return scored.map(({ n, s }) => {
      const ratio = s / max;
      const level = clamp(Math.round(1 + ratio * 4), 1, 5);
      const alpha = clamp(0.18 + ratio * 0.62, 0.18, 0.85);

      return {
        from: base,
        to: n,
        level,
        alpha,
        pid: `p_${base.id.replace(/\W/g, "_")}_${n.id.replace(/\W/g, "_")}`,
      };
    });
  }, [active, nodes]);

  const onSelectNode = (d) => {
    setActive((prev) => (prev?.id === d.id ? null : d));
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "#000",
        position: "relative",
        overflow: "hidden",
        touchAction: "manipulation",
      }}
    >
      <svg
        width="100%"
        height="100%"
        onPointerMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
        onPointerDown={(e) => setIsTouchLike(e.pointerType === "touch" || W < 700)}
        style={{ display: "block" }}
      >
        <defs>
          {/* pure black base */}
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="pulseGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.6" result="pblur" />
            <feMerge>
              <feMergeNode in="pblur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* TRUE undulating “water” effect (animated turbulence) */}
          <filter id="water">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.010 0.018"
              numOctaves="2"
              seed="8"
              result="noise"
            >
              <animate attributeName="baseFrequency" dur="8s" values="0.010 0.018;0.014 0.012;0.010 0.018" repeatCount="indefinite" />
              <animate attributeName="seed" dur="10s" values="8;12;8" repeatCount="indefinite" />
            </feTurbulence>

            <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* subtle silver sheen used by the background ripples */}
          <radialGradient id="sheen" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* black background */}
        <rect width="100%" height="100%" fill="#000" />

        {/* undulation overlay (no stars) */}
        <g filter="url(#water)" opacity="0.9" style={{ mixBlendMode: "screen" }}>
          <rect x="-15%" y="-15%" width="130%" height="130%" fill="url(#sheen)" />
        </g>

        {/* energy links */}
        {active && (
          <g>
            {links.map((l, idx) => {
              const x1 = l.from.cx;
              const y1 = l.from.cy;
              const x2 = l.to.cx;
              const y2 = l.to.cy;

              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const bend = 0.18;
              const qx = mx + (y1 - y2) * bend;
              const qy = my + (x2 - x1) * bend;

              const d = `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`;

              return (
                <g key={l.pid}>
                  <path
                    id={l.pid}
                    d={d}
                    fill="none"
                    stroke="rgba(207,214,223,0.9)"
                    strokeWidth={1.2}
                    opacity={l.alpha}
                  />
                  <circle r={2.4} fill="rgba(207,214,223,0.95)" filter="url(#pulseGlow)">
                    <animate attributeName="opacity" values="0.2;0.9;0.2" dur="1.6s" repeatCount="indefinite" begin={`${idx * 0.12}s`} />
                    <animateMotion dur={`${1.6 + idx * 0.18}s`} repeatCount="indefinite" begin={`${idx * 0.12}s`} rotate="auto">
                      <mpath href={`#${l.pid}`} />
                    </animateMotion>
                  </circle>
                </g>
              );
            })}
          </g>
        )}

        {/* dots */}
        <g filter="url(#softGlow)">
          {nodes.map((d) => {
            const isActive = active?.id === d.id;

            const isBig = (d._seed % 2) === 0;
            const small = 6.2;
            const big = 8.2;

            const size = isActive ? (isBig ? big + 2.2 : small + 2.2) : isBig ? big : small;
            const opacity = isActive ? 0.96 : 0.72;

            return (
              <g
                key={d.id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelectNode(d);
                }}
                style={{ cursor: "pointer" }}
              >
                <Blob cx={d.cx} cy={d.cy} size={size} seed={d._seed} opacity={opacity} />
              </g>
            );
          })}
        </g>
      </svg>

      {/* hint */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          color: "rgba(207,214,223,0.72)",
          fontSize: 12,
          letterSpacing: 0.2,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        Tap a dot to send energy · Tap again to clear
      </div>

      {/* info panel */}
      {active && (
        <div
          style={{
            position: "absolute",
            left: isTouchLike ? 12 : clamp(mouse.x + 12, 12, W - 280),
            top: isTouchLike ? "auto" : clamp(mouse.y + 12, 12, H - 220),
            bottom: isTouchLike ? 56 : "auto",
            width: isTouchLike ? "calc(100% - 24px)" : 270,
            background: "rgba(0,0,0,0.74)",
            border: "1px solid rgba(207,214,223,0.18)",
            color: "rgba(207,214,223,0.95)",
            padding: "12px 12px",
            borderRadius: 14,
            fontSize: 12,
            lineHeight: 1.35,
            pointerEvents: "none",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
            {active.name}
            {active.year ? ` (Y${active.year})` : ""}
          </div>

          <div style={{ opacity: 0.9, marginBottom: 4 }}>
            {(active.instruments || []).slice(0, 6).join(", ")}
          </div>

          <div style={{ opacity: 0.72, marginBottom: 8 }}>
            {(active.genres || []).slice(0, 6).join(", ")}
          </div>

          {links.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.82, marginBottom: 6 }}>
                Energy flows toward
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {links.map((l) => (
                  <div
                    key={l.to.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      gap: 10,
                    }}
                  >
                    <div style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.to.name}
                    </div>
                    <EnergyBars level={l.level} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {links.length === 0 && <div style={{ opacity: 0.75 }}>No strong overlaps found yet.</div>}
        </div>
      )}
    </div>
  );
}
