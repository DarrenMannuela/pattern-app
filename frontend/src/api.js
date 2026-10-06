// Where the backend is. Left unset in development it is the Go server on
// :8080; the Docker build sets it to "" so the API is asked on the page's own
// address, where nginx passes /api on to the backend.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

// An error from the backend, or from failing to reach it. status is the HTTP
// status, or 0 when there was no answer at all.
export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.cause = cause;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
// Reading a photo or a description with a local model can take minutes.
const READER_TIMEOUT_MS = 8 * 60_000;
// Nesting a big order is slow: tens of seconds for a few hundred pieces.
const PACK_TIMEOUT_MS = 5 * 60_000;

const STATUS_TEXT = {
  404: "That wasn't found. It may have been deleted.",
  413: "That is too large to send.",
  501: "That isn't set up on the server.",
  502: "The app's server isn't answering. It may be restarting: try again in a moment.",
  504: "The app's server took too long to answer. Try again in a moment.",
};

// Answers that mean the server is restarting or briefly unavailable.
const RETRY_STATUS = new Set([502, 503, 504]);

// The message to show for a failed response. The backend answers with plain
// text; a JSON error body is understood too, and an HTML page (an error page
// from something in front of the server) is no use to a person, so it is dropped.
async function errorMessage(res) {
  let text = "";
  try {
    text = (await res.text()).trim();
  } catch {
    // fall back to the status text below
  }
  if (text.startsWith("{")) {
    try {
      const body = JSON.parse(text);
      text = body.error || body.message || text;
    } catch {
      // not JSON after all; show it as it is
    }
  }
  if (text.startsWith("<")) text = "";
  if (text) return text;
  if (STATUS_TEXT[res.status]) return STATUS_TEXT[res.status];
  if (res.status >= 500) return "The server ran into a problem. Try again in a moment.";
  return `The request failed (${res.status}).`;
}

// Sends one request. A read (GET) that finds the server briefly away (no
// answer, or a 502-504 while Docker restarts it) is asked once more a moment
// later; a change is never sent twice.
async function request(path, options = {}) {
  try {
    return await attempt(path, options);
  } catch (e) {
    const read = !options.method || options.method === "GET";
    if (read && !e.timedOut && (e.status === 0 || RETRY_STATUS.has(e.status))) {
      await new Promise((r) => setTimeout(r, 800));
      return attempt(path, options);
    }
    throw e;
  }
}

async function attempt(path, { timeoutMs = DEFAULT_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw Object.assign(new ApiError("The server took too long to answer. Try again.", { cause: e }), { timedOut: true });
      }
      throw new ApiError(`Can't reach the app's server at ${BASE || window.location.origin}. Is it running?`, { cause: e });
    }
    if (!res.ok) throw new ApiError(await errorMessage(res), { status: res.status });
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch (e) {
      if (e.name === "AbortError") {
        throw new ApiError("The server took too long to answer. Try again.", { cause: e });
      }
      throw new ApiError("The server sent an answer the app couldn't read.", { status: res.status, cause: e });
    }
  } finally {
    clearTimeout(timer);
  }
}

// A file the app serves itself (the fabric colour list). Static files aren't
// behind the API, so they use the page's own origin.
async function fetchStatic(path) {
  let res;
  try {
    res = await fetch(path);
  } catch (e) {
    throw new ApiError(`Couldn't load ${path}.`, { cause: e });
  }
  if (!res.ok) throw new ApiError(`Couldn't load ${path} (${res.status}).`, { status: res.status });
  try {
    return await res.json();
  } catch (e) {
    throw new ApiError(`${path} isn't in the expected format.`, { cause: e });
  }
}

// Where an uploaded logo is served, from the id the upload answered.
export function artworkUrl(id) {
  return id ? `${BASE}/api/artwork/${encodeURIComponent(id)}` : "";
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

  // pieces, when given, packs exactly that list instead of everything in the
  // store — used to nest one fabric's pieces at a time.
  pack: (fabricWidth, seamAllowance, pieces) =>
    request("/api/pack", {
      method: "POST",
      body: JSON.stringify({ fabricWidth, seamAllowance, ...(pieces ? { pieces } : {}) }),
      timeoutMs: PACK_TIMEOUT_MS,
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

  analyzeText: (description) =>
    request("/api/analyze-text", { method: "POST", body: JSON.stringify({ description }), timeoutMs: READER_TIMEOUT_MS }),

  photoStatus: () => request("/api/analyze-photo/status"),

  analyzePhoto: (image) =>
    request("/api/analyze-photo", { method: "POST", body: JSON.stringify({ image }), timeoutMs: READER_TIMEOUT_MS }),

  cuttingPlan: (id, body) =>
    request(`/api/orders/${id}/cutting-plan`, { method: "POST", body: JSON.stringify(body), timeoutMs: PACK_TIMEOUT_MS }),

  getMockup: (id, version) => request(`/api/orders/${id}/mockups/${version}`),

  fabrics: () => request("/api/fabrics"),

  // When the newest backup was taken (Docker), so the app can say when backups stop.
  backupStatus: () => request("/api/backups"),

  // Stores a logo (a PNG data URL) for an embroidery or sablon; answers { id }.
  uploadArtwork: (image) => request("/api/artwork", { method: "POST", body: JSON.stringify({ image }), timeoutMs: 60_000 }),

  fabricColors: () => fetchStatic("/fabric-catalog/colors.json"),
};
