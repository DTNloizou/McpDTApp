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
  /** The remote MCP server base URL, e.g. "https://dtroi.whydevslovedynatrace.com" */
  serverUrl: string;
  /** The path to call on the remote server, e.g. "/mcp/test-connection" */
  path: string;
  /** HTTP method */
  method?: 'GET' | 'POST';
  /** Optional request body (for POST) */
  body?: unknown;
  /** Optional Bearer token for the remote server */
  apiKey?: string;
}

export default async function (payload: ProxyPayload) {
  const { serverUrl, path, method = 'GET', body, apiKey } = payload;

  if (!serverUrl || !path) {
    return { error: 'serverUrl and path are required' };
  }

  // Validate the path starts with /mcp/ or /health to prevent open proxy
  const allowedPrefixes = ['/mcp/', '/health'];
  if (!allowedPrefixes.some((p) => path === p || path.startsWith(p))) {
    return { error: 'Only /mcp/* and /health paths are allowed' };
  }

  const url = `${serverUrl.replace(/\/+$/, '')}${path}`;

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

  const res = await fetch(url, fetchOptions);
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
