/**
 * Davis CoPilot Proxy Function
 *
 * Calls the Dynatrace Davis CoPilot completions API from within the
 * Dynatrace JavaScript Runtime.  This avoids the AppShell fetch
 * interception and lets the app use Davis Assist natively.
 */

interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CopilotPayload {
  messages: CopilotMessage[];
}

export default async function (payload: CopilotPayload) {
  const { messages } = payload;

  if (!messages || messages.length === 0) {
    return { status: 'error', message: 'messages array is required' };
  }

  // 55-second timeout — fail before nginx 504
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  };

  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 55000);
    fetchOptions.signal = controller.signal;
  }

  let res: Response;
  try {
    // Platform API — the Dynatrace JS Runtime authenticates automatically
    // when calling APIs on the same tenant via relative URL.
    res = await fetch('/platform/davis/copilot/v0.2/completions', fetchOptions);
  } catch (err: unknown) {
    if (timeout) clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'error', message: 'Davis CoPilot request timed out after 55 seconds' };
    }
    return { status: 'error', message: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (timeout) clearTimeout(timeout);

  const responseBody = await res.text();

  if (!res.ok) {
    return {
      status: 'error',
      message: `Davis CoPilot error (${res.status}): ${responseBody.slice(0, 500)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  return { status: 'success', data: parsed };
}
