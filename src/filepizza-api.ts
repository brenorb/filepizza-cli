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
};

export class FilePizzaApi {
  readonly baseUrl: URL;
  readonly fetchImpl: typeof fetch;

  constructor(options: FilePizzaApiOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? "https://file.pizza/");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  channelUrl(slug: string): string {
    return new URL(`/download/${slug}`, this.baseUrl).toString();
  }

  async getIceConfig(): Promise<IceConfig> {
    const response = await this.fetchImpl(new URL("/api/ice", this.baseUrl), {
      method: "POST",
    });
    return this.parseJsonResponse<IceConfig>(response);
  }

  async createChannel(uploaderPeerID: string): Promise<Channel> {
    const response = await this.fetchImpl(new URL("/api/create", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ uploaderPeerID }),
    });
    return this.parseJsonResponse<Channel>(response);
  }

  async renewChannel(slug: string, secret: string): Promise<boolean> {
    const response = await this.fetchImpl(new URL("/api/renew", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug, secret }),
    });
    const payload = await this.parseJsonResponse<{ success: boolean }>(response);
    return payload.success;
  }

  async destroyChannel(slug: string): Promise<boolean> {
    const response = await this.fetchImpl(new URL("/api/destroy", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug }),
    });
    const payload = await this.parseJsonResponse<{ success: boolean }>(response);
    return payload.success;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`FilePizza API request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
