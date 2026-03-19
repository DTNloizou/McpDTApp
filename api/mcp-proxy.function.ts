/**
 * MCP Proxy Function
 *
 * Proxies requests from the Dynatrace AppShell frontend to the remote MCP server.
 * This is needed because the AppShell intercepts all browser fetch() calls,
 * so the UI cannot directly reach external endpoints.
 *
 * The function runs server-side in the Dynatrace JavaScript Runtime,
 * which can make external HTTP calls freely.
 */

interface ProxyPayload {
  /** The full URL to call, e.g. "https://dtroi.whydevslovedynatrace.com/mcp/chat" */
  url: string;
  /** HTTP method */
  method?: 'GET' | 'POST';
  /** Optional request body (for POST) */
  body?: unknown;
  /** Optional Bearer token for the remote server */
  apiKey?: string;
}

export default async function (payload: ProxyPayload) {
  const { url, method = 'GET', body, apiKey } = payload;

  if (!url) {
    return { error: 'url is required' };
  }

  // Only allow HTTPS URLs to prevent SSRF to internal services
  if (!url.startsWith('https://')) {
    return { error: 'Only HTTPS URLs are allowed' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (method === 'POST' && body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  // 55-second timeout — fail before nginx 504 (usually 60s)
  // AbortController may not exist in the Dynatrace JavaScript Runtime
  let timeout: ReturnType<typeof setTimeout> | undefined;
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 55000);
    fetchOptions.signal = controller.signal;
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err: unknown) {
    if (timeout) clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 504, ok: false, data: 'Request timed out after 55 seconds' };
    }
    // Return error details instead of throwing (which causes generic "function failed" in production)
    return { status: 0, ok: false, data: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (timeout) clearTimeout(timeout);

  const responseBody = await res.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  return {
    status: res.status,
    ok: res.ok,
    data: parsed,
  };
}
