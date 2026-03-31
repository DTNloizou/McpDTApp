/**
 * Davis CoPilot Proxy Function
 *
 * Calls the Dynatrace Davis CoPilot recommender conversation API from
 * within the Dynatrace JavaScript Runtime.  This runs with the app's
 * identity so any user of the app inherits the app's scopes.
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

  // Extract the last user message as the main text
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) {
    return { status: 'error', message: 'No user message found' };
  }

  // Build supplementary context from conversation history
  const context: { type: string; value: string }[] = [];
  const historyMessages = messages.slice(0, -1);
  if (historyMessages.length > 0) {
    const historyText = historyMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');
    context.push({ type: 'supplementary', value: historyText });
  }

  // Davis API limits text to 10,000 chars — move overflow into supplementary context
  const MAX_TEXT = 10000;
  let mainText = lastUserMsg.content;
  if (mainText.length > MAX_TEXT) {
    context.push({ type: 'supplementary', value: mainText });
    mainText = mainText.slice(0, MAX_TEXT - 50) + '\n\n(Full details in context)';
  }

  const body: Record<string, unknown> = { text: mainText };
  if (context.length > 0) {
    body.context = context;
  }

  // 55-second timeout — fail before nginx 504
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
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
    res = await fetch('/platform/davis/copilot/v1/skills/conversations:message', fetchOptions);
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return { status: 'success', response: responseBody };
  }

  // Check for FAILED status from Davis
  if (parsed.status === 'FAILED') {
    return { status: 'error', message: (parsed.text as string) || 'Davis CoPilot request failed' };
  }

  return { status: 'success', response: (parsed.text as string) || '' };
}
