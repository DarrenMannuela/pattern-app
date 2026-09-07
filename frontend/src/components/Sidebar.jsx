import { useState } from "react";

const DEFAULT_COLOR = "#3B7A82";

export default function Sidebar({
  fabricWidth,
  setFabricWidth,
  seamAllowance,
  setSeamAllowance,
  pieces,
  onAddPiece,
  onRemovePiece,
  onGenerate,
  generating,
  error,
}) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(40);
  const [qty, setQty] = useState(2);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [grainLocked, setGrainLocked] = useState(false);

  function handleAdd() {
    if (!width || !height || !qty) return;
    onAddPiece({
      name: name.trim() || "Piece",
      width: Number(width),
      height: Number(height),
      qty: Number(qty),
      color: color.trim() || DEFAULT_COLOR,
      grainLocked,
    });
    setName("");
  }

  return (
    <aside className="sidebar">
      <h1>Marker Layout</h1>
      <p className="sub">
        Add your pattern pieces and fabric width, then generate the most
        efficient cutting layout.
      </p>

      <div className="field">
        <label>Fabric width (cm)</label>
        <input
          type="number"
          min="20"
          value={fabricWidth}
          onChange={(e) => setFabricWidth(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label>Seam allowance, added per piece (cm)</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={seamAllowance}
          onChange={(e) => setSeamAllowance(Number(e.target.value))}
        />
      </div>

      <div className="divider" />

      <div className="field">
        <label>Piece name</label>
        <input
          type="text"
          placeholder="e.g. Bodice front"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="row2">
        <div className="field">
          <label>Width (cm)</label>
          <input
            type="number"
            min="1"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Height (cm)</label>
          <input
            type="number"
            min="1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Color</label>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={grainLocked}
          onChange={(e) => setGrainLocked(e.target.checked)}
        />
        Grain-locked (piece must run along fabric length — only flips 180°,
        no 90° turn)
      </label>

      <button className="btn-add" onClick={handleAdd}>
        + Add piece
      </button>

      <div className="divider" />

      <ul className="piece-list">
        {pieces.map((p) => (
          <li className="piece" key={p.id}>
            <div className="info">
              <span className="swatch" style={{ background: p.color }} />
              <span className="name">{p.name}</span>
              <span className="dims">
                {p.width}×{p.height} ×{p.qty}
              </span>
            </div>
            <button className="rm" onClick={() => onRemovePiece(p.id)}>
              ×
            </button>
          </li>
        ))}
        {pieces.length === 0 && (
          <li className="piece-empty">No pieces yet — add one above.</li>
        )}
      </ul>

      <button
        className="btn-generate"
        onClick={onGenerate}
        disabled={pieces.length === 0 || generating}
      >
        {generating ? "Generating…" : "Generate layout"}
      </button>

      {error && <p className="error">{error}</p>}

      <p className="note">
        This is a rectangular shelf-packing nester — a solid MVP for
        planning yardage. True irregular pattern curves (necklines,
        armholes) would use no-fit-polygon nesting for even tighter
        packing, the way tools like SVGnest do.
      </p>
    </aside>
  );
}
