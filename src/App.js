import React, { useEffect, useMemo, useRef, useState } from "react";
import datasetRaw from "./data.json";

/* =========================================================
   CONSTELLATION CIRCLE (single-select)
   - Symmetrical year-group constellations around a big circle
   - Year labels inside each constellation ("Year 7", "Year 8", ...)
   - Straight connection lines (no 3D)
   - Connection mode dropdown (instrument / influences / ideal band)
   - Year filter (All / Y7 / Y8 / ...)
   - Links Top-N slider (min 3)
   - Search by name (jump/select)
   - Navigate selection: Left/Right arrows + mouse wheel
   - Top-left: selected + connections (raised)
   - Bottom-right: profile
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

function scoreInstrument(a, b) {
  return overlapCount(toSet(a.instruments), toSet(b.instruments)) * 3;
}

function scoreInfluences(a, b) {
  return (
    overlapCount(toSet(a.artists), toSet(b.artists)) * 3 +
    overlapCount(toSet(a.genres), toSet(b.genres)) * 2
  );
}

function scoreIdealBand(a, b) {
  return (
    overlapCount(toSet(a.instruments), toSet(b.instruments)) * 2 +
    overlapCount(toSet(a.roles), toSet(b.roles)) * 2 +
    overlapCount(toSet(a.genres), toSet(b.genres)) * 2 +
    overlapCount(toSet(a.artists), toSet(b.artists)) * 2 +
    overlapCount(toSet(a.geek), toSet(b.geek)) * 1
  );
}

function similarityScore(a, b, mode) {
  if (!a || !b || a.id === b.id) return 0;
  if (mode === "instrument") return scoreInstrument(a, b);
  if (mode === "influences") return scoreInfluences(a, b);
  return scoreIdealBand(a, b);
}

/* ---------- symmetrical constellation layout ---------- */

