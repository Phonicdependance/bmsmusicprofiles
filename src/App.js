import React, { useEffect, useMemo, useState } from "react";
import datasetRaw from "./data.json";

/* =========================================================
   PERFECT CIRCLE layout (single-select)
   - Straight flashlight lines
   - Moderate thickness scaling
   - Fixed info panel (top-left): names + single fill bar
   - Fixed profile panel (top-right): selected student's profile
   - Green terminal-style text
   ========================================================= */

/* ---------- utilities ---------- */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toArrayLoose(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function yearToNumber(y) {
  const m = String(y ?? "").match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/* ---------- dataset ---------- */

function normalizeDataset(raw) {
  return (Array.isArray(raw) ? raw : []).map((d, i) => ({
    id: d.id ?? `s-${i}`,
    name: d.name ?? d.id ?? `Student ${i + 1}`,
    year: yearToNumber(d.year),
    instruments: toArrayLoose(d.instruments),
    genres: toArrayLoose(d.genres),
    artists: toArrayLoose(d.artists),
    roles: toArrayLoose(d.roles),
    geek: toArrayLoose(d.geek),
    collab: d.collab ?? "",
  }));
}

/* ---------- similarity ---------- */

function toSet(arr) {
  return new Set((arr || []).map((x) => String(x).toLowerCase()));
}

function overlapCount(A, B) {
  let c = 0;
  A.forEach((v) => B.has(v) && c++);
  return c;
}

function similarityScore(a, b) {
  if (!a || !b || a.id === b.id) return 0;

  return (
    overlapCount(toSet(a.instruments), toSet(b.instruments)) * 3 +
    overlapCount(toSet(a.genres), toSet(b.genres)) * 2 +
    overlapCount(toSet(a.artists), toSet(b.artists)) * 2 +
    overlapCount(toSet(a.roles), toSet(b.roles)) +
    overlapCount(toSet(a.geek), toSet(b.geek))
  );
}

/* ---------- circle layout ---------- */

function computeCirclePositions(data, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.42;
  const offset = -Math.PI / 2;

  return [...data]
    .sort((a, b) => (a.year ?? 99) - (b.year ?? 99))
    .map((d, i, arr) => {
      const a = offset + (i / arr.length) * Math.PI * 2;
      return {
        ...d,
        cx: cx + Math.cos(a) * r,
        cy: cy + Math.sin(a) * r,
      };
    });
}

/* ---------- single fill bar ---------- */

function FillBar({ value01 }) {
  const v = clamp(value01 ?? 0, 0, 1);
  return (
    <div
      style={{
        width: 92,
        height: 10,
        border: "1px solid rgba(0,255,100,0.45)",
        background: "rgba(0,255,100,0.10)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.round(v * 100)}%`,
          height: "100%",
          background: "#00ff66",
        }}
      />
    </div>
  );
}

/* ---------- viewport ---------- */

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  return vp;
}

/* ========================================================= */

export default function App() {
  const { w: W, h: H } = useViewport();
  const dataset = useMemo(() => normalizeDataset(datasetRaw), []);
  const nodes = useMemo(
    () => computeCirclePositions(dataset, W, H),
    [dataset, W, H]
  );

  const [active, setActive] = useState(null);

  const links = useMemo(() => {
    if (!active) return [];

    const scored = nodes
      .filter((n) => n.id !== active.id)
      .map((n) => ({ n, s: similarityScore(active, n) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);

    const max = scored[0]?.s ?? 1;

    return scored.map(({ n, s }) => {
      const ratio = clamp(s / max, 0, 1);
      return {
        from: active,
        to: n,
        ratio,
        width: 1.2 + ratio * 3.2,
      };
    });
  }, [active, nodes]);

  const panelStyle = {
    position: "absolute",
    width: 220,
    background: "rgba(0,0,0,0.92)",
    border: "1px solid rgba(0,255,100,0.4)",
    color: "#00ff66",
    padding: 8,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };

  const profileLine = (label, arrOrStr) => {
    const arr = Array.isArray(arrOrStr) ? arrOrStr : toArrayLoose(arrOrStr);
    if (!arr.length) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>{label}</div>
        <div style={{ textTransform: "none", letterSpacing: 0 }}>
          {arr.join(", ")}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: "#000", height: "100vh", overflow: "hidden" }}>
      <svg width="100%" height="100%">
        {links.map((l) => (
          <line
            key={l.to.id}
            x1={l.from.cx}
            y1={l.from.cy}
            x2={l.to.cx}
            y2={l.to.cy}
            stroke="#cfd6df"
            strokeWidth={l.width}
            strokeLinecap="round"
            opacity={0.75}
          />
        ))}

        {nodes.map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={d.id === active?.id ? 11 : 9}
            fill="#e5e9ef"
            opacity={0.9}
            onPointerDown={() => setActive((p) => (p?.id === d.id ? null : d))}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>

      {/* TOP-LEFT: connections (names + single bar) */}
      {active && (
        <div style={{ ...panelStyle, top: 12, left: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            {active.name} {active.year ? `(Y${active.year})` : ""}
          </div>

          {links.map((l) => (
            <div
              key={l.to.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                gap: 10,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {l.to.name}
              </div>
              <FillBar value01={l.ratio} />
            </div>
          ))}
        </div>
      )}

      {/* TOP-RIGHT: selected student's profile */}
      {active && (
        <div style={{ ...panelStyle, top: 12, right: 12, width: 320 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            Profile
          </div>

          {profileLine("Student", [active.name])}
          {active.year != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ opacity: 0.8, marginBottom: 2 }}>Year</div>
              <div style={{ textTransform: "none", letterSpacing: 0 }}>
                {active.year}
              </div>
            </div>
          )}

          {profileLine("Instruments", active.instruments)}
          {profileLine("Genres", active.genres)}
          {profileLine("Artists", active.artists)}
          {profileLine("Roles", active.roles)}
          {profileLine("Geek", active.geek)}
          {active.collab
            ? profileLine("Collab", [String(active.collab)])
            : null}
        </div>
      )}
    </div>
  );
}
