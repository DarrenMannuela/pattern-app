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

  grade: (payload) =>
    request("/api/grade", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  gradeChild: (payload) =>
    request("/api/grade-child", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listOrders: () => request("/api/orders"),

  createOrder: (order) =>
    request("/api/orders", { method: "POST", body: JSON.stringify(order) }),

  getOrder: (id) => request(`/api/orders/${id}`),

  updateOrder: (id, order) =>
    request(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify(order) }),

  deleteOrder: (id) => request(`/api/orders/${id}`, { method: "DELETE" }),

  createMockup: (id, payload) =>
    request(`/api/orders/${id}/mockups`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  previewPieces: (id, payload) =>
    request(`/api/orders/${id}/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  photoStatus: () => request("/api/analyze-photo/status"),

  analyzePhoto: (image) =>
    request("/api/analyze-photo", { method: "POST", body: JSON.stringify({ image }) }),

  getMockup: (id, version) => request(`/api/orders/${id}/mockups/${version}`),

  fabrics: () => request("/api/fabrics"),
};
