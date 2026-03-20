/**
 * Anthropic Chat Function
 *
 * Calls the Anthropic Messages API from within the Dynatrace JavaScript Runtime.
 * This avoids the AppShell fetch interception and lets the app call Claude
 * directly without an external MCP proxy.
 *
 * Supports file references: if `documents` is provided, the first user message
 * is augmented with document content blocks referencing Anthropic file_ids.
 */

interface ContentBlock {
  type: 'text' | 'document';
  text?: string;
  source?: { type: 'file'; file_id: string };
  title?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface DocumentRef {
  file_id: string;
  title: string;
}

interface ChatPayload {
  anthropicApiKey: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  /** Anthropic file_ids to include as document blocks in the first user message */
  documents?: DocumentRef[];
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const FILES_BETA = 'files-api-2025-04-14';

export default async function (payload: ChatPayload) {
  const { anthropicApiKey, messages, systemPrompt, maxTokens = 4096, documents } = payload;

  if (!anthropicApiKey) {
    return { status: 'error', message: 'Anthropic API key is required' };
  }
  if (!messages || messages.length === 0) {
    return { status: 'error', message: 'messages array is required' };
  }

  // If documents are provided, convert the first user message to content blocks
  // so file_ids are attached as document references per the Anthropic schema.
  const apiMessages: ChatMessage[] = messages.map((msg, idx) => {
    if (idx === 0 && msg.role === 'user' && documents && documents.length > 0) {
      const blocks: ContentBlock[] = [
        { type: 'text', text: typeof msg.content === 'string' ? msg.content : '' },
        ...documents.map((doc) => ({
          type: 'document' as const,
          source: { type: 'file' as const, file_id: doc.file_id },
          title: doc.title,
        })),
      ];
      return { role: msg.role, content: blocks };
    }
    return msg;
  });

  // Build request headers — include files beta header if documents are attached
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': anthropicApiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (documents && documents.length > 0) {
    headers['anthropic-beta'] = FILES_BETA;
  }

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: apiMessages,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

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
