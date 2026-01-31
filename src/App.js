import React, { useEffect, useMemo, useRef, useState } from "react";
import datasetRaw from "./data.json";

/* =========================================================
   Constellation Circle (year-group clusters)
   - Year constellations arranged around a big circle
   - Straight links based on selectable matching mode
   - Rotate with mouse wheel or left/right arrows
   - Search by name to select
   - Mobile-first UI: bottom drawer tabs
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

function normToken(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim();
}

function toSet(arr) {
  return new Set((arr || []).map((x) => normToken(x)).filter(Boolean));
}

function overlapCount(A, B) {
  let c = 0;
  A.forEach((v) => B.has(v) && c++);
  return c;
}

/* ---------- dataset ---------- */

function normalizeDataset(raw) {
  return (Array.isArray(raw) ? raw : []).map((d, i) => ({
    id: d.id ?? `s-${i + 1}`,
    name: d.name ?? d.id ?? `Student ${i + 1}`,
    year: yearToNumber(d.year),
    instruments: toArrayLoose(d.instruments ?? d.instrument),
    genres: toArrayLoose(d.genres),
    artists: toArrayLoose(d.artists ?? d.arists),
    roles: toArrayLoose(d.roles),
    geek: toArrayLoose(d.geek),
    collab: d.collab ?? "",
  }));
}

/* ---------- matching ---------- */

const CONNECT_MODES = [
  { key: "ideal", label: "Ideal band" },
  { key: "instruments", label: "Same instruments" },
  { key: "influences", label: "Similar influences" },
];

