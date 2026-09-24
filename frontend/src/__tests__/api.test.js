import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api.js";

const reply = (body, init = {}) => new Response(body, init);

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api request handling", () => {
  it("returns parsed JSON", async () => {
    stubFetch(async () => reply(JSON.stringify([{ id: "1" }])));
    expect(await api.listOrders()).toEqual([{ id: "1" }]);
  });

  it("returns null for 204", async () => {
    stubFetch(async () => reply(null, { status: 204 }));
    expect(await api.deleteOrder("1")).toBeNull();
  });

  it("uses the backend's plain-text message", async () => {
    stubFetch(async () => reply("customerName and garmentType are required", { status: 400 }));
    const err = await api.createOrder({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("customerName and garmentType are required");
  });

  it("reads a message out of a JSON error body", async () => {
    stubFetch(async () => reply(JSON.stringify({ error: "nope" }), { status: 422 }));
    await expect(api.listOrders()).rejects.toThrow("nope");
  });

  it("never shows an HTML error page", async () => {
    stubFetch(async () => reply("<html><body>Bad gateway</body></html>", { status: 502 }));
    const err = await api.listOrders().catch((e) => e);
    expect(err.message).not.toContain("<");
    expect(err.message).toMatch(/server ran into a problem/i);
  });

  it("explains a missing thing when the body is empty", async () => {
    stubFetch(async () => reply("", { status: 404 }));
    await expect(api.getOrder("9")).rejects.toThrow(/wasn't found/i);
  });

  it("says the backend is unreachable when the network fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await api.listOrders().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/can't reach the server/i);
  });

  it("times out instead of waiting forever", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const pending = api.listOrders().catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).message).toMatch(/took too long/i);
  });

  it("gives the photo reader far longer than an ordinary call", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    let settled = false;
    const pending = api.analyzePhoto("data:image/png;base64,AAAA").catch((e) => e).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect((await pending).message).toMatch(/took too long/i);
  });

  it("reports an answer that isn't JSON", async () => {
    stubFetch(async () => reply("not json", { status: 200 }));
    await expect(api.listOrders()).rejects.toThrow(/couldn't read/i);
  });
});

describe("static files", () => {
  it("loads the fabric colour list", async () => {
    const fn = stubFetch(async () => reply(JSON.stringify({ a: ["#fff"] })));
    expect(await api.fabricColors()).toEqual({ a: ["#fff"] });
    expect(fn).toHaveBeenCalledWith("/fabric-catalog/colors.json");
  });

  it("fails clearly when the file is missing or broken", async () => {
    stubFetch(async () => reply("<!doctype html>", { status: 200 }));
    await expect(api.fabricColors()).rejects.toThrow(/expected format/i);
    stubFetch(async () => reply("", { status: 404 }));
    await expect(api.fabricColors()).rejects.toThrow(/couldn't load/i);
  });
});
