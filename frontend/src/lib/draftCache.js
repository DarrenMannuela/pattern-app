// The drafts the design preview has fetched, by request. Going back to an
// earlier choice redraws at once, and a tile under the pointer is drafted
// before it is clicked, so the click itself has nothing to wait for.

import { api } from "../api.js";

const drafts = new Map(); // key -> { pieces, summaries }
const inFlight = new Map(); // key -> Promise
const LIMIT = 150;

// The key of a draft: the order and exactly what is sent to be drafted.
export function draftKey(orderId, payload) {
  return `${orderId}|${JSON.stringify(payload)}`;
}

// What a key asks to be drafted.
export function payloadOf(key) {
  return JSON.parse(key.slice(key.indexOf("|") + 1));
}

export function cachedDraft(key) {
  return (key && drafts.get(key)) || null;
}

// Drafts the request behind key (once, however often it is asked for).
export function fetchDraft(key, orderId) {
  if (drafts.has(key)) return Promise.resolve(drafts.get(key));
  if (inFlight.has(key)) return inFlight.get(key);
  const p = api
    .previewPieces(orderId, payloadOf(key))
    .then((res) => {
      drafts.set(key, res);
      // The oldest drafts go first once there are many.
      while (drafts.size > LIMIT) drafts.delete(drafts.keys().next().value);
      return res;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// How a draft is drawn, from what was sent: the drawing must match the
// pieces it shows, so these come with the draft, never from the live choices.
export function lookOf(payload) {
  return {
    gender: payload.gender,
    dartPosition: payload.dartPosition,
    sleeveStyle: payload.sleeveStyle,
    collarStyle: payload.collarStyle,
    pattern: payload.pattern || "solid",
    merchItem: payload.merch?.item,
  };
}

// The part of the extras that changes the drafted pieces: a pocket's kind,
// place, shape, size and fabric. Where an extra sits, its angle, and anything
// about a print don't change a piece, so moving, turning or restyling one
// redraws straight away with no new draft.
export function draftedExtras(accessories = []) {
  return accessories
    .filter((a) => a.type === "pocket")
    .map(({ id, type, segment, shape, width, height, fabric, view }) => ({ id, type, segment, shape, width, height, fabric, view }));
}
