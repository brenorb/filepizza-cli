import { describe, expect, it, vi } from "vitest";
import { FilePizzaApi } from "../src/filepizza-api.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("FilePizzaApi", () => {
  it("builds public share URLs from slugs", () => {
    const api = new FilePizzaApi();

    expect(api.channelUrl("pepperoni")).toBe("https://file.pizza/download/pepperoni");
  });

  it("creates channels against the hosted FilePizza API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        secret: "secret-1",
        longSlug: "basil/olive",
        shortSlug: "abcd1234",
        uploaderPeerID: "peer-1",
      }),
    );
    const api = new FilePizzaApi({ fetchImpl });

    const channel = await api.createChannel("peer-1");

    expect(channel.shortSlug).toBe("abcd1234");
    expect(channel.longSlug).toBe("basil/olive");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://file.pizza/api/create"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ uploaderPeerID: "peer-1" }),
      }),
    );
  });

  it("surfaces API failures with the response status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 500));
    const api = new FilePizzaApi({ fetchImpl });

    await expect(api.getIceConfig()).rejects.toThrow("status 500");
  });
});


describe("bounded API requests", () => {
  it.each(["headers", "body"])("times out stalled %s and aborts the underlying request", async (phase) => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const response = jsonResponse({});
      vi.spyOn(response, "json").mockImplementation(() => new Promise(() => {}));
      const fetchImpl = vi.fn((_url, init) => {
        signal = init?.signal as AbortSignal;
        return phase === "headers" ? new Promise<Response>(() => {}) : Promise.resolve(response);
      }) as typeof fetch;
      const failure = vi.fn();
      const pending = new FilePizzaApi({ fetchImpl, timeoutMs: 10 }).getIceConfig().catch(failure);
      await vi.advanceTimersByTimeAsync(11);
      expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("timed out") }));
      expect(signal?.aborted).toBe(true);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("supports external cancellation even if a fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const failure = vi.fn();
      const pending = new FilePizzaApi({ fetchImpl, timeoutMs: 1000 }).getIceConfig(controller.signal).catch(failure);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(failure).toHaveBeenCalledWith(expect.objectContaining({ name: "AbortError" }));
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("does not start a request for an already cancelled operation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(new FilePizzaApi({ fetchImpl }).getIceConfig(controller.signal)).rejects.toHaveProperty("name", "AbortError");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e300])("rejects unsafe timeout %s", (timeoutMs) => {
    expect(() => new FilePizzaApi({ timeoutMs })).toThrow("timeoutMs");
  });

  it("does not echo malformed response bodies in errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("PRIVATE_RESPONSE_PAYLOAD"));
    await expect(new FilePizzaApi({ fetchImpl }).getIceConfig()).rejects.toThrow("invalid JSON");
  });
});
