const BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listPieces: () => request("/api/pieces"),

  addPiece: (piece) =>
    request("/api/pieces", {
      method: "POST",
      body: JSON.stringify(piece),
    }),

  removePiece: (id) =>
    request(`/api/pieces/${id}`, { method: "DELETE" }),

  pack: (fabricWidth, seamAllowance) =>
    request("/api/pack", {
      method: "POST",
      body: JSON.stringify({ fabricWidth, seamAllowance }),
    }),

  draft: (measurements) =>
    request("/api/draft", {
      method: "POST",
      body: JSON.stringify(measurements),
    }),
};
