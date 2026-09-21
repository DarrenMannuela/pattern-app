import { useEffect, useRef, useState } from "react";
import { bounds, nearestOnOutline, pointsToPath, splitBetween } from "../lib/customDesign.js";
import { fileToDataUrl, traceSilhouette } from "../lib/imageTrace.js";

// Draw your own uniform: start from a picture (a photo or flat-lay of the
// garment) or a blank grid, trace each piece as a closed outline, and every
// outline becomes a cutting piece. Pieces are in cm; the picture's scale is set
// by telling the editor how long something in it really is.

export const EMPTY_DESIGN = { scale: 0, imgW: 0, imgH: 0, opacity: 0.55, nextId: 1, pieces: [] };
const BLANK = { w: 120, h: 100 };
const FOLDS = [
  { value: "", label: "Full piece" },
  { value: "left", label: "Half — cut on left fold" },
  { value: "bottom", label: "Half — cut on bottom fold" },
];

// The pieces the backend needs, from the working drawing.
export function customPayload(design) {
  return {
    pieces: (design?.pieces || [])
      .filter((p) => p.points.length >= 3)
      .map((p) => ({ name: p.name, pathData: pointsToPath(p.points), foldEdge: p.fold || "", qty: Math.max(1, Number(p.qty) || 1) })),
  };
}

