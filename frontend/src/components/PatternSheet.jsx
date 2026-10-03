import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import FlatDrawing from "./FlatDrawing.jsx";
import { layoutGarmentViews } from "../lib/garmentFlat.js";
import { GARMENT_LABELS } from "../lib/garmentTypes.js";
import { measurementFieldsFor } from "../lib/measurementFields.js";
import { fabricLabel } from "../lib/fabricCatalog.js";
import { SIZE_COLORS, consumptionBySize, cutLabel, featuresFor, gradingPieceNames, sampleSize, seamAllowances, sewingSteps } from "../lib/patternSheet.js";

const PIECE_SCALE = 2.4; // px per cm for the pattern pieces, the same for all so sizes compare
const NEST_SCALE = 2.2;
const INK = "#1d1d1f";

// One pattern piece as a cutting room reads it: the cutting line solid, the
// sewing line dashed inside it, the grainline, the fold, its name and count.
function SheetPiece({ piece }) {
  const cw = piece.cutWidth || piece.width;
  const ch = piece.cutHeight || piece.height;
  const off = piece.cutOffset || { x: 0, y: 0 };
  const pad = 3;
  const g = piece.grainline;
  const fold = piece.foldEdge === "left";
  // The fold is the cut piece's left edge (no allowance there); a back pleat
  // puts it left of the sewing line's x = 0.
  const foldX = -off.x;
  const arrow = (x, y, tx, ty) => {
    const a = Math.atan2(ty - y, tx - x);
    const p = (d, s) => [x + Math.cos(a) * d + Math.cos(a + s) * 0.9, y + Math.sin(a) * d + Math.sin(a + s) * 0.9];
    return `${x},${y} ${p(1.8, 2.6).join(",")} ${p(1.8, -2.6).join(",")}`;
  };
  return (
    <figure className="sheet-piece">
      <svg viewBox={`${-pad} ${-pad} ${cw + pad * 2} ${ch + pad * 2}`} width={(cw + pad * 2) * PIECE_SCALE} height={(ch + pad * 2) * PIECE_SCALE}>
        <path d={piece.cutPathData || piece.pathData} fill={piece.fabric === "contrast" ? "#eef0f3" : "#fff"} stroke={INK} strokeWidth={0.35} />
        <g transform={`translate(${off.x} ${off.y})`}>
          {piece.cutPathData && <path d={piece.pathData} fill="none" stroke={INK} strokeWidth={0.18} strokeDasharray="0.9,0.6" />}
          {(piece.darts || []).map((dart, i) => (
            <polyline key={`dart-${i}`} points={dart.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={INK} strokeWidth={0.22} />
          ))}
          {fold && (
            <g stroke={INK} strokeWidth={0.22} fill="none">
              <line x1={foldX + 1.4} y1={piece.height * 0.25} x2={foldX + 1.4} y2={piece.height * 0.75} />
              <line x1={foldX} y1={piece.height * 0.25} x2={foldX + 1.4} y2={piece.height * 0.25} />
              <line x1={foldX} y1={piece.height * 0.75} x2={foldX + 1.4} y2={piece.height * 0.75} />
              <text x={foldX + 2.2} y={piece.height * 0.5} fontSize={2.2} fill={INK} stroke="none" transform={`rotate(90 ${foldX + 2.2} ${piece.height * 0.5})`} textAnchor="middle">
                FOLD
              </text>
            </g>
          )}
          {g && (
            <g stroke={INK} strokeWidth={0.25} fill={INK}>
              <line x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} />
              <polygon points={arrow(g[0], g[1], g[2], g[3])} stroke="none" />
              <polygon points={arrow(g[2], g[3], g[0], g[1])} stroke="none" />
            </g>
          )}
        </g>
      </svg>
      <figcaption>
        <b>{piece.name}</b>
        <span>{cutLabel(piece)}</span>
      </figcaption>
    </figure>
  );
}

