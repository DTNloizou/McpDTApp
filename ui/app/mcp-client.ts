import { functions } from '@dynatrace-sdk/app-utils';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';
import { loadConfig } from './config';

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: string;
}

export interface ChatResponse {
  status: string;
  response: string;
  toolCalls?: ToolCall[];
  usage?: { input_tokens: number; output_tokens: number };
  message?: string;
}

export interface McpTool {
  name: string;
  description: string;
}

export interface HealthStatus {
  status: string;
  dynatraceConnected: boolean;
  environment: string;
  anthropicConfigured: boolean;
  activeSessions: number;
  availableTools: string[];
}

export interface ConnectionResult {
  status: string;
  message: string;
  environment?: string;
  mcpConnected?: boolean;
  anthropicConnected?: boolean;
  tools?: McpTool[];
}

interface ConnOverrides {
  serverUrl?: string;
  apiKey?: string;
}

/**
 * Call the remote MCP server via the mcp-proxy app function.
 * This avoids the AppShell fetch interception that causes 401s.
 */
async function proxyCall(
  path: string,
  method: 'GET' | 'POST',
  body: unknown | undefined,
  overrides?: ConnOverrides,
  maxRetries?: number
): Promise<unknown> {
  const config = loadConfig();
  const serverUrl = overrides?.serverUrl || config.serverUrl;
  const apiKey = overrides?.apiKey ?? config.apiKey;

  if (!serverUrl) throw new Error('No MCP server URL configured');

  const MAX_RETRIES = maxRetries ?? 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 10s, 20s, 40s, 60s
      const wait = Math.min(10000 * Math.pow(2, attempt - 1), 60000);
      await new Promise((r) => setTimeout(r, wait));
    }

    const res = await functions.call('mcp-proxy', {
      data: {
        url: `${serverUrl.replace(/\/+$/, '')}${path}`,
        method,
        body,
        apiKey: apiKey || undefined,
      },
    });

    const result = await res.json() as { status: number; ok: boolean; data: unknown; error?: string };

    if (result.error) throw new Error(result.error);

    // Retry on 429 rate limit or 504 gateway timeout
    if (result.status === 429 || result.status === 504) {
      lastError = new Error(result.status === 504
        ? 'Gateway timeout (504) — retrying...'
        : 'Rate limited (429) — retrying...');
      if (attempt < MAX_RETRIES) continue;
      throw new Error(`Request failed (${result.status}) — max retries exceeded. Please wait a moment and try again.`);
    }

    if (!result.ok) {
      const msg = typeof result.data === 'object' && result.data !== null
        ? JSON.stringify(result.data)
        : String(result.data);
      // Also retry on 429/504 embedded in response body
      const retryable = result.status === 429 || result.status === 504
        || msg.includes('429') || msg.includes('504')
        || msg.toLowerCase().includes('rate limit')
        || msg.toLowerCase().includes('gateway time');
      if (retryable && attempt < MAX_RETRIES) {
        lastError = new Error(`Retryable error: ${msg}`);
        continue;
      }
      throw new Error(`Request failed (${result.status}): ${msg}`);
    }

    return result.data;
  }

  throw lastError || new Error('Request failed after retries');
}

export async function checkHealth(overrides?: ConnOverrides): Promise<HealthStatus> {
  return proxyCall('/config-status', 'GET', undefined, overrides) as Promise<HealthStatus>;
}

export async function testConnection(overrides?: ConnOverrides): Promise<ConnectionResult> {
  return proxyCall('/test-connection', 'POST', {}, overrides) as Promise<ConnectionResult>;
}

export async function listTools(overrides?: ConnOverrides): Promise<McpTool[]> {
  const data = await proxyCall('/tools', 'GET', undefined, overrides) as { tools?: McpTool[] };
  return data.tools || [];
}

export async function sendChat(
  message: string,
  history: { role: string; content: string }[],
  overrides?: ConnOverrides,
  documents?: { file_id: string; title: string }[]
): Promise<ChatResponse> {
  const payload: Record<string, unknown> = { message, history };

  // If documents have been synced to Anthropic, pass their file references
  // so the MCP server can include them as document content blocks.
  if (documents && documents.length > 0) {
    payload.documents = documents;
  }

  return proxyCall('/chat', 'POST', payload, overrides) as Promise<ChatResponse>;
}

export interface DqlResult {
  status: string;
  result?: { content?: { text?: string; type?: string }[] };
  message?: string;
  stats?: { gbScanned?: number; recordsReturned?: number };
}

export async function executeDql(
  query: string,
  recordLimit = 100,
  _overrides?: ConnOverrides
): Promise<DqlResult> {
  try {
    const response = await queryExecutionClient.queryExecute({
      body: {
        query,
        maxResultRecords: recordLimit,
        requestTimeoutMilliseconds: 30000,
      },
    });

    // Poll if needed
    let result = response;
    while (result.state === 'RUNNING' || result.state === 'NOT_STARTED') {
      if (!result.requestToken) break;
      await new Promise((r) => setTimeout(r, 1000));
      result = await queryExecutionClient.queryPoll({
        requestToken: result.requestToken,
        requestTimeoutMilliseconds: 10000,
      });
    }

    if (result.state === 'FAILED') {
      return { status: 'error', message: 'DQL query failed' };
    }

    const records = result.result?.records || [];
    // Convert records to JSON text (same format consumers expect)
    const text = records.length > 0
      ? JSON.stringify(records, null, 2)
      : 'No records returned';

    return {
      status: 'success',
      result: { content: [{ text, type: 'text' }] },
      stats: { recordsReturned: records.length },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown DQL error';
    return { status: 'error', message: msg };
  }
}

/**
 * Get AI-powered recommendations based on query results.
 * Uses the MCP chat endpoint (Claude + Dynatrace MCP tools) to analyse
 * the results and provide actionable recommendations.
 */
export async function getRecommendations(
  queryLabel: string,
  queryDql: string,
  queryResults: string,
  kbContext?: string,
  overrides?: ConnOverrides,
  documents?: { file_id: string; title: string }[]
): Promise<ChatResponse> {
  // Cap results to avoid 504 timeouts on long payloads
  const trimmedResults = queryResults.length > 8000
    ? queryResults.slice(0, 8000) + '\n\n… (results truncated for brevity)'
    : queryResults;

  const prompt = [
    ...(kbContext ? [kbContext, ''] : []),
    `You are a Dynatrace SRE expert. Analyse the following query results and provide actionable recommendations.`,
    `Do NOT call any tools — just analyse the data provided below.`,
    ...(kbContext ? [`If reference documents were provided above, use them to inform your recommendations (e.g. runbooks, architecture decisions, SLAs).`] : []),
    ...(documents && documents.length > 0 ? [`Reference documents are attached as file references — use them for context.`] : []),
    ``,
    `**Query:** ${queryLabel}`,
    `**DQL:** \`${queryDql}\``,
    `**Results:**`,
    trimmedResults,
    ``,
    `Provide:`,
    `1. **Summary** — brief interpretation of the results`,
    `2. **Key Findings** — highlight anything concerning or noteworthy`,
    `3. **Recommendations** — specific, actionable steps to resolve issues or improve the situation`,
    `4. **Related Areas to Investigate** — suggest follow-up DQL queries or areas to look at`,
    ``,
    `Be concise and practical. Use bullet points. If the results look healthy, say so.`,
  ].join('\n');

  const payload: Record<string, unknown> = { message: prompt, history: [] };
  if (documents && documents.length > 0) {
    payload.documents = documents;
  }

  return proxyCall('/chat', 'POST', payload, overrides) as Promise<ChatResponse>;
}