function computeConstellationPositions(data, W, H) {
  const cx = W / 2;
  const cy = H / 2;

  const margin = 28;
  const outerR = Math.max(0, Math.min(W, H) / 2 - margin);

  const byYear = new Map();
  for (const d of data) {
    const y = d.year ?? 99;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(d);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const groupCount = Math.max(1, years.length);

  // group centers around a ring (slightly elliptical to fit screens nicely)
  const groupRingRx = outerR * 0.66;
  const groupRingRy = outerR * 0.5;

  const localR = clamp(outerR * 0.18, 22, 110);
  const offset = -Math.PI / 2;

  const nodes = [];
  const groups = [];

  years.forEach((y, gi) => {
    const group = byYear.get(y) || [];
    const ga = offset + (gi / groupCount) * Math.PI * 2;

    const gcx = cx + Math.cos(ga) * groupRingRx;
    const gcy = cy + Math.sin(ga) * groupRingRy;

    // label placed toward center of canvas for navigation clarity
    const labelX = cx + (gcx - cx) * 0.55;
    const labelY = cy + (gcy - cy) * 0.55;

    groups.push({ year: y, gcx, gcy, labelX, labelY });

    const sorted = [...group].sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );

    const count = sorted.length;
    const ringR = count <= 1 ? 0 : count === 2 ? localR * 0.45 : localR * 0.86;

    const localOffset = ga - Math.PI / 2;

    sorted.forEach((d, i) => {
      const a =
        count <= 1 ? localOffset : localOffset + (i / count) * Math.PI * 2;

      nodes.push({
        ...d,
        cx: gcx + Math.cos(a) * ringR,
        cy: gcy + Math.sin(a) * ringR,
      });
    });
  });

  return { nodes, groups };
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

  const years = useMemo(() => {
    const ys = Array.from(
      new Set(dataset.map((d) => d.year).filter((y) => y != null))
    ).sort((a, b) => a - b);
    return ys;
  }, [dataset]);

  const [mode, setMode] = useState("band"); // instrument | influences | band
  const [yearFilter, setYearFilter] = useState("all"); // all | number (as string)
  const [topN, setTopN] = useState(10);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (yearFilter === "all") return dataset;
    const y = Number(yearFilter);
    return dataset.filter((d) => d.year === y);
  }, [dataset, yearFilter]);

  const layout = useMemo(
    () => computeConstellationPositions(filtered, W, H),
    [filtered, W, H]
  );
  const nodes = layout.nodes;
  const yearGroups = layout.groups;

  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!active) return;
    const exists = nodes.some((n) => n.id === active.id);
    if (!exists) setActive(null);
  }, [nodes, active]);

  const orderedNodes = useMemo(() => {
    const byYear = new Map();
    for (const n of nodes) {
      const y = n.year ?? 99;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(n);
    }
    const ys = [...byYear.keys()].sort((a, b) => a - b);
    const out = [];
    ys.forEach((y) => {
      const group = byYear.get(y) || [];
      group.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      out.push(...group);
    });
    return out;
  }, [nodes]);

  const links = useMemo(() => {
    if (!active) return [];
    const scored = nodes
      .filter((n) => n.id !== active.id)
      .map((n) => ({ n, s: similarityScore(active, n, mode) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, clamp(topN, 1, 40));

    const max = scored[0]?.s ?? 1;

    return scored.map(({ n, s }) => {
      const ratio = clamp(s / max, 0, 1);
      return {
        from: active,
        to: n,
        ratio,
        width: 1.0 + ratio * 3.6,
      };
    });
  }, [active, nodes, mode, topN]);

  const panelStyle = {
    position: "absolute",
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

  const moveActive = (dir) => {
    if (!orderedNodes.length) return;
    const idx = active ? orderedNodes.findIndex((n) => n.id === active.id) : -1;
    const nextIdx =
      idx === -1
        ? 0
        : (idx + (dir > 0 ? 1 : -1) + orderedNodes.length) %
          orderedNodes.length;
    setActive(orderedNodes[nextIdx]);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveActive(+1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveActive(-1);
      } else if (e.key === "Escape") {
        setActive(null);
      } else if (e.key === "Enter") {
        // quick select top match from search results
        const q = query.trim().toLowerCase();
        if (!q) return;
        const match = nodes
          .slice()
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .find((n) => String(n.name).toLowerCase().includes(q));
        if (match) setActive(match);
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, orderedNodes, query, nodes]);

  const wheelCooldown = useRef(0);
  const onWheel = (e) => {
    const now = Date.now();
    if (now - wheelCooldown.current < 120) return;
    wheelCooldown.current = now;

    const dy = e.deltaY ?? 0;
    if (Math.abs(dy) < 4) return;
    moveActive(dy > 0 ? +1 : -1);
  };

  const yearLabel = (y) => {
    if (y == null || y === 99) return "";
    return `Year ${y}`;
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => String(n.name).toLowerCase().includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .slice(0, 8);
  }, [query, nodes]);

  return (
    <div style={{ background: "#000", height: "100vh", overflow: "hidden" }}>
      <svg width="100%" height="100%" onWheel={onWheel}>
        {/* year labels toward the center of each constellation */}
        {yearGroups.map((g) => (
          <text
            key={`y-${g.year}`}
            x={g.labelX}
            y={g.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fill: "rgba(0,255,102,0.62)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 11,
              letterSpacing: 1.1,
              userSelect: "none",
            }}
          >
            {yearLabel(g.year)}
          </text>
        ))}

        {/* straight connections */}
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
            opacity={0.78}
          />
        ))}

        {/* nodes */}
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

      {/* CONTROLS (top-center) */}
      <div
        style={{
          ...panelStyle,
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 560,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ opacity: 0.85 }}>Connect:</div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.65)",
                color: "#00ff66",
                border: "1px solid rgba(0,255,100,0.35)",
                padding: "4px 6px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 11,
                outline: "none",
              }}
            >
              <option value="instrument">Same instrument</option>
              <option value="influences">Similar influences</option>
              <option value="band">Ideal band</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ opacity: 0.85 }}>Year:</div>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.65)",
                color: "#00ff66",
                border: "1px solid rgba(0,255,100,0.35)",
                padding: "4px 6px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 11,
                outline: "none",
              }}
            >
              <option value="all">All</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  Y{y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ opacity: 0.85 }}>Links:</div>
            <input
              type="range"
              min="3"
              max="16"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              style={{ width: 160 }}
            />
            <div style={{ minWidth: 28, textAlign: "right" }}>{topN}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ opacity: 0.85 }}>Find:</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="type a name..."
              style={{
                width: 160,
                background: "rgba(0,0,0,0.65)",
                color: "#00ff66",
                border: "1px solid rgba(0,255,100,0.35)",
                padding: "4px 6px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 11,
                outline: "none",
                textTransform: "none",
                letterSpacing: 0,
              }}
            />
          </div>

          <div style={{ opacity: 0.75, marginLeft: "auto" }}>
            ← / → or wheel
          </div>
        </div>

        {/* search dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: 8,
              borderTop: "1px solid rgba(0,255,100,0.25)",
              paddingTop: 8,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {searchResults.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActive(n)}
                  style={{
                    background: "rgba(0,0,0,0.65)",
                    color: "#00ff66",
                    border: "1px solid rgba(0,255,100,0.35)",
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {n.name}
                </button>
              ))}
            </div>
            <div style={{ opacity: 0.7, marginTop: 6 }}>
              Tip: press Enter to jump to first match
            </div>
          </div>
        )}
      </div>

      {/* TOP-LEFT: selected + connections (raised) */}
      {active && (
        <div style={{ ...panelStyle, top: 64, left: 12, width: 260 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            {active.name} {active.year ? `(Y${active.year})` : ""}
          </div>

          {links.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No matches found.</div>
          ) : (
            links.map((l) => (
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
            ))
          )}
        </div>
      )}

      {/* BOTTOM-RIGHT: profile */}
      {active && (
        <div style={{ ...panelStyle, bottom: 12, right: 12, width: 300 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
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
