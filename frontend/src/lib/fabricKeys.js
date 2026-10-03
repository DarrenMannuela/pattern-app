import { MOTIF_PATTERNS } from "./motifs.js";

// Which cloth a piece is cut from, the same way the cutting planner decides
// (backend/cutplan fabricOf): "main", "contrast" for a plain second fabric, or
// "contrast/<motif>" for a patterned one. Different motifs are different cloth.
export function fabricKey(piece) {
  if (piece?.fabric?.startsWith("contrast/")) return piece.fabric; // already a key (a layout piece)
  if (piece?.fabric !== "contrast") return "main";
  return piece.motif && piece.motif !== "solid" ? `contrast/${piece.motif}` : "contrast";
}

// "Main fabric", "Contrast fabric", "Contrast fabric — Batik".
export function fabricName(key) {
  if (key === "main") return "Main fabric";
  if (key === "contrast") return "Contrast fabric";
  const motif = String(key).replace(/^contrast\//, "");
  const label = MOTIF_PATTERNS.find((p) => p.value === motif)?.label || motif;
  return `Contrast fabric — ${label}`;
}

// Fabric keys in a steady order: main, plain contrast, then each motif.
export function orderFabrics(keys) {
  const set = [...new Set(keys)];
  const rank = (k) => (k === "main" ? 0 : k === "contrast" ? 1 : 2);
  return set.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
