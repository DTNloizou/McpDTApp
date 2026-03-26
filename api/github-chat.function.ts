/**
 * GitHub Models Chat Function
 *
 * Calls the GitHub Models inference API (OpenAI-compatible) from the
 * Dynatrace JavaScript Runtime.  Users authenticate with a GitHub PAT
 * that has Copilot access — no separate AI billing required.
 *
 * Supports any model served by GitHub Models: GPT-4o, Claude, Gemini, etc.
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatPayload {
  githubPat: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

const API_URL = 'https://models.github.ai/inference/chat/completions';

export default async function (payload: ChatPayload) {
  const { githubPat, model, messages, maxTokens = 4096 } = payload;

  if (!githubPat) {
    return { status: 'error', message: 'GitHub PAT is required' };
  }
  if (!model) {
    return { status: 'error', message: 'Model selection is required' };
  }
  if (!messages || messages.length === 0) {
    return { status: 'error', message: 'messages array is required' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${githubPat}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
  };

  // 55-second timeout — fail before nginx 504
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers,
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
      return { status: 'error', message: 'GitHub Models request timed out after 55 seconds' };
    }
    return { status: 'error', message: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (timeout) clearTimeout(timeout);

  const responseBody = await res.text();

  if (!res.ok) {
    return {
      status: 'error',
      message: `GitHub Models API error (${res.status}): ${responseBody.slice(0, 500)}`,
    };
  }

  try {
    const data = JSON.parse(responseBody);
    // OpenAI-compatible response format
    const choice = data.choices?.[0];
    const text = choice?.message?.content || '';

    return {
      status: 'success',
      response: text,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  } catch {
    return { status: 'error', message: 'Failed to parse GitHub Models response' };
  }
}
