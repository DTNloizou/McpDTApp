import { functions } from '@dynatrace-sdk/app-utils';
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
  overrides?: ConnOverrides
): Promise<unknown> {
  const config = loadConfig();
  const serverUrl = overrides?.serverUrl || config.serverUrl;
  const apiKey = overrides?.apiKey ?? config.apiKey;

  if (!serverUrl) throw new Error('No MCP server URL configured');

  const MAX_RETRIES = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 10s, 20s, 40s, 60s
      const wait = Math.min(10000 * Math.pow(2, attempt - 1), 60000);
      await new Promise((r) => setTimeout(r, wait));
    }

    const res = await functions.call('mcp-proxy', {
      data: {
        serverUrl: serverUrl.replace(/\/+$/, ''),
        path,
        method,
        body,
        apiKey: apiKey || undefined,
      },
    });

    const result = await res.json() as { status: number; ok: boolean; data: unknown; error?: string };

    if (result.error) throw new Error(result.error);

    // Retry on 429 rate limit
    if (result.status === 429) {
      lastError = new Error('Rate limited (429) — retrying...');
      if (attempt < MAX_RETRIES) continue;
      throw new Error('Rate limited (429) — max retries exceeded. Please wait a moment and try again.');
    }

    if (!result.ok) {
      const msg = typeof result.data === 'object' && result.data !== null
        ? JSON.stringify(result.data)
        : String(result.data);
      // Also retry on 429 embedded in response body
      if ((result.status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit')) && attempt < MAX_RETRIES) {
        lastError = new Error(`Rate limited: ${msg}`);
        continue;
      }
      throw new Error(`Request failed (${result.status}): ${msg}`);
    }

    return result.data;
  }

  throw lastError || new Error('Request failed after retries');
}

export async function checkHealth(overrides?: ConnOverrides): Promise<HealthStatus> {
  return proxyCall('/mcp/config-status', 'GET', undefined, overrides) as Promise<HealthStatus>;
}

export async function testConnection(overrides?: ConnOverrides): Promise<ConnectionResult> {
  return proxyCall('/mcp/test-connection', 'POST', {}, overrides) as Promise<ConnectionResult>;
}

export async function listTools(overrides?: ConnOverrides): Promise<McpTool[]> {
  const data = await proxyCall('/mcp/tools', 'GET', undefined, overrides) as { tools?: McpTool[] };
  return data.tools || [];
}

export async function sendChat(
  message: string,
  history: { role: string; content: string }[],
  overrides?: ConnOverrides
): Promise<ChatResponse> {
  return proxyCall('/mcp/chat', 'POST', { message, history }, overrides) as Promise<ChatResponse>;
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
  overrides?: ConnOverrides
): Promise<DqlResult> {
  return proxyCall('/mcp/execute-dql', 'POST', { query, recordLimit }, overrides) as Promise<DqlResult>;
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
  overrides?: ConnOverrides
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

  return proxyCall('/mcp/chat', 'POST', { message: prompt, history: [] }, overrides) as Promise<ChatResponse>;
}
