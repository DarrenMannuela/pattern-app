// What the cutting room reads off a pattern before it is cut: every size's
// finished measurements side by side (ukuran jadi, as a konveksi size chart
// lists them), and whether the selected size's pieces sew together.
export default function PatternSummary({ summaries, sizeOrder, activeSize, onSize }) {
  const sizes = (sizeOrder || []).filter((s) => summaries?.[s]);
  if (!sizes.length) return null;
  const rows = summaries[sizes[0]].finished || [];
  const checks = summaries[activeSize]?.checks || [];
  const failing = checks.filter((c) => !c.ok).length;
  const valueOf = (size, key) => summaries[size]?.finished?.find((f) => f.key === key)?.cm;

  return (
    <div className="pattern-summary">
      <section aria-labelledby="finished-heading">
        <h3 id="finished-heading" className="ps-heading">
          Finished measurements <span className="ps-local">ukuran jadi, cm</span>
        </h3>
        <div className="ps-table-wrap">
          <table className="ps-table">
            <thead>
              <tr>
                <th scope="col">Measurement</th>
                {sizes.map((s) => (
                  <th scope="col" key={s} className={s === activeSize ? "is-active" : undefined}>
                    <button type="button" className="ps-size" onClick={() => onSize?.(s)} aria-pressed={s === activeSize}>
                      {s}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.label}
                    <span className="ps-local">{r.local}</span>
                  </th>
                  {sizes.map((s) => (
                    <td key={s} className={s === activeSize ? "is-active" : undefined}>
                      {valueOf(s, r.key)?.toFixed(1) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {checks.length > 0 && (
        <section aria-labelledby="checks-heading">
          <h3 id="checks-heading" className="ps-heading">
            Seam check, size {activeSize}{" "}
            <span className={`ps-badge ${failing ? "is-bad" : "is-ok"}`}>{failing ? `${failing} to fix` : "all pass"}</span>
          </h3>
          <ul className="ps-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "is-ok" : "is-bad"}>
                <span className="ps-mark" aria-hidden="true">{c.ok ? "✓" : "✕"}</span>
                <span className="ps-check-text">
                  <span className="visually-hidden">{c.ok ? "Passes: " : "Fails: "}</span>
                  {c.label}
                  <span className="ps-detail">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
