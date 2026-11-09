/**
 * Browser stand-in for `@tauri-apps/plugin-http`. Requests go through window
 * fetch, so AI/Ollama endpoints must allow CORS when running in a browser.
 */
export async function fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return window.fetch(input, init);
}

export interface ClientOptions {
  connectTimeout?: number;
  maxRedirections?: number;
  danger?: { acceptInvalidCerts?: boolean };
}

export class Client {
  constructor(_options: ClientOptions = {}) {}

  async request(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return window.fetch(input, init);
  }

  async get(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.request(input, { ...init, method: "GET" });
  }

  async post(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.request(input, { ...init, method: "POST" });
  }
}
