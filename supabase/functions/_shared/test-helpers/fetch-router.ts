/**
 * Tiny fetch interceptor for Deno integration tests.
 *
 * Supabase's JS client, Google OAuth, and Vertex all cross the same boundary:
 * `globalThis.fetch`. Tests install one router and route by full URL/method so
 * same-table PostgREST queries (for example the two `agent_definitions` reads)
 * cannot accidentally share a broad table-prefix mock.
 */

export type MockFetchCall = {
  url: string;
  method: string;
  headers: Headers;
  bodyText: string;
};

export type MockFetchRouteHandler = (
  req: Request,
  call: MockFetchCall,
) => Response | Promise<Response>;

type Route = {
  label: string;
  matches: (req: Request, call: MockFetchCall) => boolean;
  handler: MockFetchRouteHandler;
};

export class MockFetchRouter {
  private readonly routes: Route[] = [];
  private readonly callLedger: MockFetchCall[] = [];
  private originalFetch: typeof globalThis.fetch | null = null;

  route(
    label: string,
    matches: (req: Request, call: MockFetchCall) => boolean,
    handler: MockFetchRouteHandler,
  ): this {
    this.routes.push({ label, matches, handler });
    return this;
  }

  routeMethod(
    method: string,
    urlPattern: RegExp,
    label: string,
    handler: MockFetchRouteHandler,
  ): this {
    const upperMethod = method.toUpperCase();
    return this.route(
      label,
      (_req, call) => call.method === upperMethod && urlPattern.test(call.url),
      handler,
    );
  }

  routeGet(urlPattern: RegExp, label: string, handler: MockFetchRouteHandler): this {
    return this.routeMethod('GET', urlPattern, label, handler);
  }

  routePost(urlPattern: RegExp, label: string, handler: MockFetchRouteHandler): this {
    return this.routeMethod('POST', urlPattern, label, handler);
  }

  install(): this {
    if (this.originalFetch) {
      throw new Error('MockFetchRouter is already installed');
    }
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const call: MockFetchCall = {
        url: req.url,
        method: req.method.toUpperCase(),
        headers: new Headers(req.headers),
        bodyText: await req.clone().text(),
      };
      this.callLedger.push(call);

      for (const route of this.routes) {
        if (route.matches(req, call)) {
          return route.handler(req, call);
        }
      }

      const knownRoutes = this.routes.map((r) => r.label).join(', ');
      throw new Error(
        `MockFetchRouter: no route for ${call.method} ${call.url}` +
          (knownRoutes ? `; registered routes: ${knownRoutes}` : ''),
      );
    };
    return this;
  }

  restore(): void {
    if (!this.originalFetch) return;
    globalThis.fetch = this.originalFetch;
    this.originalFetch = null;
  }

  resetCalls(): void {
    this.callLedger.length = 0;
  }

  calls(): MockFetchCall[] {
    return [...this.callLedger];
  }

  callsMatching(predicate: (call: MockFetchCall) => boolean): MockFetchCall[] {
    return this.callLedger.filter(predicate);
  }
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

export function textResponse(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', ...(headers ?? {}) },
  });
}