// Every size's outline of one piece on top of the others, from the same
// drafting origin, as a grading nest shows it.
function GradingNest({ name, piecesBySize, sizes }) {
  const outlines = sizes.map((s, i) => ({ size: s, color: SIZE_COLORS[i % SIZE_COLORS.length], piece: piecesBySize[s]?.find((p) => p.name === name) })).filter((o) => o.piece);
  if (!outlines.length) return null;
  const w = Math.max(...outlines.map((o) => o.piece.width));
  const h = Math.max(...outlines.map((o) => o.piece.height));
  const pad = 2;
  return (
    <figure className="sheet-nest">
      <svg viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} width={(w + pad * 2) * NEST_SCALE} height={(h + pad * 2) * NEST_SCALE}>
        {outlines.map((o) => (
          <path key={o.size} d={o.piece.pathData} fill="none" stroke={o.color} strokeWidth={0.3} />
        ))}
      </svg>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

// A printable pattern sheet for one revision of an order: what the garment is,
// its sizes, every pattern piece, how much fabric it takes, the technical
// drawing, the grading nest and the order it's sewn in.
export default function PatternSheet({ orderId, version, onBack }) {
  const [order, setOrder] = useState(null);
  const [mockup, setMockup] = useState(null);
  const [fabrics, setFabrics] = useState([]);
  const [error, setError] = useState(null);
  const [size, setSize] = useState(null);
  const [width, setWidth] = useState("150");
  const [usage, setUsage] = useState(null);
  const [usageState, setUsageState] = useState("idle"); // idle | working | done | failed

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getOrder(orderId), api.getMockup(orderId, version)])
      .then(([o, m]) => {
        if (cancelled) return;
        setOrder(o);
        setMockup(m);
        setSize(sampleSize((m.mockup.sizes || []).map((s) => s.label).filter((l) => m.pieces[l]).concat(Object.keys(m.pieces)).filter((l, i, a) => a.indexOf(l) === i)));
      })
      .catch((e) => !cancelled && setError(e.message));
    api
      .fabrics()
      .then((f) => !cancelled && setFabrics(f))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId, version]);

  async function workOutUsage() {
    const w = Number(String(width).replace(",", "."));
    if (!Number.isFinite(w) || w < 20 || w > 500) {
      setUsageState("failed");
      setUsage({ error: "Fabric width must be between 20 and 500 cm." });
      return;
    }
    setUsageState("working");
    try {
      const res = await api.cuttingPlan(orderId, { version, fabricWidth: w, singleSizes: true, maxGarments: 1, maxPlies: 300 });
      setUsage({ bySize: consumptionBySize(res), width: w });
      setUsageState("done");
    } catch (e) {
      setUsage({ error: e.message });
      setUsageState("failed");
    }
  }

  // In the size chart's own order (the pieces come keyed by size, sorted by name).
  // Work out the fabric per garment once the sheet has loaded, so a printed
  // sheet has it without anyone clicking.
  const [autoRun, setAutoRun] = useState(false);
  useEffect(() => {
    if (mockup && !autoRun) {
      setAutoRun(true);
      workOutUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockup]);

  const sizes = useMemo(() => {
    if (!mockup) return [];
    const chart = (mockup.mockup.sizes || []).map((s) => s.label).filter((l) => mockup.pieces[l]);
    return [...chart, ...Object.keys(mockup.pieces).filter((l) => !chart.includes(l))];
  }, [mockup]);
  if (error) {
    return (
      <div className="sheet-wrap">
        <p className="error">Couldn't open this pattern sheet: {error}</p>
        <button className="btn-add btn-inline no-print" onClick={onBack}>Back to the order</button>
      </div>
    );
  }
  if (!order || !mockup) return <p className="empty">Loading the pattern sheet…</p>;

  const opts = mockup.mockup.options || {};
  const accessories = opts.addOns?.accessories || [];
  const pieces = mockup.pieces[size] || [];
  const garmentType = order.garmentType;
  const views = layoutGarmentViews(pieces, {
    accessories,
    gender: opts.gender,
    dartPosition: opts.dartPosition,
    sleeveStyle: opts.sleeveStyle,
    collarStyle: garmentType === "polo_shirt" ? "polo" : opts.collar || garmentType === "school_shirt" ? opts.collarStyle || "convertible" : undefined,
    merchItem: garmentType === "other" ? opts.merch?.item : undefined,
  });
  const snapshot = mockup.mockup.sizes || [];
  const fields = measurementFieldsFor(garmentType).filter((f) => snapshot.some((s) => s.measurements?.[f.key]));
  // What each size comes out at once sewn (ukuran jadi), in the size chart's order.
  const finishedSizes = snapshot.map((sz) => sz.label).filter((l) => mockup.summaries?.[l]?.finished?.length);
  const finishedRows = finishedSizes.length ? mockup.summaries[finishedSizes[0]].finished : [];
  const fabric = fabrics.find((f) => fabricLabel(f) === order.fabric?.name);
  const nestNames = sizes.length > 1 ? gradingPieceNames(mockup.pieces) : [];
  const steps = sewingSteps(garmentType, opts, pieces, accessories);
  const features = featuresFor(garmentType, opts, pieces, accessories);
  const total = snapshot.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
  const notes = pieces.filter((p) => p.notes).map((p) => [p.name, p.notes]);

  return (
    <div className="sheet-wrap">
      <div className="sheet-toolbar no-print">
        <button className="link-btn" onClick={onBack}>← Back to the order</button>
        <label className="cutplan-field">
          <span>Pieces drawn in size</span>
          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
            {sizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="btn-add btn-inline" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <div>
            <h1>{GARMENT_LABELS[garmentType] || garmentType}</h1>
            <p>{order.customerName}</p>
          </div>
          <dl>
            <div><dt>Order</dt><dd>#{order.id}</dd></div>
            <div><dt>Revision</dt><dd>v{mockup.mockup.version}{mockup.mockup.note ? ` · ${mockup.mockup.note}` : ""}</dd></div>
            <div><dt>Sizes</dt><dd>{sizes.join(", ")}</dd></div>
            <div><dt>Garments</dt><dd>{total}</dd></div>
            <div><dt>Date</dt><dd>{new Date(mockup.mockup.createdAt).toLocaleDateString("id-ID")}</dd></div>
          </dl>
        </header>

        <div className="sheet-grid">
          <aside className="sheet-side">
            <section>
              <h2>The design</h2>
              <ul className="sheet-list">
                {features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>

            {fields.length > 0 && (
              <section>
                <h2>Measurements (cm)</h2>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th />
                      {snapshot.map((s) => (
                        <th key={s.label}>{s.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.key}>
                        <td>
                          {f.label.replace(/\s*\(.*?\)/, "").replace(/ — .*/, "")}
                          {f.local && <span className="sheet-local">{f.local}</span>}
                        </td>
                        {snapshot.map((s) => (
                          <td key={s.label}>{s.measurements?.[f.key] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="sheet-table-qty">
                      <td>Quantity</td>
                      {snapshot.map((s) => (
                        <td key={s.label}>{s.quantity || 0}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h2>Fabric</h2>
              {order.fabric?.name ? (
                <p className="sheet-p">
                  <b>{order.fabric.name}</b>
                  {fabric?.composition ? ` · ${fabric.composition}` : ""}
                  {fabric?.benefits?.length ? <><br />{fabric.benefits.join(" · ")}</> : null}
                </p>
              ) : (
                <p className="sheet-p">Not chosen yet.</p>
              )}
              {order.fabric?.notes && <p className="sheet-p">{order.fabric.notes}</p>}
            </section>

            <section>
              <h2>Fabric per garment</h2>
              {usageState === "done" ? (
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Main</th>
                      {Object.values(usage.bySize).some((u) => u.contrast) && <th>Contrast</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((s) => (
                      <tr key={s}>
                        <td>{s}</td>
                        <td>{usage.bySize[s]?.main ? `${usage.bySize[s].main} m` : "—"}</td>
                        {Object.values(usage.bySize).some((u) => u.contrast) && <td>{usage.bySize[s]?.contrast ? `${usage.bySize[s].contrast} m` : "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="sheet-p sheet-small">
                {usageState === "done"
                  ? `One garment laid out alone on ${usage.width} cm fabric, with 2 cm end allowance. Sizes with no garments ordered aren't worked out. A mixed-size cutting plan uses less per garment.`
                  : usageState === "failed"
                    ? usage.error
                    : "Worked out by laying out one garment of each size."}
              </p>
              <div className="sheet-usage no-print">
                <label className="cutplan-field">
                  <span>Fabric width (cm)</span>
                  <input type="text" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
                </label>
                <button className="btn-add btn-inline btn-ghost" onClick={workOutUsage} disabled={usageState === "working"}>
                  {usageState === "working" ? "Working out…" : "Work it out"}
                </button>
              </div>
            </section>

            <section>
              <h2>Seam allowances</h2>
              <table className="sheet-table">
                <tbody>
                  {seamAllowances(garmentType).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sheet-p sheet-small">Already included in the cutting lines (solid). The dashed line is the sewing line.</p>
            </section>
          </aside>

          <div className="sheet-main">
            <section>
              <h2>Pattern pieces · size {size}</h2>
              <div className="sheet-pieces">
                {pieces.map((p, i) => (
                  <SheetPiece key={`${p.name}-${i}`} piece={p} />
                ))}
              </div>
            </section>

            <section>
              <h2>Technical drawing</h2>
              <div className="sheet-drawings">
                <FlatDrawing layout={views.front} label="Front" />
                <FlatDrawing layout={views.back} label="Back" />
              </div>
            </section>

            {finishedRows.length > 0 && (
              <section>
                <h2>Finished garment (cm)</h2>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th />
                      {finishedSizes.map((l) => (
                        <th key={l}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {finishedRows.map((r) => (
                      <tr key={r.key}>
                        <td>
                          {r.label}
                          <span className="sheet-local">{r.local}</span>
                        </td>
                        {finishedSizes.map((l) => (
                          <td key={l}>{mockup.summaries[l]?.finished?.find((f) => f.key === r.key)?.cm?.toFixed(1) ?? "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>

        <div className="sheet-bottom">
          {nestNames.length > 0 && (
            <section>
              <h2>Grading</h2>
              <div className="sheet-nests">
                {nestNames.map((n) => (
                  <GradingNest key={n} name={n} piecesBySize={mockup.pieces} sizes={sizes} />
                ))}
              </div>
              <div className="sheet-legend">
                {sizes.map((s, i) => (
                  <span key={s}>
                    <i style={{ background: SIZE_COLORS[i % SIZE_COLORS.length] }} />
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2>Sewing order</h2>
            <ol className="sheet-steps">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2>Cutting notes</h2>
            <ul className="sheet-list sheet-notes">
              {notes.map(([name, note]) => (
                <li key={name}>
                  <b>{name}:</b> {note}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
