export type Channel = {
  secret?: string;
  longSlug: string;
  shortSlug: string;
  uploaderPeerID: string;
};

export type IceConfig = {
  host: string;
  path: string;
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
};

export type FilePizzaApiOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class FilePizzaApi {
  readonly baseUrl: URL;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;

  constructor(options: FilePizzaApiOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? "https://file.pizza/");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
      throw new Error("timeoutMs must be positive and at most 2147483647 milliseconds");
    }
  }

  channelUrl(slug: string): string {
    return new URL(`/download/${slug}`, this.baseUrl).toString();
  }

  async getIceConfig(signal?: AbortSignal): Promise<IceConfig> {
    return this.request<IceConfig>("/api/ice", undefined, signal);
  }

  async createChannel(uploaderPeerID: string, signal?: AbortSignal): Promise<Channel> {
    return this.request<Channel>("/api/create", { uploaderPeerID }, signal);
  }

  async renewChannel(slug: string, secret: string, signal?: AbortSignal): Promise<boolean> {
    const payload = await this.request<{ success: boolean }>("/api/renew", { slug, secret }, signal);
    return payload.success;
  }

  async destroyChannel(slug: string, signal?: AbortSignal): Promise<boolean> {
    const payload = await this.request<{ success: boolean }>("/api/destroy", { slug }, signal);
    return payload.success;
  }

  private async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new DOMException("FilePizza API request cancelled", "AbortError");
    const controller = new AbortController();
    let rejectCancellation!: (error: Error) => void;
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = () => {
      const error = new DOMException("FilePizza API request cancelled", "AbortError");
      rejectCancellation(error);
      controller.abort(error);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      const error = new Error(`FilePizza API request timed out after ${this.timeoutMs}ms; check your connection and retry`);
      rejectCancellation(error);
      controller.abort(error);
    }, this.timeoutMs);

    // Bound the whole operation, including body consumption. Promise.race also
    // keeps custom fetch adapters that ignore AbortSignal from hanging callers.
    const operation = async (): Promise<T> => {
      const response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method: "POST",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`FilePizza API request failed with status ${response.status}`);
      try {
        return await response.json() as T;
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("FilePizza API returned invalid JSON; retry or report the server response format");
        throw error;
      }
    };
    try {
      return await Promise.race([operation(), cancellation]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      controller.abort();
    }
  }
}
