/**
 * Anthropic Chat Function
 *
 * Calls the Anthropic Messages API from within the Dynatrace JavaScript Runtime.
 * This avoids the AppShell fetch interception and lets the app call Claude
 * directly without an external MCP proxy.
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPayload {
  anthropicApiKey: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export default async function (payload: ChatPayload) {
  const { anthropicApiKey, messages, systemPrompt, maxTokens = 4096 } = payload;

  if (!anthropicApiKey) {
    return { status: 'error', message: 'Anthropic API key is required' };
  }
  if (!messages || messages.length === 0) {
    return { status: 'error', message: 'messages array is required' };
  }

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  // 55-second timeout — fail before nginx 504
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  };

  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 55000);
    fetchOptions.signal = controller.signal;
  }

  let res: Response;
  try {
    res = await fetch(API_URL, fetchOptions);
  } catch (err: unknown) {
    if (timeout) clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'error', message: 'Claude request timed out after 55 seconds' };
    }
    return { status: 'error', message: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (timeout) clearTimeout(timeout);

  const responseBody = await res.text();

  if (!res.ok) {
    return {
      status: 'error',
      message: `Anthropic API error (${res.status}): ${responseBody.slice(0, 500)}`,
    };
  }

  try {
    const data = JSON.parse(responseBody);
    // Extract text from the response content blocks
    const text = (data.content || [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('\n');

    return {
      status: 'success',
      response: text,
      usage: data.usage ? {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      } : undefined,
    };
  } catch {
    return { status: 'error', message: 'Failed to parse Anthropic response' };
  }
}
