export default function StatBar({ result }) {
  if (!result) return null;

  return (
    <div className="statbar">
      <div className="stat">
        <div className="val mono">{result.totalHeight.toFixed(0)}</div>
        <div className="lbl">FABRIC LENGTH USED (CM)</div>
      </div>
      <div className="stat hi">
        <div className="val mono">{result.efficiency.toFixed(1)}%</div>
        <div className="lbl">CUTTING EFFICIENCY</div>
      </div>
      <div className="stat">
        <div className="val mono">{result.wasteArea.toFixed(0)}</div>
        <div className="lbl">WASTE AREA (CM²)</div>
      </div>
      <div className="stat">
        <div className="val mono">{result.pieceCount}</div>
        <div className="lbl">PIECES PLACED</div>
      </div>
    </div>
  );
}
