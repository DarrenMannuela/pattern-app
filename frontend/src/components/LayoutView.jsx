import { useEffect, useState } from "react";
import { api } from "../api";
import Sidebar from "./Sidebar";
import LayoutCanvas from "./Canvas";
import StatBar from "./StatBar";

const FABRIC_LABEL = { main: "Main fabric", contrast: "Contrast fabric" };

// Pieces of a different fabric (a motif band, an insert panel, a contrast
// trim, a side stripe) come from a different bolt of cloth, so each fabric is
// nested onto its own length of fabric rather than mixed into one marker.
function groupByFabric(pieces) {
  const groups = { main: [], contrast: [] };
  for (const p of pieces) groups[p.fabric === "contrast" ? "contrast" : "main"].push(p);
  return groups;
}

export default function LayoutView() {
  const [pieces, setPieces] = useState([]);
  const [fabricWidth, setFabricWidth] = useState(150);
  const [seamAllowance, setSeamAllowance] = useState(0.25);
  const [results, setResults] = useState({ main: null, contrast: null });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listPieces()
      .then(setPieces)
      .catch((e) => setError(e.message));
  }, []);

  async function handleAddPiece(piece) {
    try {
      const created = await api.addPiece(piece);
      setPieces((prev) => [...prev, created]);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRemovePiece(id) {
    try {
      await api.removePiece(id);
      setPieces((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const groups = groupByFabric(pieces);
      const next = { main: null, contrast: null };
      for (const fabric of ["main", "contrast"]) {
        if (groups[fabric].length === 0) continue;
        next[fabric] = await api.pack(fabricWidth, seamAllowance, groups[fabric]);
      }
      setResults(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const fabricsWithPieces = ["main", "contrast"].filter((f) => groupByFabric(pieces)[f].length > 0);

  return (
    <div className="tab-body">
      <Sidebar
        fabricWidth={fabricWidth}
        setFabricWidth={setFabricWidth}
        seamAllowance={seamAllowance}
        setSeamAllowance={setSeamAllowance}
        pieces={pieces}
        onAddPiece={handleAddPiece}
        onRemovePiece={handleRemovePiece}
        onGenerate={handleGenerate}
        generating={generating}
        error={error}
      />
      <main>
        {fabricsWithPieces.length === 0 && <StatBar result={null} />}
        {fabricsWithPieces.length === 0 && <LayoutCanvas result={null} />}
        {fabricsWithPieces.map((fabric) => (
          <section key={fabric} className="fabric-layout">
            {fabricsWithPieces.length > 1 && <h2 className="fabric-layout-title">{FABRIC_LABEL[fabric]}</h2>}
            <StatBar result={results[fabric]} />
            <LayoutCanvas result={results[fabric]} />
          </section>
        ))}
      </main>
    </div>
  );
}