export default function CustomDesigner({ design, image, onDesign, onImage }) {
  const d = design && Array.isArray(design.pieces) ? design : EMPTY_DESIGN;
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const history = useRef([]);
  const [mode, setMode] = useState("edit"); // edit | draw | scale | split
  const [draftPts, setDraftPts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [linePts, setLinePts] = useState([]); // the two points of a scale or split line
  const [scaleCm, setScaleCm] = useState("");
  const [zoom, setZoom] = useState(100);
  const [fill, setFill] = useState("#33475B");
  const [sens, setSens] = useState(50);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const hasImage = !!image && d.scale > 0 && d.imgW > 0;
  const W = hasImage ? d.imgW / d.scale : BLANK.w;
  const H = hasImage ? d.imgH / d.scale : BLANK.h;
  const hr = W * 0.007;
  const sw = W * 0.0018;

  const sel = d.pieces.find((p) => p.id === selected) || null;

  function commit(next) {
    history.current.push(d);
    if (history.current.length > 40) history.current.shift();
    onDesign(next);
  }
  function replacePiece(id, patch) {
    commit({ ...d, pieces: d.pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }
  function undo() {
    const prev = history.current.pop();
    if (prev) onDesign(prev);
  }

  const toWorld = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };

  function addPiece(points, name) {
    const id = d.nextId;
    const piece = { id, name: name || `Piece ${id}`, points, fold: "", qty: 1 };
    commit({ ...d, nextId: id + 1, pieces: [...d.pieces, piece] });
    setSelected(id);
    return piece;
  }

  function finishDraw() {
    if (draftPts.length < 3) {
      setMsg("A piece needs at least three points.");
      return;
    }
    addPiece(draftPts.map((p) => ({ ...p })));
    setDraftPts([]);
    setMode("edit");
    setMsg("Piece added. Drag a point to move it, click a point to switch corner/curve, double-click an edge to add a point.");
  }

  function cancelTool() {
    setMode("edit");
    setDraftPts([]);
    setLinePts([]);
    setCursor(null);
  }

  useEffect(() => {
    function onKey(e) {
      if (!wrapRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === "Escape") cancelTool();
      if (e.key === "Enter" && mode === "draw") finishDraw();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onCanvasDown(e) {
    const p = toWorld(e);
    if (mode === "draw") {
      const first = draftPts[0];
      if (first && draftPts.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < hr * 2.2) {
        finishDraw();
        return;
      }
      setDraftPts([...draftPts, { x: p.x, y: p.y, c: false }]);
    } else if (mode === "scale") {
      if (linePts.length < 2) setLinePts([...linePts, p]);
    } else if (mode === "split") {
      if (linePts.length < 2 && sel) {
        // Each end snaps to the selected piece's outline.
        const near = nearestOnOutline(sel.points, p);
        const next = [...linePts, { x: near.x, y: near.y, edge: near.edge }];
        setLinePts(next);
        if (next.length === 2) runSplit(next);
      }
    } else {
      setSelected(null);
    }
  }

  function runSplit([a, b]) {
    if (!sel) {
      setMsg("Select the piece to cut first.");
      setLinePts([]);
      return;
    }
    const res = splitBetween(sel.points, a, b);
    setLinePts([]);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    const id = d.nextId;
    const pieces = d.pieces.flatMap((p) =>
      p.id === sel.id
        ? [
            { ...p, name: `${p.name} A`, points: res.pieces[0] },
            { ...p, id, name: `${p.name} B`, points: res.pieces[1] },
          ]
        : [p]
    );
    commit({ ...d, nextId: id + 1, pieces });
    setMode("edit");
    setMsg(`Split into “${sel.name} A” and “${sel.name} B”. Rename them in the list.`);
  }

  function applyScale() {
    const cm = Number(scaleCm);
    if (!(cm > 0) || linePts.length < 2) return;
    const [a, b] = linePts;
    const pixels = Math.hypot(a.x - b.x, a.y - b.y) * d.scale; // picture pixels between the two points
    const scale = pixels / cm;
    const k = d.scale / scale; // keep the outlines lined up with the picture
    commit({ ...d, scale, pieces: d.pieces.map((p) => ({ ...p, points: p.points.map((q) => ({ ...q, x: q.x * k, y: q.y * k })) })) });
    setLinePts([]);
    setScaleCm("");
    setMode("edit");
    setMsg(`Scale set: 1 cm = ${scale.toFixed(1)} picture pixels.`);
  }

  function startPointDrag(e, piece, idx) {
    e.stopPropagation();
    e.preventDefault();
    setSelected(piece.id);
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let snap = d;
    function onMove(ev) {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      if (!moved) {
        moved = true;
        history.current.push(snap);
      }
      const p = toWorld(ev);
      snap = { ...snap, pieces: snap.pieces.map((q) => (q.id === piece.id ? { ...q, points: q.points.map((pt, i) => (i === idx ? { ...pt, x: p.x, y: p.y } : pt)) } : q)) };
      onDesign(snap);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) {
        replacePiece(piece.id, { points: piece.points.map((pt, i) => (i === idx ? { ...pt, c: !pt.c } : pt)) });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function deletePoint(e, piece, idx) {
    e.preventDefault();
    e.stopPropagation();
    if (piece.points.length <= 3) {
      setMsg("A piece needs at least three points — delete the piece instead.");
      return;
    }
    replacePiece(piece.id, { points: piece.points.filter((_, i) => i !== idx) });
  }

  function insertPoint(e, piece) {
    e.stopPropagation();
    const p = toWorld(e);
    const near = nearestOnOutline(piece.points, p);
    const pts = [...piece.points];
    pts.splice(near.edge + 1, 0, { x: near.x, y: near.y, c: false });
    replacePiece(piece.id, { points: pts });
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { dataUrl, width, height } = await fileToDataUrl(file);
      history.current.push(d);
      onImage(dataUrl);
      // A new picture starts 60cm wide until its scale is set.
      onDesign({ ...d, imgW: width, imgH: height, scale: width / 60 });
      setMsg("Picture added. Set its scale next (so the pieces come out the right size), then trace or auto-outline the garment.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function autoOutline() {
    setBusy(true);
    setMsg(null);
    try {
      const pts = await traceSilhouette(image, sens);
      const cm = pts.map((p) => ({ x: p.x / d.scale, y: p.y / d.scale, c: false }));
      addPiece(cm, "Outline");
      setMsg(`Traced an outline with ${cm.length} points. To make separate pieces (front, sleeves…), select it and use “Split with a line”, or trace each piece by hand.`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const centroid = (pts) => {
    const b = bounds(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };

  return (
    <div className="custom-designer" ref={wrapRef} tabIndex={-1}>
      <div className="cd-panel">
        <div className="cd-step">
          <div className="pm-slot-title">1 · Picture (optional)</div>
          <div className="cd-row">
            <label className="btn-add btn-inline cd-file">
              {image ? "Change picture" : "Upload a picture"}
              <input type="file" accept="image/*" onChange={onUpload} hidden />
            </label>
            {image && (
              <button type="button" className="link-btn link-btn-danger" onClick={() => { history.current.push(d); onImage(""); onDesign({ ...d, scale: 0, imgW: 0, imgH: 0 }); }}>
                Remove
              </button>
            )}
          </div>
          {hasImage && (
            <>
              <div className="cd-row">
                <label>Picture strength</label>
                <input type="range" min="0.1" max="1" step="0.05" value={d.opacity} onChange={(e) => onDesign({ ...d, opacity: Number(e.target.value) })} />
              </div>
              <div className="cd-row">
                <button type="button" className={`btn-add btn-inline${mode === "scale" ? " cd-on" : ""}`} onClick={() => { cancelTool(); setMode("scale"); setMsg("Click two points on the picture that you know the real distance between (for example across the chest, or the sleeve length)."); }}>
                  Set scale
                </button>
                <span className="cd-note">Picture is {(d.imgW / d.scale).toFixed(0)} × {(d.imgH / d.scale).toFixed(0)} cm</span>
              </div>
            </>
          )}
        </div>

        <div className="cd-step">
          <div className="pm-slot-title">2 · Draw pieces</div>
          <div className="cd-row">
            <button type="button" className={`btn-add btn-inline${mode === "draw" ? " cd-on" : ""}`} onClick={() => { cancelTool(); setMode("draw"); setMsg("Click to place points around the piece. Click the first point (or press Enter) to close it."); }}>
              Trace a piece
            </button>
            {hasImage && (
              <button type="button" className="btn-add btn-inline" disabled={busy} onClick={autoOutline}>
                {busy ? "Working…" : "Auto outline"}
              </button>
            )}
          </div>
          {hasImage && (
            <div className="cd-row">
              <label>Sensitivity</label>
              <input type="range" min="15" max="120" step="5" value={sens} onChange={(e) => setSens(Number(e.target.value))} />
            </div>
          )}
          <div className="cd-row">
            <button type="button" className={`btn-add btn-inline${mode === "split" ? " cd-on" : ""}`} disabled={!sel} onClick={() => { cancelTool(); setMode("split"); setMsg("Click two points on the selected piece\u2019s outline: it is cut along the straight line between them. Add points along the cut afterwards if it needs to curve."); }}>
              Split with a line
            </button>
            <button type="button" className="btn-add btn-inline" onClick={undo} disabled={history.current.length === 0}>
              Undo
            </button>
          </div>
        </div>

        <div className="cd-step">
          <div className="pm-slot-title">3 · Pieces ({d.pieces.length})</div>
          {d.pieces.length === 0 && <p className="cd-note">Nothing drawn yet.</p>}
          <ul className="cd-pieces">
            {d.pieces.map((p) => {
              const b = bounds(p.points);
              return (
                <li key={p.id} className={p.id === selected ? "cd-piece cd-piece-on" : "cd-piece"} onClick={() => setSelected(p.id)}>
                  <input className="cd-name" value={p.name} onChange={(e) => replacePiece(p.id, { name: e.target.value })} onClick={(e) => e.stopPropagation()} />
                  <div className="cd-row">
                    <select className="select" value={p.fold} onChange={(e) => replacePiece(p.id, { fold: e.target.value })} onClick={(e) => e.stopPropagation()}>
                      {FOLDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <label className="cd-qty">
                      ×
                      <input type="number" min="1" max="99" value={p.qty} onChange={(e) => replacePiece(p.id, { qty: Number(e.target.value) })} onClick={(e) => e.stopPropagation()} />
                    </label>
                  </div>
                  <div className="cd-row cd-meta">
                    <span>{(b.maxX - b.minX).toFixed(1)} × {(b.maxY - b.minY).toFixed(1)} cm</span>
                    <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); const id = d.nextId; commit({ ...d, nextId: id + 1, pieces: [...d.pieces, { ...p, id, name: `${p.name} copy`, points: p.points.map((q) => ({ ...q, x: q.x + 3, y: q.y + 3 })) }] }); setSelected(id); }}>
                      Duplicate
                    </button>
                    <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); replacePiece(p.id, { points: p.points.map((q) => ({ ...q, c: !p.points.every((z) => z.c) })) }); }}>
                      {p.points.every((q) => q.c) ? "Sharpen" : "Smooth"}
                    </button>
                    <button type="button" className="link-btn link-btn-danger" onClick={(e) => { e.stopPropagation(); commit({ ...d, pieces: d.pieces.filter((q) => q.id !== p.id) }); if (selected === p.id) setSelected(null); }}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="cd-row">
            <label>Fill colour</label>
            <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} className="cd-color" />
          </div>
        </div>
      </div>

      <div className="cd-stage">
        <div className="cd-toolbar">
          <span className="cd-mode">
            {mode === "draw" ? "Tracing — click points, click the first point to close" : mode === "scale" ? "Setting scale — click two points" : mode === "split" ? "Splitting — click two points" : "Edit"}
          </span>
          {mode !== "edit" && (
            <button type="button" className="link-btn" onClick={cancelTool}>Cancel</button>
          )}
          <label className="cd-zoom">Zoom <input type="range" min="50" max="250" step="10" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        </div>
        {msg && <p className="cd-msg">{msg}</p>}
        {mode === "scale" && linePts.length === 2 && (
          <div className="cd-scale-input">
            The two points are
            <input type="number" min="1" step="0.5" placeholder="cm" value={scaleCm} onChange={(e) => setScaleCm(e.target.value)} className="pm-num" />
            cm apart in real life.
            <button type="button" className="btn-add btn-inline" onClick={applyScale} disabled={!(Number(scaleCm) > 0)}>
              Apply
            </button>
          </div>
        )}
        <div className="cd-canvas" style={{ maxHeight: 620 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: `${zoom}%`, cursor: mode === "edit" ? "default" : "crosshair", touchAction: "none" }}
            onPointerDown={onCanvasDown}
            onPointerMove={(e) => (mode === "draw" || mode === "split" || mode === "scale") && setCursor(toWorld(e))}
            onDoubleClick={() => mode === "draw" && draftPts.length >= 3 && finishDraw()}
          >
            <rect x="0" y="0" width={W} height={H} fill="#fff" />
            {hasImage ? (
              <image href={image} x="0" y="0" width={W} height={H} opacity={d.opacity} preserveAspectRatio="none" />
            ) : (
              <g stroke="#dde1e4" strokeWidth={sw}>
                {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2={H} />
                ))}
                {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
                  <line key={`h${i}`} x1="0" y1={i * 10} x2={W} y2={i * 10} />
                ))}
              </g>
            )}
            {d.pieces.map((p) => (
              <g key={p.id}>
                <path
                  d={pointsToPath(p.points)}
                  fill={fill}
                  fillOpacity={p.id === selected ? 0.5 : 0.35}
                  stroke={p.id === selected ? "#d9822b" : "#1f2d3b"}
                  strokeWidth={sw * (p.id === selected ? 2 : 1.4)}
                  onPointerDown={(e) => {
                    if (mode !== "edit") return;
                    e.stopPropagation();
                    setSelected(p.id);
                  }}
                  onDoubleClick={(e) => mode === "edit" && insertPoint(e, p)}
                />
                <text x={centroid(p.points).x} y={centroid(p.points).y} fontSize={W * 0.022} textAnchor="middle" fill="#0e1a26" pointerEvents="none" stroke="#fff" strokeWidth={sw * 0.8} paintOrder="stroke">
                  {p.name}
                </text>
              </g>
            ))}
            {mode === "edit" && sel && sel.points.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={hr}
                fill={pt.c ? "#d9822b" : "#fff"}
                stroke="#d9822b"
                strokeWidth={sw * 1.6}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => startPointDrag(e, sel, i)}
                onContextMenu={(e) => deletePoint(e, sel, i)}
              />
            ))}
            {mode === "draw" && draftPts.length > 0 && (
              <g>
                <polyline points={[...draftPts, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#d9822b" strokeWidth={sw * 1.6} strokeDasharray={`${hr * 2} ${hr}`} />
                {draftPts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={hr * (i === 0 ? 1.4 : 1)} fill={i === 0 ? "#d9822b" : "#fff"} stroke="#d9822b" strokeWidth={sw * 1.4} />
                ))}
              </g>
            )}
            {(mode === "scale" || mode === "split") && linePts.length > 0 && (
              <g>
                <line x1={linePts[0].x} y1={linePts[0].y} x2={(linePts[1] || cursor || linePts[0]).x} y2={(linePts[1] || cursor || linePts[0]).y} stroke={mode === "scale" ? "#2b8ad9" : "#c0392b"} strokeWidth={sw * 2} strokeDasharray={`${hr * 2} ${hr}`} />
                {linePts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={hr} fill="#fff" stroke={mode === "scale" ? "#2b8ad9" : "#c0392b"} strokeWidth={sw * 1.6} />
                ))}
              </g>
            )}
          </svg>
        </div>
        <p className="cd-note">
          Drag a point to move it · click a point to switch corner/curve · double-click an edge to add a point · right-click a point to delete it.
          {hasImage ? "" : " No picture: the grid squares are 10 cm."}
        </p>
      </div>
    </div>
  );
}

