// A copy of an order's unsaved changes, kept in this browser while someone
// works, so a crash, a closed laptop or a power cut doesn't lose them: the
// next time the order opens, they're offered back. Browser storage can be
// full, blocked or wiped, so every call is allowed to fail quietly; this is
// a safety net, never where anything is really kept.

const key = (orderId) => `konveksi-draft-${orderId}`;

// The order's own fields a draft keeps. Not the reference photo: it can be
// megabytes, more than browser storage holds, and it's saved with the order
// as soon as it's picked anyway.
export const DRAFT_ORDER_FIELDS = ["customerName", "contactInfo", "garmentType", "designNotes", "fabric", "sizes", "status", "design"];

// What to keep: the order's fields if they changed, the design (parts and
// extras) if it changed, and the order version it was based on.
export function makeDraft({ order, colorHint, design, accessories, orderChanged, designChanged }) {
  const draft = { baseUpdatedAt: order?.updatedAt || null, orderChanged: Boolean(orderChanged), designChanged: Boolean(designChanged) };
  if (orderChanged) {
    draft.order = Object.fromEntries(DRAFT_ORDER_FIELDS.filter((f) => order?.[f] !== undefined).map((f) => [f, order[f]]));
    draft.colorHint = colorHint || null;
  }
  if (designChanged) {
    draft.design = design;
    draft.accessories = accessories;
  }
  return draft;
}

export function saveLocalDraft(orderId, draft, now = Date.now()) {
  try {
    localStorage.setItem(key(orderId), JSON.stringify({ ...draft, savedAt: now }));
    return true;
  } catch {
    return false; // full or blocked: nothing to do but carry on
  }
}

// The kept draft, or null when there is none worth offering.
export function readLocalDraft(orderId) {
  try {
    const d = JSON.parse(localStorage.getItem(key(orderId)) || "null");
    return d && (d.orderChanged || d.designChanged) ? d : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(orderId) {
  try {
    localStorage.removeItem(key(orderId));
  } catch {
    // nothing kept, nothing to clear
  }
}
