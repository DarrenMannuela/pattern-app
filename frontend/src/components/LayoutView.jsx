import { useEffect, useState } from "react";
import { api } from "../api";
import Sidebar from "./Sidebar";
import LayoutCanvas from "./Canvas";
import StatBar from "./StatBar";

export default function LayoutView() {
  const [pieces, setPieces] = useState([]);
  const [fabricWidth, setFabricWidth] = useState(150);
  const [seamAllowance, setSeamAllowance] = useState(1);
  const [result, setResult] = useState(null);
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
      const res = await api.pack(fabricWidth, seamAllowance);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

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
        <StatBar result={result} />
        <LayoutCanvas result={result} />
      </main>
    </div>
  );
}