function scoreForMode(a, b, modeKey) {
  if (!a || !b || a.id === b.id) return 0;

  const aInst = toSet(a.instruments);
  const bInst = toSet(b.instruments);

  const aGenres = toSet(a.genres);
  const bGenres = toSet(b.genres);

  const aArtists = toSet(a.artists);
  const bArtists = toSet(b.artists);

  const aRoles = toSet(a.roles);
  const bRoles = toSet(b.roles);

  const aGeek = toSet(a.geek);
  const bGeek = toSet(b.geek);

  if (modeKey === "instruments") {
    return overlapCount(aInst, bInst) * 5;
  }

  if (modeKey === "influences") {
    return overlapCount(aArtists, bArtists) * 4 + overlapCount(aGenres, bGenres) * 2;
  }

  // "ideal" (balanced)
  return (
    overlapCount(aInst, bInst) * 3 +
    overlapCount(aGenres, bGenres) * 2 +
    overlapCount(aArtists, bArtists) * 2 +
    overlapCount(aRoles, bRoles) * 1 +
    overlapCount(aGeek, bGeek) * 0.75
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

/* ---------- constellation layout ---------- */

function computeConstellationPositions(dataset, W, H, rotation = 0, yearFilter = "all") {
  const cx = W / 2;
  const cy = H / 2;

  // Big ring radius (where year cluster centers sit)
  const R = Math.min(W, H) * 0.28;

  // Cluster (within-year) radius
  const rBase = Math.min(W, H) * 0.06;

  // Years present (sorted)
  const years = [...new Set(dataset.map((d) => d.year).filter((y) => y != null))]
    .sort((a, b) => a - b);

  const byYear = new Map();
  years.forEach((y) => byYear.set(y, []));
  dataset.forEach((d) => {
    if (d.year != null) byYear.get(d.year)?.push(d);
  });

  const yearCenters = new Map();
  const offset = -Math.PI / 2 + rotation;

  years.forEach((y, idx) => {
    const a = offset + (idx / years.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * R;
    const yPos = cy + Math.sin(a) * R;
    yearCenters.set(y, { x, y: yPos, a });
  });

  // Place students around each year center as a small ring
  const nodes = [];
  years.forEach((yr) => {
    const arr = byYear.get(yr) || [];
    const center = yearCenters.get(yr);
    if (!center) return;

    const localR = rBase * clamp(0.7 + arr.length * 0.06, 0.8, 1.6);
    const localOffset = -Math.PI / 2 + center.a * 0.35;

    arr
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((d, i) => {
        const t = arr.length <= 1 ? 0 : (i / arr.length) * Math.PI * 2;
        const ang = localOffset + t;
        nodes.push({
          ...d,
          cx: center.x + Math.cos(ang) * localR,
          cy: center.y + Math.sin(ang) * localR,
          _yearCenter: center,
        });
      });
  });

  const filteredNodes =
    yearFilter === "all"
      ? nodes
      : nodes.filter((n) => n.year === Number(yearFilter));

  return { nodes: filteredNodes, yearCenters, years };
}

/* ---------- small UI helpers ---------- */

function FillBar({ value01 }) {
  const v = clamp(value01 ?? 0, 0, 1);
  return (
    <div
      style={{
        width: 86,
        height: 9,
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

const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function pillBtnStyle(active) {
  return {
    appearance: "none",
    border: "1px solid rgba(0,255,100,0.35)",
    background: active ? "rgba(0,255,100,0.18)" : "rgba(0,0,0,0.35)",
    color: "#00ff66",
    fontFamily: mono,
    fontSize: 11,
    padding: "6px 10px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  };
}

function selectStyle() {
  return {
    border: "1px solid rgba(0,255,100,0.35)",
    background: "rgba(0,0,0,0.35)",
    color: "#00ff66",
    fontFamily: mono,
    fontSize: 12,
    padding: "6px 8px",
    outline: "none",
  };
}

function inputStyle() {
  return {
    border: "1px solid rgba(0,255,100,0.35)",
    background: "rgba(0,0,0,0.35)",
    color: "#00ff66",
    fontFamily: mono,
    fontSize: 12,
    padding: "6px 8px",
    outline: "none",
    width: "100%",
  };
}

/* ========================================================= */

export default function App() {
  const { w: W, h: H } = useViewport();
  const isMobile = W < 720;

  const dataset = useMemo(() => normalizeDataset(datasetRaw), []);

  const [rotation, setRotation] = useState(0);
  const [activeId, setActiveId] = useState(null);

  const [connectMode, setConnectMode] = useState("ideal");
  const [yearFilter, setYearFilter] = useState("all");

  const [linksN, setLinksN] = useState(isMobile ? 3 : 6);
  const minLinks = 3;
  const maxLinks = isMobile ? 8 : 12;

  const [search, setSearch] = useState("");

  // mobile drawer tab
  const [mobileTab, setMobileTab] = useState("profile"); // profile | matches | controls

  const active = useMemo(() => {
    if (!activeId) return null;
    return dataset.find((d) => d.id === activeId) || null;
  }, [activeId, dataset]);

  const { nodes, yearCenters, years } = useMemo(
    () => computeConstellationPositions(dataset, W, H, rotation, yearFilter),
    [dataset, W, H, rotation, yearFilter]
  );

  // Ensure active stays visible when filtering
  useEffect(() => {
    if (!activeId) return;
    const existsInView = nodes.some((n) => n.id === activeId);
    if (!existsInView) setActiveId(null);
  }, [yearFilter, nodes, activeId]);

  // Wheel rotate
  useEffect(() => {
    const onWheel = (e) => {
      // only rotate if cursor is over the app (not on inputs)
      const tag = (e.target && e.target.tagName) || "";
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

      e.preventDefault?.();
      const delta = e.deltaY || 0;
      setRotation((r) => r + delta * 0.0015);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Arrow rotate
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setRotation((r) => r - 0.08);
      if (e.key === "ArrowRight") setRotation((r) => r + 0.08);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search select
  const searchMatches = useMemo(() => {
    const q = normToken(search);
    if (!q) return [];
    const list = dataset
      .filter((d) => normToken(d.name).includes(q))
      .slice(0, 8);
    return list;
  }, [search, dataset]);

  // Links
  const links = useMemo(() => {
    if (!active) return [];

    const viewNodes = nodes; // only link to visible nodes
    const scored = viewNodes
      .filter((n) => n.id !== active.id)
      .map((n) => ({ n, s: scoreForMode(active, n, connectMode) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, clamp(linksN, minLinks, maxLinks));

    const max = scored[0]?.s ?? 1;

    return scored.map(({ n, s }) => {
      const ratio = clamp(s / max, 0, 1);
      return {
        from: active,
        to: n,
        ratio,
        width: 1.1 + ratio * (isMobile ? 2.2 : 3.0),
      };
    });
  }, [active, nodes, connectMode, linksN, minLinks, maxLinks, isMobile]);

  // Matches list content (names + bars)
  const matchesList = useMemo(() => {
    if (!active) return [];
    return links.map((l) => ({
      id: l.to.id,
      name: l.to.name,
      ratio: l.ratio,
      year: l.to.year,
    }));
  }, [links, active]);

  // panels
  const panelBase = {
    position: "absolute",
    background: "rgba(0,0,0,0.90)",
    border: "1px solid rgba(0,255,100,0.35)",
    color: "#00ff66",
    padding: 10,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  };

  const profileLine = (label, arrOrStr) => {
    const arr = Array.isArray(arrOrStr) ? arrOrStr : toArrayLoose(arrOrStr);
    if (!arr.length) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ opacity: 0.8, marginBottom: 3 }}>{label}</div>
        <div style={{ textTransform: "none", letterSpacing: 0, lineHeight: 1.35 }}>
          {arr.join(", ")}
        </div>
      </div>
    );
  };

  // tap/click select
  const onSelectNode = (id) => {
    setActiveId((p) => (p === id ? null : id));
    if (isMobile) setMobileTab("profile");
  };

  // touchAction none helps mobile
  return (
    <div
      style={{
        background: "#000",
        height: "100vh",
        overflow: "hidden",
        touchAction: "none",
        position: "relative",
      }}
    >
      {/* SVG space */}
      <svg width="100%" height="100%">
        {/* links */}
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
            opacity={isMobile ? 0.55 : 0.75}
          />
        ))}

        {/* nodes */}
        {nodes.map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={d.id === activeId ? (isMobile ? 10 : 11) : (isMobile ? 8 : 9)}
            fill="#e5e9ef"
            opacity={0.9}
            onPointerDown={() => onSelectNode(d.id)}
            style={{ cursor: "pointer" }}
          />
        ))}

        {/* year labels */}
        {Array.from(yearCenters.entries()).map(([yr, c]) => {
          if (yearFilter !== "all" && Number(yearFilter) !== yr) return null;
          return (
            <text
              key={`label-${yr}`}
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#00ff66"
              opacity={0.75}
              style={{
                fontFamily: mono,
                fontSize: isMobile ? 11 : 12,
                letterSpacing: 0.6,
              }}
            >
              {`Year ${yr}`}
            </text>
          );
        })}
      </svg>

      {/* ===== Desktop controls (top) ===== */}
      {!isMobile && (
        <div
          style={{
            ...panelBase,
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 640,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
            <div style={{ alignSelf: "center" }}>Connect:</div>
            <select
              style={selectStyle()}
              value={connectMode}
              onChange={(e) => setConnectMode(e.target.value)}
            >
              {CONNECT_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10 }}>
            <div style={{ alignSelf: "center" }}>Year:</div>
            <select
              style={selectStyle()}
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="all">All</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {`Y${y}`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 40px", gap: 10 }}>
            <div style={{ alignSelf: "center" }}>Links:</div>
            <input
              type="range"
              min={minLinks}
              max={maxLinks}
              value={clamp(linksN, minLinks, maxLinks)}
              onChange={(e) => setLinksN(Number(e.target.value))}
            />
            <div style={{ alignSelf: "center", textAlign: "right" }}>
              {clamp(linksN, minLinks, maxLinks)}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10 }}>
            <div style={{ alignSelf: "center" }}>Find:</div>
            <div style={{ position: "relative" }}>
              <input
                style={inputStyle()}
                placeholder="type a name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searchMatches.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 34,
                    background: "rgba(0,0,0,0.95)",
                    border: "1px solid rgba(0,255,100,0.35)",
                    zIndex: 20,
                  }}
                >
                  {searchMatches.map((s) => (
                    <div
                      key={s.id}
                      onPointerDown={() => {
                        setActiveId(s.id);
                        setSearch("");
                      }}
                      style={{
                        padding: "8px 10px",
                        cursor: "pointer",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                    >
                      {s.name} {s.year ? ` (Y${s.year})` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1", opacity: 0.75, textAlign: "right" }}>
            ← / → or wheel
          </div>
        </div>
      )}

      {/* ===== Desktop: Matches panel (top-left) ===== */}
      {!isMobile && active && (
        <div style={{ ...panelBase, top: 12, left: 12, width: 300 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
            {String(active.name).toUpperCase()} {active.year ? `(Y${active.year})` : ""}
          </div>

          {matchesList.map((m) => (
            <div
              key={m.id}
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
                  textTransform: "none",
                  letterSpacing: 0,
                  cursor: "pointer",
                }}
                onPointerDown={() => setActiveId(m.id)}
              >
                {m.name}
              </div>
              <FillBar value01={m.ratio} />
            </div>
          ))}
        </div>
      )}

      {/* ===== Desktop: Profile panel (bottom-right) ===== */}
      {!isMobile && active && (
        <div style={{ ...panelBase, bottom: 12, right: 12, width: 300 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
            Profile
          </div>

          {profileLine("Student", [active.name])}
          {active.year != null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ opacity: 0.8, marginBottom: 3 }}>Year</div>
              <div style={{ textTransform: "none", letterSpacing: 0 }}>{active.year}</div>
            </div>
          )}

          {profileLine("Instruments", active.instruments)}
          {profileLine("Genres", active.genres)}
          {profileLine("Artists", active.artists)}
          {profileLine("Roles", active.roles)}
          {profileLine("Geek", active.geek)}
          {active.collab ? profileLine("Collab", [String(active.collab)]) : null}
        </div>
      )}

      {/* ===== Mobile: Bottom drawer ===== */}
      {isMobile && (
        <div
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
            background: "rgba(0,0,0,0.92)",
            border: "1px solid rgba(0,255,100,0.35)",
            color: "#00ff66",
            fontFamily: mono,
            fontSize: 11,
            padding: 10,
            maxHeight: "44vh",
            overflow: "auto",
            borderRadius: 6,
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              style={pillBtnStyle(mobileTab === "profile")}
              onClick={() => setMobileTab("profile")}
            >
              Profile
            </button>
            <button
              style={pillBtnStyle(mobileTab === "matches")}
              onClick={() => setMobileTab("matches")}
              disabled={!active}
            >
              Matches
            </button>
            <button
              style={pillBtnStyle(mobileTab === "controls")}
              onClick={() => setMobileTab("controls")}
            >
              Controls
            </button>
          </div>

          {/* Content */}
          {mobileTab === "profile" && (
            <div>
              {active ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                    {active.name} {active.year ? `(Y${active.year})` : ""}
                  </div>
                  {profileLine("Instruments", active.instruments)}
                  {profileLine("Genres", active.genres)}
                  {profileLine("Artists", active.artists)}
                  {profileLine("Roles", active.roles)}
                  {profileLine("Geek", active.geek)}
                  {active.collab ? profileLine("Collab", [String(active.collab)]) : null}
                </>
              ) : (
                <div style={{ opacity: 0.75, textTransform: "none", letterSpacing: 0 }}>
                  Tap a student circle to view profile.
                </div>
              )}
            </div>
          )}

          {mobileTab === "matches" && (
            <div>
              {active ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Matches ({matchesList.length})
                  </div>
                  {matchesList.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(0,255,100,0.12)",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textTransform: "none",
                          letterSpacing: 0,
                          cursor: "pointer",
                        }}
                        onPointerDown={() => setActiveId(m.id)}
                      >
                        {m.name} {m.year ? `(Y${m.year})` : ""}
                      </div>
                      <FillBar value01={m.ratio} />
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ opacity: 0.75, textTransform: "none", letterSpacing: 0 }}>
                  Select a student first.
                </div>
              )}
            </div>
          )}

          {mobileTab === "controls" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
                <div style={{ alignSelf: "center" }}>Connect:</div>
                <select
                  style={selectStyle()}
                  value={connectMode}
                  onChange={(e) => setConnectMode(e.target.value)}
                >
                  {CONNECT_MODES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10 }}>
                <div style={{ alignSelf: "center" }}>Year:</div>
                <select
                  style={selectStyle()}
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>
                      {`Y${y}`}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 40px", gap: 10 }}>
                <div style={{ alignSelf: "center" }}>Links:</div>
                <input
                  type="range"
                  min={minLinks}
                  max={maxLinks}
                  value={clamp(linksN, minLinks, maxLinks)}
                  onChange={(e) => setLinksN(Number(e.target.value))}
                />
                <div style={{ alignSelf: "center", textAlign: "right" }}>
                  {clamp(linksN, minLinks, maxLinks)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10 }}>
                <div style={{ alignSelf: "center" }}>Find:</div>
                <div style={{ position: "relative" }}>
                  <input
                    style={inputStyle()}
                    placeholder="type a name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {searchMatches.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 34,
                        background: "rgba(0,0,0,0.96)",
                        border: "1px solid rgba(0,255,100,0.35)",
                        zIndex: 30,
                        maxHeight: 160,
                        overflow: "auto",
                      }}
                    >
                      {searchMatches.map((s) => (
                        <div
                          key={s.id}
                          onPointerDown={() => {
                            setActiveId(s.id);
                            setSearch("");
                            setMobileTab("profile");
                          }}
                          style={{
                            padding: "8px 10px",
                            cursor: "pointer",
                            textTransform: "none",
                            letterSpacing: 0,
                          }}
                        >
                          {s.name} {s.year ? ` (Y${s.year})` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ opacity: 0.75, textTransform: "none", letterSpacing: 0 }}>
                Rotate: wheel or ← / →
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
