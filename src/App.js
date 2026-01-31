import React, { useEffect, useMemo, useRef, useState } from "react";
import datasetRaw from "./data.json";

/* =========================================================
  Responsive app:
  - Desktop: overview + panels (like you have)
  - Mobile: redesigned from scratch (very minimal)
    • Full-screen canvas
    • Tiny top bar (connect + year + search)
    • Bottom sheet (Profile / Matches)
    • Tap node to select
    • Wheel + ← → rotate
    • Drag to rotate (mobile + desktop)
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

/**
 * Connect modes:
 * 1) instruments: strong weight on instruments
 * 2) influences: artists + genres
 * 3) band: broader blend (instruments + roles + influences + geek)
 */
function similarityScore(a, b, mode) {
  if (!a || !b || a.id === b.id) return 0;

  const Ainst = toSet(a.instruments),
    Binst = toSet(b.instruments);
  const Agen = toSet(a.genres),
    Bgen = toSet(b.genres);
  const Aart = toSet(a.artists),
    Bart = toSet(b.artists);
  const Arol = toSet(a.roles),
    Brol = toSet(b.roles);
  const Agek = toSet(a.geek),
    Bgek = toSet(b.geek);

  const inst = overlapCount(Ainst, Binst);
  const gen = overlapCount(Agen, Bgen);
  const art = overlapCount(Aart, Bart);
  const rol = overlapCount(Arol, Brol);
  const gek = overlapCount(Agek, Bgek);

  if (mode === "instruments") {
    return inst * 6 + rol * 2 + gen * 1 + art * 1;
  }

  if (mode === "influences") {
    return art * 5 + gen * 4 + inst * 1 + rol * 1;
  }

  // "band" (ideal band)
  return inst * 3 + rol * 3 + art * 2 + gen * 2 + gek * 1;
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

/* ---------- layout: year clusters ("constellations") ---------- */

function uniqueSortedYears(nodes) {
  const years = Array.from(
    new Set(nodes.map((n) => n.year).filter((y) => y != null))
  );
  years.sort((a, b) => a - b);
  return years;
}

function rotatePoint(x, y, cx, cy, ang) {
  const dx = x - cx;
  const dy = y - cy;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return { x: cx + dx * ca - dy * sa, y: cy + dx * sa + dy * ca };
}

/**
 * Desktop layout: year centers around a big ring; students around each year-center.
 * Mobile layout: if a single year is selected, that constellation goes to center.
 * If "All", year centers are placed on a smaller ring (still tidy).
 */
function computeYearClusterPositions(nodes, W, H, rotation, isMobile, yearFilter) {
  const cx = W / 2;
  const cy = H / 2;

  const years = uniqueSortedYears(nodes);
  const yearToIndex = new Map(years.map((y, i) => [y, i]));

  const filteredYears =
    yearFilter === "all" ? years : years.filter((y) => y === yearFilter);

  const yearRingR = isMobile ? Math.min(W, H) * 0.22 : Math.min(W, H) * 0.28;
  const nodeRingR = isMobile ? Math.min(W, H) * 0.075 : Math.min(W, H) * 0.085;

  // If one year on mobile: center it
  const yearCenters = new Map();
  if (isMobile && filteredYears.length === 1) {
    yearCenters.set(filteredYears[0], { x: cx, y: cy - 10 });
  } else {
    const count = filteredYears.length || 1;
    const offset = -Math.PI / 2;

    filteredYears.forEach((y, i) => {
      const a = offset + (i / count) * Math.PI * 2 + rotation;
      yearCenters.set(y, { x: cx + Math.cos(a) * yearRingR, y: cy + Math.sin(a) * yearRingR });
    });
  }

  // Place nodes within each constellation
  const byYear = new Map();
  nodes.forEach((n) => {
    if (n.year == null) return;
    if (yearFilter !== "all" && n.year !== yearFilter) return;
    if (!byYear.has(n.year)) byYear.set(n.year, []);
    byYear.get(n.year).push(n);
  });

  // Stable ordering inside year clusters (by name)
  for (const [y, arr] of byYear.entries()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const positioned = [];
  for (const [y, arr] of byYear.entries()) {
    const c = yearCenters.get(y);
    if (!c) continue;

    const m = arr.length || 1;
    const offset2 = -Math.PI / 2;

    for (let i = 0; i < arr.length; i++) {
      // Slight rotation within each cluster for symmetry (ties to main rotation a bit)
      const localRot = rotation * 0.35;
      const a = offset2 + (i / m) * Math.PI * 2 + localRot;

      const px = c.x + Math.cos(a) * nodeRingR;
      const py = c.y + Math.sin(a) * nodeRingR;

      positioned.push({ ...arr[i], cx: px, cy: py, yearCx: c.x, yearCy: c.y });
    }
  }

  // If yearFilter is all and isMobile, hide clusters for years with no students (rare)
  return { positioned, yearCenters };
}

/* ---------- minimal bottom sheet ---------- */

function SheetTabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(0,255,100,0.35)",
        background: active ? "rgba(0,255,100,0.10)" : "rgba(0,0,0,0.55)",
        color: "#00ff66",
        padding: "8px 10px",
        fontSize: 12,
        letterSpacing: 1,
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ========================================================= */

export default function App() {
  const { w: W, h: H } = useViewport();
  const isMobile = W < 720;

  const dataset = useMemo(() => normalizeDataset(datasetRaw), []);
  const years = useMemo(() => uniqueSortedYears(dataset), [dataset]);

  // UI state
  const [connectMode, setConnectMode] = useState("band"); // instruments | influences | band
  const [yearFilter, setYearFilter] = useState("all"); // "all" or number
  const [linksCount, setLinksCount] = useState(3); // min 3 (requested)
  const [find, setFind] = useState("");

  // Selection + rotation
  const [activeId, setActiveId] = useState(null);
  const active = useMemo(() => dataset.find((d) => d.id === activeId) || null, [dataset, activeId]);

  const [rotation, setRotation] = useState(0);

  // Mobile sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState("matches"); // profile | matches

  // Drag-to-rotate (mouse/touch)
  const dragRef = useRef({
    down: false,
    startX: 0,
    startRot: 0,
  });

  // Compute positions
  const { positioned: nodes, yearCenters } = useMemo(() => {
    const yf = yearFilter === "all" ? "all" : Number(yearFilter);
    return computeYearClusterPositions(dataset, W, H, rotation, isMobile, yf);
  }, [dataset, W, H, rotation, isMobile, yearFilter]);

  // Search/filter list
  const filteredNodes = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => String(n.name).toLowerCase().includes(q));
  }, [nodes, find]);

  // Links (always computed from the real node list, not the filtered search list)
  const links = useMemo(() => {
    if (!active) return [];
    const base = nodes; // already respects yearFilter
    const scored = base
      .filter((n) => n.id !== active.id)
      .map((n) => ({ n, s: similarityScore(active, n, connectMode) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    const take = clamp(linksCount, 3, 12);
    const sliced = scored.slice(0, take);
    const max = sliced[0]?.s ?? 1;

    return sliced.map(({ n, s }) => ({
      from: active,
      to: n,
      ratio: clamp(s / max, 0, 1),
      width: 1.2 + clamp(s / max, 0, 1) * 3.0,
    }));
  }, [active, nodes, connectMode, linksCount]);

  // If you select someone on mobile, open sheet + focus year
  useEffect(() => {
    if (!isMobile) return;
    if (!active) return;

    setSheetOpen(true);
    setSheetTab("matches");

    // Focus constellation on that year for mobile clarity (but keep user choice if already set)
    if (yearFilter === "all" && active.year != null) {
      setYearFilter(String(active.year));
    }
  }, [activeId]); // intentionally minimal dependency list

  // Keyboard arrows rotate
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setRotation((r) => r - 0.12);
      if (e.key === "ArrowRight") setRotation((r) => r + 0.12);
      if (e.key === "Escape") {
        setActiveId(null);
        setSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mouse wheel rotate (horizontal wheel also works on trackpads)
  const onWheel = (e) => {
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / 600;
    setRotation((r) => r + delta);
  };

  // Pointer drag rotate
  const onPointerDown = (e) => {
    dragRef.current.down = true;
    dragRef.current.startX = e.clientX ?? 0;
    dragRef.current.startRot = rotation;
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.down) return;
    const x = e.clientX ?? 0;
    const dx = x - dragRef.current.startX;
    setRotation(dragRef.current.startRot + dx / 220);
  };
  const onPointerUp = () => {
    dragRef.current.down = false;
  };

  // Visual styles
  const green = "#00ff66";
  const panelFont =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  /* ---------- DESKTOP PANELS (keep simple) ---------- */

  const panelStyle = {
    position: "absolute",
    background: "rgba(0,0,0,0.92)",
    border: "1px solid rgba(0,255,100,0.35)",
    color: green,
    padding: 10,
    fontFamily: panelFont,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  };

  const profileLine = (label, arrOrStr) => {
    const arr = Array.isArray(arrOrStr) ? arrOrStr : toArrayLoose(arrOrStr);
    if (!arr.length) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ opacity: 0.8, marginBottom: 3 }}>{label}</div>
        <div style={{ textTransform: "none", letterSpacing: 0 }}>
          {arr.join(", ")}
        </div>
      </div>
    );
  };

  /* ---------- MOBILE UI (minimal) ---------- */

  const topBar = (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        right: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 10px",
        border: "1px solid rgba(0,255,100,0.35)",
        background: "rgba(0,0,0,0.78)",
        color: green,
        fontFamily: panelFont,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
        <label style={{ fontSize: 11, letterSpacing: 1, opacity: 0.9 }}>CONNECT</label>
        <select
          value={connectMode}
          onChange={(e) => setConnectMode(e.target.value)}
          style={{
            flex: 1,
            minWidth: 130,
            background: "rgba(0,0,0,0.9)",
            color: green,
            border: "1px solid rgba(0,255,100,0.35)",
            padding: "6px 8px",
            fontFamily: panelFont,
            fontSize: 12,
          }}
        >
          <option value="instruments">Same instrument</option>
          <option value="influences">Similar influences</option>
          <option value="band">Ideal band</option>
        </select>
      </div>

      <select
        value={yearFilter}
        onChange={(e) => setYearFilter(e.target.value)}
        style={{
          width: 88,
          background: "rgba(0,0,0,0.9)",
          color: green,
          border: "1px solid rgba(0,255,100,0.35)",
          padding: "6px 8px",
          fontFamily: panelFont,
          fontSize: 12,
        }}
      >
        <option value="all">All</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            Y{y}
          </option>
        ))}
      </select>

      <input
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Find…"
        style={{
          width: 92,
          background: "rgba(0,0,0,0.9)",
          color: green,
          border: "1px solid rgba(0,255,100,0.35)",
          padding: "6px 8px",
          fontFamily: panelFont,
          fontSize: 12,
        }}
      />
    </div>
  );

  const bottomSheet = (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        border: "1px solid rgba(0,255,100,0.35)",
        background: "rgba(0,0,0,0.88)",
        color: green,
        fontFamily: panelFont,
        zIndex: 12,
        overflow: "hidden",
      }}
    >
      {/* Handle / header */}
      <div
        onClick={() => setSheetOpen((s) => !s)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          cursor: "pointer",
          borderBottom: sheetOpen ? "1px solid rgba(0,255,100,0.20)" : "none",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>
            {active ? `${active.name} ${active.year ? `(Y${active.year})` : ""}` : "Tap a circle"}
          </div>
          {active ? (
            <div style={{ opacity: 0.8, fontSize: 11, letterSpacing: 1 }}>
              {connectMode === "instruments"
                ? "Same instrument"
                : connectMode === "influences"
                ? "Similar influences"
                : "Ideal band"}
            </div>
          ) : null}
        </div>
        <div style={{ opacity: 0.85, fontSize: 12 }}>
          {sheetOpen ? "Close" : "Open"}
        </div>
      </div>

      {sheetOpen && (
        <div style={{ padding: 10 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <SheetTabButton active={sheetTab === "profile"} onClick={() => setSheetTab("profile")}>
              Profile
            </SheetTabButton>
            <SheetTabButton active={sheetTab === "matches"} onClick={() => setSheetTab("matches")}>
              Matches
            </SheetTabButton>

            {/* Minimal link count control */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.9 }}>LINKS</div>
              <input
                type="range"
                min={3}
                max={12}
                value={linksCount}
                onChange={(e) => setLinksCount(Number(e.target.value))}
              />
              <div style={{ width: 22, textAlign: "right", fontSize: 11 }}>{linksCount}</div>
            </div>
          </div>

          {/* Content */}
          {!active ? (
            <div style={{ opacity: 0.85, fontSize: 12, lineHeight: 1.35 }}>
              Tap a circle to open a profile and see matches.
            </div>
          ) : sheetTab === "profile" ? (
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>INSTRUMENTS</div>
                <div style={{ textTransform: "none" }}>{active.instruments.join(", ") || "-"}</div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>GENRES</div>
                <div style={{ textTransform: "none" }}>{active.genres.join(", ") || "-"}</div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>ARTISTS</div>
                <div style={{ textTransform: "none" }}>{active.artists.join(", ") || "-"}</div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>ROLES</div>
                <div style={{ textTransform: "none" }}>{active.roles.join(", ") || "-"}</div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>GEEK</div>
                <div style={{ textTransform: "none" }}>{active.geek.join(", ") || "-"}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, letterSpacing: 1, fontSize: 11 }}>COLLAB</div>
                <div style={{ textTransform: "none" }}>{String(active.collab || "-")}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>
              {links.length ? (
                links.map((l) => (
                  <div
                    key={l.to.id}
                    onClick={() => setActiveId(l.to.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 6px",
                      borderTop: "1px solid rgba(0,255,100,0.12)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textTransform: "none",
                      }}
                    >
                      {l.to.name}
                    </div>
                    <div style={{ opacity: 0.85, width: 40, textAlign: "right" }}>
                      {Math.round(l.ratio * 100)}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.85 }}>No matches (yet).</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ---------- year labels ---------- */

  const yearLabels = useMemo(() => {
    const labels = [];
    const yf = yearFilter === "all" ? "all" : Number(yearFilter);

    for (const [y, c] of yearCenters.entries()) {
      if (yf !== "all" && y !== yf) continue;
      labels.push({ y, x: c.x, yPos: c.y });
    }
    return labels;
  }, [yearCenters, yearFilter]);

  /* ---------- render ---------- */

  return (
    <div style={{ background: "#000", height: "100vh", overflow: "hidden", position: "relative" }}>
      {/* Canvas */}
      <svg
        width="100%"
        height="100%"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        {/* Links */}
        {active
          ? links.map((l) => (
              <line
                key={l.to.id}
                x1={l.from.cx}
                y1={l.from.cy}
                x2={l.to.cx}
                y2={l.to.cy}
                stroke="#cfd6df"
                strokeWidth={l.width}
                strokeLinecap="round"
                opacity={0.72}
              />
            ))
          : null}

        {/* Nodes */}
        {(find.trim() ? filteredNodes : nodes).map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={d.id === active?.id ? (isMobile ? 11 : 10) : isMobile ? 9 : 9}
            fill="#e5e9ef"
            opacity={0.92}
            onPointerDown={(e) => {
              // Prevent drag start from instantly rotating when selecting
              e.stopPropagation();
              setActiveId((p) => (p === d.id ? null : d.id));
              if (isMobile && p !== d.id) setSheetOpen(true);
            }}
            style={{ cursor: "pointer" }}
          />
        ))}

        {/* Year labels */}
        {yearLabels.map((t) => (
          <text
            key={t.y}
            x={t.x}
            y={t.yPos}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#00ff66"
            opacity={0.65}
            style={{
              fontFamily: panelFont,
              fontSize: isMobile ? 12 : 13,
              letterSpacing: 1,
              textTransform: "uppercase",
              userSelect: "none",
            }}
          >
            {`Year ${t.y}`}
          </text>
        ))}
      </svg>

      {/* MOBILE: minimal UI */}
      {isMobile ? (
        <>
          {topBar}
          {bottomSheet}
        </>
      ) : (
        <>
          {/* DESKTOP: selected profile at top-left (raised) */}
          {active && (
            <div style={{ ...panelStyle, top: 12, left: 12, width: 320 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
                {active.name} {active.year ? `(Y${active.year})` : ""}
              </div>
              {profileLine("Instruments", active.instruments)}
              {profileLine("Genres", active.genres)}
              {profileLine("Artists", active.artists)}
              {profileLine("Roles", active.roles)}
              {profileLine("Geek", active.geek)}
              {active.collab ? profileLine("Collab", [String(active.collab)]) : null}
            </div>
          )}

          {/* DESKTOP: controls top-center (compact) */}
          <div
            style={{
              ...panelStyle,
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              width: 520,
              display: "flex",
              gap: 14,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
              <div style={{ opacity: 0.9 }}>CONNECT</div>
              <select
                value={connectMode}
                onChange={(e) => setConnectMode(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.9)",
                  color: green,
                  border: "1px solid rgba(0,255,100,0.35)",
                  padding: "6px 8px",
                  fontFamily: panelFont,
                  fontSize: 12,
                }}
              >
                <option value="instruments">Same instrument</option>
                <option value="influences">Similar influences</option>
                <option value="band">Ideal band</option>
              </select>

              <div style={{ opacity: 0.9 }}>YEAR</div>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                style={{
                  width: 90,
                  background: "rgba(0,0,0,0.9)",
                  color: green,
                  border: "1px solid rgba(0,255,100,0.35)",
                  padding: "6px 8px",
                  fontFamily: panelFont,
                  fontSize: 12,
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

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ opacity: 0.9 }}>LINKS</div>
              <input
                type="range"
                min={3}
                max={12}
                value={linksCount}
                onChange={(e) => setLinksCount(Number(e.target.value))}
              />
              <div style={{ width: 22, textAlign: "right" }}>{linksCount}</div>

              <div style={{ opacity: 0.9 }}>FIND</div>
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="type a name…"
                style={{
                  width: 180,
                  background: "rgba(0,0,0,0.9)",
                  color: green,
                  border: "1px solid rgba(0,255,100,0.35)",
                  padding: "6px 8px",
                  fontFamily: panelFont,
                  fontSize: 12,
                }}
              />
            </div>
          </div>

          {/* DESKTOP: matches list bottom-right (compact) */}
          {active && (
            <div style={{ ...panelStyle, right: 12, bottom: 12, width: 280 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Matches</div>
              {links.length ? (
                links.map((l) => (
                  <div
                    key={l.to.id}
                    onClick={() => setActiveId(l.to.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "6px 4px",
                      borderTop: "1px solid rgba(0,255,100,0.12)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textTransform: "none",
                      }}
                    >
                      {l.to.name}
                    </div>
                    <div style={{ opacity: 0.85, width: 40, textAlign: "right" }}>
                      {Math.round(l.ratio * 100)}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.85 }}>No matches.</div>
              )}
              <div style={{ marginTop: 10, opacity: 0.65, fontSize: 10 }}>
                ← / → or wheel or drag to rotate
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* =========================================================
IMPORTANT (build fix if Netlify still errors on ESLint rule):
If your repo has an .eslintrc that references react-hooks rules,
add this to package.json:

"devDependencies": {
  "eslint-plugin-react-hooks": "^4.6.0"
}

Then commit/push and redeploy.
========================================================= */
