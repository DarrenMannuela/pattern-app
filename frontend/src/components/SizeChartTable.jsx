// The size chart as a konveksi writes it: one column per size, one row per
// body measurement, every cell editable in place — so a whole run can be
// read across and a wrong number stands out, instead of opening one size at
// a time.
export default function SizeChartTable({ sizes, fields, onSize, onMeasurement, onRemove }) {
  if (!sizes.length) return null;
  const total = sizes.reduce((t, sz) => t + (Number(sz.quantity) || 0), 0);
  const num = (v) => (v === undefined || v === null ? "" : v);
  return (
    <div className="sc-wrap">
      <table className="sc-table">
        <thead>
          <tr>
            <th scope="col" className="sc-corner">
              Size
            </th>
            {sizes.map((sz, i) => (
              <th scope="col" key={i}>
                <input
                  className="sc-label"
                  value={sz.label}
                  placeholder="e.g. M"
                  aria-label={`Size ${i + 1} name`}
                  onChange={(e) => onSize(i, { label: e.target.value })}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="sc-qty">
            <th scope="row">
              Quantity <span className="sc-sub">{total} pcs in all</span>
            </th>
            {sizes.map((sz, i) => (
              <td key={i}>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={num(sz.quantity)}
                  aria-label={`${sz.label || `Size ${i + 1}`} quantity`}
                  onChange={(e) => onSize(i, { quantity: Number(e.target.value) })}
                />
              </td>
            ))}
          </tr>
          {fields.map((f) => (
            <tr key={f.key}>
              <th scope="row">
                {f.label.replace(/ \(cm[^)]*\)/, "")}
                {f.local && <span className="sc-sub">{f.local}</span>}
              </th>
              {sizes.map((sz, i) => (
                <td key={i}>
                  <input
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    value={num(sz.measurements?.[f.key])}
                    aria-label={`${sz.label || `Size ${i + 1}`} ${f.label}`}
                    onChange={(e) => onMeasurement(i, f.key, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
          <tr className="sc-actions">
            <th scope="row" />
            {sizes.map((sz, i) => (
              <td key={i}>
                <button type="button" className="link-btn link-btn-danger" onClick={() => onRemove(i)} aria-label={`Remove size ${sz.label || i + 1}`}>
                  Remove
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="note sc-note">All measurements in cm, taken on the body. Remember to save the order (or generate a mockup) after editing.</p>
    </div>
  );
}
