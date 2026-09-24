import { useState } from "react";
import { api } from "../api";
import LayoutCanvas from "./Canvas";
import { COMPARE_WIDTHS, DEFAULT_PLAN_FORM, TUBE_WIDTHS, compareActual, metres, planRequest, ratioText, rupiah } from "../lib/cutPlan.js";
import { formatElapsed, useElapsed } from "../lib/useElapsed.js";

const FABRIC_NAME = { main: "Main fabric", contrast: "Contrast fabric" };

function Field({ label, hint, children }) {
  return (
    <label className="cutplan-field" title={hint}>
      <span>{label}</span>
      {children}
    </label>
  );
}

// How the order would really be cut: lays (a stack of plies cut to one marker,
// a nested layout of a few garments in a size ratio) instead of one giant
// layout of every garment. Worked out on the server from the revision's own
// drafted pieces.
// What cutting the order really used, typed in afterwards, and how far the
// plan was from it.
function ActualCut({ actual, onSave, plan, reservePercent, onPlanAtWidth }) {
  const toForm = (a) => ({ meters: a?.meters ? String(a.meters) : "", kg: a?.kg ? String(a.kg) : "", widthCm: a?.widthCm ? String(a.widthCm) : "", note: a?.note || "" });
  const [form, setForm] = useState(() => toForm(actual));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const num = (v) => (String(v).trim() === "" ? 0 : Number(String(v).replace(",", ".")));

  async function save() {
    const next = { meters: num(form.meters), kg: num(form.kg), widthCm: num(form.widthCm), note: form.note.trim() };
    if ([next.meters, next.kg, next.widthCm].some((v) => !Number.isFinite(v) || v < 0)) {
      setError("Use plain numbers, like 131.5.");
      return;
    }
    if (!next.meters && !next.kg) {
      setError("Enter the metres used, or the kilos for knit.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const c = compareActual(plan, actual, reservePercent);
  return (
    <div className="cutplan-actual">
      <div className="pm-slot-title">What the cut really used</div>
      <p className="note" style={{ marginTop: 2 }}>
        After this order is cut, enter the fabric it took. The plan is then checked against your cutting room, not just
        against published figures.
      </p>
      <div className="cutplan-form">
        <label className="cutplan-field">
          <span>Metres used</span>
          <input type="text" inputMode="decimal" value={form.meters} onChange={set("meters")} />
        </label>
        <label className="cutplan-field">
          <span>or kilos (knit)</span>
          <input type="text" inputMode="decimal" value={form.kg} onChange={set("kg")} />
        </label>
        <label className="cutplan-field">
          <span>Cut on width (cm)</span>
          <input type="text" inputMode="decimal" value={form.widthCm} onChange={set("widthCm")} />
        </label>
        <label className="cutplan-field cutplan-field-wide">
          <span>Note</span>
          <input type="text" value={form.note} onChange={set("note")} placeholder="e.g. roll ends and a faulty metre included" />
        </label>
        <button type="button" className="btn-add btn-inline btn-ghost" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {c && !c.sameWidth && (
        <p className="note">
          That cut was on {c.widthCm} cm fabric, but this plan is for {plan.fabricWidthCm} cm.{" "}
          <button type="button" className="link-btn" onClick={() => onPlanAtWidth(c.widthCm)}>
            Plan at {c.widthCm} cm
          </button>{" "}
          to compare like with like.
        </p>
      )}
      {c?.sameWidth && (
        <p className={c.close ? "cutplan-verdict cutplan-verdict-ok" : "cutplan-verdict"}>
          The plan says {c.estimate} {c.unit} before the reserve; the cut used {c.real} {c.unit}
          {c.close
            ? `, within ${Math.abs(c.diffPercent)}%. The plan matches your cutting room.`
            : c.diffPercent > 0
              ? `, ${c.diffPercent}% more. Some of that is ends of rolls, faults and spare pieces a layout can't see. Set the reserve to ${c.suggestedReserve}% to plan the way you actually cut.`
              : `, ${Math.abs(c.diffPercent)}% less. Your cutters are beating the plan; check the plies and garments per marker match how it was really laid.`}
        </p>
      )}
    </div>
  );
}

export default function CuttingPlan({ orderId, version, actualFabric, onSaveActual }) {
  const [form, setForm] = useState(DEFAULT_PLAN_FORM);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(null); // "fabric:lay index" of the marker on show
  const elapsed = useElapsed(busy);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function run(compare) {
    const { body, error: problem } = planRequest(form, compare ? (form.tubular ? TUBE_WIDTHS : COMPARE_WIDTHS) : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await api.cuttingPlan(orderId, { ...body, version }));
      setOpen(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cheapest = result?.widths?.length
    ? result.widths.filter((w) => w.complete).reduce((a, b) => (b.areaM2 < a.areaM2 ? b : a), { areaM2: Infinity })
    : null;

  return (
    <section className="cutplan">
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Cutting plan</h2>
      <p className="note" style={{ marginTop: 0 }}>
        How this order is cut: the sizes are split into lays, each a stack of plies of fabric cut to one marker
        (a nested layout of a few garments). Pieces of different sizes fill each other's gaps, so mixed markers
        usually use less cloth. Worked out from revision v{version}'s own pieces and its saved quantities.
      </p>

      <div className="cutplan-form">
        <Field label="Fabric width (cm)" hint="The usable width of the roll, less its selvedges.">
          <input type="text" inputMode="decimal" value={form.fabricWidth} onChange={set("fabricWidth")} />
        </Field>
        <Field label="Plies per lay" hint="The tallest stack your cutting machine takes. Usually 50 to 100.">
          <input type="text" inputMode="numeric" value={form.maxPlies} onChange={set("maxPlies")} />
        </Field>
        <Field label="Garments per marker" hint="More per marker is a longer table and a harder spread. 4 is usual.">
          <input type="text" inputMode="numeric" value={form.maxGarments} onChange={set("maxGarments")} />
        </Field>
        <label className="check cutplan-check">
          <input type="checkbox" checked={form.mixSizes} onChange={set("mixSizes")} />
          Mix sizes in a marker
        </label>
        <label className="check cutplan-check" title="Fabric with a direction (a nap, batik or a printed motif) can't have pieces turned end for end, which uses more cloth.">
          <input type="checkbox" checked={form.oneWay} onChange={set("oneWay")} />
          One-way fabric (batik, nap, printed motif)
        </label>
        <label className="check cutplan-check" title="Circular knit (kaos, pique) sold as a tube. Enter the tube's width laid flat: each ply is two layers.">
          <input type="checkbox" checked={form.tubular} onChange={set("tubular")} />
          Tubular knit
        </label>
        <label className="check cutplan-check" title="Each lay is nested on every width the fabric is sold in and cut on whichever takes the least cloth. Useful for knit, where each size suits a different tube.">
          <input type="checkbox" checked={form.widthPerLay} onChange={set("widthPerLay")} />
          Best width for each lay
        </label>
      </div>
      <div className="cutplan-form">
        <Field label="Price per metre (Rp)" hint="The fabric's price, to cost the order. Leave empty if unknown.">
          <input type="text" inputMode="numeric" value={form.pricePerMeter} onChange={set("pricePerMeter")} placeholder="e.g. 32.000" />
        </Field>
        <Field label="or per kilo (Rp)" hint="For knit bought by weight; needs the fabric weight under More options.">
          <input type="text" inputMode="numeric" value={form.pricePerKg} onChange={set("pricePerKg")} placeholder="e.g. 115.000" />
        </Field>
      </div>

      <button type="button" className="link-btn" onClick={() => setMore((m) => !m)} aria-expanded={more}>
        {more ? "Hide more options" : "More options: stripes and checks, shrinkage, end allowance, reserve, weight"}
      </button>
      {more && (
        <div className="cutplan-form cutplan-more">
          <Field label="Stripe repeat along roll (cm)" hint="For bands running across the fabric, or checks: how far apart they repeat down the roll. The fronts, backs, sleeves, collars and pockets are placed on the repeat so the stripes meet at the seams. Leave empty for plain fabric.">
            <input type="text" inputMode="decimal" value={form.stripeLength} onChange={set("stripeLength")} placeholder="plain" />
          </Field>
          <Field label="Stripe repeat across (cm)" hint="For stripes running down the fabric, or checks: how far apart they repeat across it. Each piece's centre is placed on a stripe.">
            <input type="text" inputMode="decimal" value={form.stripeWidth} onChange={set("stripeWidth")} placeholder="plain" />
          </Field>
          <Field label="Shrinks along length (%)" hint="Pieces are cut this much larger so they finish the right size after washing. Woven usually 1 to 3, knit up to 5.">
            <input type="text" inputMode="decimal" value={form.shrinkLength} onChange={set("shrinkLength")} />
          </Field>
          <Field label="Shrinks across width (%)">
            <input type="text" inputMode="decimal" value={form.shrinkWidth} onChange={set("shrinkWidth")} />
          </Field>
          <Field label="End allowance (cm per ply)" hint="Cloth lost at each end of every ply.">
            <input type="text" inputMode="decimal" value={form.endAllowance} onChange={set("endAllowance")} />
          </Field>
          <Field label="Reserve (%)" hint="Extra to buy for fabric faults and the end of the roll.">
            <input type="text" inputMode="decimal" value={form.reservePercent} onChange={set("reservePercent")} />
          </Field>
          <Field label="Fabric weight (g/m²)" hint="Optional: gives the order's weight in kg, for fabric sold by the kilo.">
            <input type="text" inputMode="decimal" value={form.gsm} onChange={set("gsm")} placeholder="optional" />
          </Field>
          <Field label="Contrast fabric width (cm)" hint="Only if a motif band, panel or trim is cut from a second fabric.">
            <input type="text" inputMode="decimal" value={form.contrastWidth} onChange={set("contrastWidth")} placeholder="same as main" />
          </Field>
        </div>
      )}

      <div className="cutplan-actions">
        <button type="button" className="btn-add btn-inline" onClick={() => run(false)} disabled={busy}>
          {busy ? `Planning… ${formatElapsed(elapsed)}` : "Plan the cutting"}
        </button>
        <button type="button" className="btn-add btn-inline btn-ghost" onClick={() => run(true)} disabled={busy} title={form.tubular ? "Plans the order on 36\" to 46\" tubes and compares" : `Plans the order on ${COMPARE_WIDTHS.join(", ")} cm fabric and compares`}>
          Compare fabric widths
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {onSaveActual && (
        <ActualCut
          actual={actualFabric}
          onSave={onSaveActual}
          plan={result?.plans.find((p) => p.fabric === "main")}
          reservePercent={Number(String(form.reservePercent).replace(",", ".")) || 0}
          onPlanAtWidth={(w) => {
            setForm((f) => ({ ...f, fabricWidth: String(w) }));
            setResult(null);
          }}
        />
      )}

      {result && (
        <div className="cutplan-result">
          {result.plans.map((plan) => (
            <div key={plan.fabric} className="cutplan-fabric">
              <div className="pm-slot-title">
                {FABRIC_NAME[plan.fabric]} ·{" "}
                {plan.fabricWidthCm ? `${plan.fabricWidthCm} cm ${plan.tubular ? "tube (laid flat)" : "wide"}` : `best ${plan.tubular ? "tube" : "width"} for each lay`} ·{" "}
                {plan.garments} garments
              </div>
              <div className="cutplan-stats">
                <div className="cutplan-stat cutplan-stat-main">
                  <b>{metres(plan.buyMeters)}</b>
                  <span>
                    {plan.tubular ? "of tube " : ""}to buy ({metres(plan.meters)} cut + reserve)
                  </span>
                </div>
                <div className="cutplan-stat">
                  <b>{metres(plan.perGarmentM)}</b>
                  <span>per garment</span>
                </div>
                <div className="cutplan-stat">
                  <b>{plan.efficiency}%</b>
                  <span>of the cloth becomes pieces</span>
                </div>
                {plan.cost > 0 && (
                  <div className="cutplan-stat">
                    <b>{rupiah(plan.cost)}</b>
                    <span>fabric · {rupiah(plan.costPerGarment)} per garment</span>
                  </div>
                )}
                {plan.weightKg > 0 && (
                  <div className="cutplan-stat">
                    <b>{plan.weightKg} kg</b>
                    <span>
                      at {form.gsm} g/m²{plan.garmentsPerKg ? ` · ${plan.garmentsPerKg} per kg` : ""}
                    </span>
                  </div>
                )}
              </div>
              {plan.byWidth?.length > 1 && (
                <p className="note" style={{ margin: "0 0 10px" }}>
                  Buy{" "}
                  {plan.byWidth
                    .map((u) => `${metres(u.buyMeters)} of ${u.widthCm} cm${plan.tubular ? ` (${Math.round(u.widthCm / 2.54)}″)` : ""}${u.weightKg ? `, ${u.weightKg} kg` : ""}`)
                    .join("; ")}
                  .
                </p>
              )}
              {plan.notes?.map((n) => (
                <p key={n} className="cutplan-verdict cutplan-verdict-ok">{n}</p>
              ))}
              {plan.warnings?.map((w) => (
                <p key={w} className="error">{w}</p>
              ))}

              <table className="cutplan-table">
                <thead>
                  <tr>
                    <th>Marker</th>
                    {!plan.fabricWidthCm && <th>Width</th>}
                    <th>Plies</th>
                    <th>Garments</th>
                    <th>Marker length</th>
                    <th>Cloth</th>
                    <th aria-label="Show marker" />
                  </tr>
                </thead>
                <tbody>
                  {plan.lays.map((lay, i) => {
                    const id = `${plan.fabric}:${i}`;
                    const shown = open === id;
                    return [
                      <tr key={id}>
                        <td>{ratioText(lay.ratio)}</td>
                        {!plan.fabricWidthCm && <td>{lay.widthCm} cm</td>}
                        <td>{lay.plies}</td>
                        <td>{lay.garments}</td>
                        <td>{metres(lay.markerLengthCm / 100)} · {lay.efficiency.toFixed(0)}%</td>
                        <td>{metres(lay.fabricCm / 100)}</td>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setOpen(shown ? null : id)} aria-expanded={shown}>
                            {shown ? "Hide" : "Show"}
                          </button>
                        </td>
                      </tr>,
                      shown && (
                        <tr key={`${id}-marker`}>
                          <td colSpan={plan.fabricWidthCm ? 6 : 7}>
                            <div className="cutplan-marker">
                              <LayoutCanvas result={lay.marker} />
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {result.widths?.length > 0 && (
            <div className="cutplan-fabric">
              <div className="pm-slot-title">Main fabric on other widths</div>
              <table className="cutplan-table">
                <thead>
                  <tr>
                    <th>Width</th>
                    <th>Metres</th>
                    <th>Square metres</th>
                    {result.widths.some((w) => w.weightKg) && <th>Weight</th>}
                    <th>Cloth used</th>
                  </tr>
                </thead>
                <tbody>
                  {result.widths.map((w) => (
                    <tr key={w.widthCm} className={cheapest && w.widthCm === cheapest.widthCm ? "cutplan-best" : ""}>
                      <td>
                        {w.widthCm} cm{result.plans[0]?.tubular ? ` (${Math.round(w.widthCm / 2.54)}″ tube)` : ""}
                      </td>
                      <td>{w.complete ? metres(w.meters) : "doesn't fit"}</td>
                      <td>{w.complete ? `${w.areaM2} m²` : ""}</td>
                      {result.widths.some((x) => x.weightKg) && <td>{w.complete && w.weightKg ? `${w.weightKg} kg · ${w.garmentsPerKg}/kg` : ""}</td>}
                      <td>{w.complete ? `${w.efficiency}%` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                {result.plans[0]?.tubular
                  ? "Knit is sold by the kilo, so the width needing the fewest kilos is the cheapest. A tube that just fits two body panels side by side wastes far less than one a centimetre too narrow."
                  : "Fabric is sold by the metre and each width has its own price, so multiply the metres by that width's price per metre. Where the square metres are close, the cheaper price per metre wins."}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
