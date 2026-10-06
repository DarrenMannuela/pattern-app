import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalDraft, makeDraft, readLocalDraft, saveLocalDraft } from "../localDraft.js";

// A tiny stand-in for the browser's storage.
function fakeStorage({ full = false } = {}) {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => {
      if (full) throw new DOMException("quota", "QuotaExceededError");
      items.set(k, String(v));
    },
    removeItem: (k) => items.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

const order = { id: "7", customerName: "SDN 1", sizes: [{ label: "L", quantity: 20 }], designImage: "data:image/jpeg;base64,AAAA", updatedAt: "2026-10-05T10:00:00Z" };

describe("local drafts", () => {
  it("keeps unsaved changes and gives them back", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const draft = makeDraft({ order, colorHint: { main: "#123456" }, design: { sleeveStyle: "full" }, accessories: [{ id: "a" }], orderChanged: true, designChanged: true });
    expect(saveLocalDraft("7", draft, 1000)).toBe(true);
    const back = readLocalDraft("7");
    expect(back.order.customerName).toBe("SDN 1");
    expect(back.order.designImage).toBeUndefined(); // the photo is left out: it can be megabytes
    expect(back.design).toEqual({ sleeveStyle: "full" });
    expect(back.baseUpdatedAt).toBe(order.updatedAt);
    expect(back.savedAt).toBe(1000);
    clearLocalDraft("7");
    expect(readLocalDraft("7")).toBeNull();
  });

  it("keeps only what changed", () => {
    const d = makeDraft({ order, design: { a: 1 }, accessories: [], orderChanged: false, designChanged: true });
    expect(d.order).toBeUndefined();
    expect(d.design).toEqual({ a: 1 });
  });

  it("offers nothing when nothing changed", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveLocalDraft("7", makeDraft({ order, orderChanged: false, designChanged: false }));
    expect(readLocalDraft("7")).toBeNull();
  });

  it("carries on quietly when storage is full or broken", () => {
    vi.stubGlobal("localStorage", fakeStorage({ full: true }));
    expect(saveLocalDraft("7", makeDraft({ order, orderChanged: true }))).toBe(false);
    vi.stubGlobal("localStorage", { getItem: () => "{not json", setItem() {}, removeItem() {} });
    expect(readLocalDraft("7")).toBeNull();
    vi.stubGlobal("localStorage", undefined);
    expect(() => clearLocalDraft("7")).not.toThrow();
    expect(readLocalDraft("7")).toBeNull();
  });
});
