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
