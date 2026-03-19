import { functions } from '@dynatrace-sdk/app-utils';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';
import { publicClient as davisCopilotClient } from '@dynatrace-sdk/client-davis-copilot';
import type { ConversationResponse } from '@dynatrace-sdk/client-davis-copilot';
import { documentsClient } from '@dynatrace-sdk/client-document';
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

/**
 * Call Davis CoPilot via the official SDK.
 * Uses the recommenderConversation endpoint (non-streaming).
 */
async function davisChat(
  messages: { role: string; content: string }[]
): Promise<ChatResponse> {
  // Build the text from the last user message;
  // include history as supplementary context
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) {
    return { status: 'error', response: '', message: 'No user message provided' };
  }

  const context: { type: 'supplementary' | 'instruction'; value: string }[] = [];

  // Include conversation history as supplementary context
  const historyMessages = messages.slice(0, -1);
  if (historyMessages.length > 0) {
    const historyText = historyMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');
    context.push({ type: 'supplementary', value: historyText });
  }

  try {
    const result = await davisCopilotClient.recommenderConversation({
      body: {
        text: lastUserMsg.content,
        ...(context.length > 0 ? { context } : {}),
      },
    });

    // Non-streaming mode returns ConversationResponse
    const conv = result as ConversationResponse;
    if (conv.status === 'FAILED') {
      return { status: 'error', response: '', message: conv.text || 'Davis CoPilot request failed' };
    }

    return { status: 'success', response: conv.text || '' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown Davis CoPilot error';
    return { status: 'error', response: '', message: msg };
  }
}

/**
 * Test Davis CoPilot connectivity by listing available skills.
 */
export async function testDavisConnection(): Promise<ConnectionResult> {
  try {
    const skills = await davisCopilotClient.listAvailableSkills();
    return {
      status: 'success',
      message: 'Connected',
      environment: `Dynatrace Assist (${Array.isArray(skills) ? skills.length : 0} skills available)`,
    };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function sendChat(
  message: string,
  history: { role: string; content: string }[],
  overrides?: ConnOverrides,
  documents?: { file_id: string; title: string }[]
): Promise<ChatResponse> {
  const config = loadConfig();

  // Route to Davis CoPilot when in dynatrace-assist mode
  if (config.aiMode === 'dynatrace-assist') {
    const messages: { role: string; content: string }[] = [
      ...history,
      { role: 'user', content: message },
    ];
    return davisChat(messages);
  }

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
    `4. **Related Areas to Investigate** — suggest follow-up DQL queries to drill deeper`,
    ``,
    `IMPORTANT: When suggesting DQL queries, ALWAYS format them inside \`\`\`dql code blocks so they can be executed automatically.`,
    `DQL SYNTAX RULES (Dynatrace Query Language is NOT SQL):`,
    `- Group-by uses curly braces: summarize count(), by:{fieldName}  — NOT "summarize count() by fieldName"`,
    `- Multiple group-by fields: summarize count(), by:{field1, field2}`,
    `- Time bucketing: summarize count(), by:{time = bin(timestamp, 1h)}  — ALWAYS alias bin() so the field has a name`,
    `- WRONG: by:{bin(timestamp, 1h)} — this drops the timestamp field name and breaks sort/references`,
    `- Mixed: summarize total = count(), errors = countIf(status == "ERROR"), by:{serviceName, time = bin(timestamp, 1h)}`,
    `- Sorting: sort fieldName desc`,
    `- Math: round(value, decimals:2)  — NOT round(value, 2)`,
    `- Multiplication must use explicit *: (a / b) * 100 — NOT (a / b) 100`,
    `- contains() is a FUNCTION not an operator: contains(fieldName, "value") — NOT fieldName contains "value"`,
    `- toDouble() for arithmetic on string fields`,
    ``,
    `Example:`,
    '```dql',
    'fetch bizevents, from:now()-7d | filter contains(event.provider, "payment") | summarize count(), by:{time = bin(timestamp, 1h)} | sort time',
    '```',
    ``,
    `Be concise and practical. Use bullet points. If the results look healthy, say so.`,
  ].join('\n');

  const config = loadConfig();

  // Route to Davis CoPilot when in dynatrace-assist mode
  if (config.aiMode === 'dynatrace-assist') {
    return davisChat([{ role: 'user', content: prompt }]);
  }

  const payload: Record<string, unknown> = { message: prompt, history: [] };
  if (documents && documents.length > 0) {
    payload.documents = documents;
  }

  return proxyCall('/chat', 'POST', payload, overrides) as Promise<ChatResponse>;
}

/**
 * Ask Claude to repair a broken DQL query using the parse error message.
 * Returns the corrected query string, or null if repair isn't possible.
 */
export async function repairDqlWithClaude(brokenDql: string, errorMsg: string): Promise<string | null> {
  const config = loadConfig();
  if (!config.claudeEnabled || !config.claudeApiKey) return null;
  try {
    const res = await functions.call('anthropic-chat', {
      data: {
        anthropicApiKey: config.claudeApiKey,
        messages: [{ role: 'user' as const, content: [
          `This DQL query failed with a parse error. Fix it and return ONLY the corrected DQL query, nothing else — no explanation, no markdown, just the raw query.`,
          ``,
          `**Broken query:**`,
          brokenDql,
          ``,
          `**Error:**`,
          errorMsg.slice(0, 500),
          ``,
          `DQL RULES:`,
            `- contains() is a FUNCTION: contains(fieldName, "value") — NOT fieldName contains "value"`,
          `- Group-by: summarize count(), by:{fieldName}`,
          `- Time bucketing: summarize count(), by:{time = bin(timestamp, 1h)} — ALWAYS alias bin()`,
          `- Math: round(value, decimals:2) — NOT round(value, 2)`,
          `- Multiplication needs explicit *: (a / b) * 100 — NOT (a / b) 100`,
          `- sort by alias name when using bin(): sort time — NOT sort timestamp`,
          `- Use toDouble() for string-to-number conversions`,
        ].join('\n') }],
        systemPrompt: 'You are a Dynatrace DQL syntax expert. Return ONLY the corrected DQL query, no explanation.',
        maxTokens: 1024,
      },
    });
    const result = await res.json() as { status: string; response?: string };
    if (result.status === 'success' && result.response) {
      let repaired = result.response.trim();
      repaired = repaired.replace(/^```(?:dql|sql)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      if (repaired.startsWith('fetch ') || repaired.startsWith('timeseries ')) {
        return repaired;
      }
    }
  } catch { /* repair is best-effort */ }
  return null;
}

/**
 * Ask Claude directly (via in-app serverless function) with Davis CoPilot context.
 * Flow: Davis analyses first → Claude gets Davis context + raw data → deep analysis.
 * No external MCP proxy needed.
 */
export async function getClaudeRecommendations(
  queryLabel: string,
  queryDql: string,
  queryResults: string,
  kbContext?: string,
): Promise<ChatResponse> {
  const config = loadConfig();
  const anthropicApiKey = config.claudeApiKey;

  if (!anthropicApiKey) {
    return { status: 'error', response: '', message: 'Anthropic API key not configured. Enable Claude in Settings and add your API key.' };
  }

  const trimmedResults = queryResults.length > 8000
    ? queryResults.slice(0, 8000) + '\n\n… (results truncated for brevity)'
    : queryResults;

  // Step 1: Get Davis CoPilot context
  let davisContext = '';
  try {
    const davisPrompt = [
      `Analyse the following Dynatrace query results and provide context about the environment, related problems, and any relevant observations.`,
      ``,
      `**Query:** ${queryLabel}`,
      `**DQL:** \`${queryDql}\``,
      `**Results:**`,
      trimmedResults,
    ].join('\n');

    const davisResult = await davisChat([{ role: 'user', content: davisPrompt }]);
    if (davisResult.status === 'success' && davisResult.response) {
      davisContext = davisResult.response;
    }
  } catch {
    // Davis context is optional — continue without it
  }

  // Step 2: Send to Claude with Davis context
  const systemPrompt = [
    `You are a Dynatrace SRE expert. You have been given query results from Dynatrace and contextual analysis from Davis CoPilot (Dynatrace's built-in AI).`,
    `Provide a deep, actionable analysis that builds on Davis's insights.`,
    ...(kbContext ? [
      ``,
      `IMPORTANT: The user has provided reference documents below. Study them carefully for:`,
      `- DQL query syntax and patterns (use these as templates for any queries you suggest)`,
      `- Architecture, runbooks, SLAs, and domain-specific context`,
      `- Entity names, service IDs, and field names used in this environment`,
      ``,
      `When suggesting DQL queries, match the syntax patterns found in these documents exactly.`,
      ``,
      kbContext,
    ] : []),
  ].join('\n');

  const userMessage = [
    `**Query:** ${queryLabel}`,
    `**DQL:** \`${queryDql}\``,
    ``,
    `**Query Results:**`,
    trimmedResults,
    ...(davisContext ? [
      ``,
      `---`,
      `**Davis CoPilot Analysis (Dynatrace-native context):**`,
      davisContext,
      `---`,
    ] : []),
    ``,
    `Based on the query results${davisContext ? ' and Davis CoPilot analysis' : ''}, provide:`,
    `1. **Summary** — interpretation enriched with the Davis context`,
    `2. **Key Findings** — anything concerning or noteworthy`,
    `3. **Recommendations** — specific, actionable steps`,
    `4. **Follow-up Queries** — additional DQL queries to drill deeper, formatted in \`\`\`dql code blocks`,
    ``,
    `DQL SYNTAX RULES (Dynatrace Query Language is NOT SQL):`,
    `- Group-by uses curly braces: summarize count(), by:{fieldName}  — NOT "summarize count() by fieldName"`,
    `- Multiple group-by fields: summarize count(), by:{field1, field2}`,
    `- Time bucketing: summarize count(), by:{time = bin(timestamp, 1h)}  — ALWAYS alias bin() so the field has a name`,
    `- WRONG: by:{bin(timestamp, 1h)} — this drops the timestamp field name and breaks sort/references`,
    `- Mixed: summarize total = count(), errors = countIf(status == "ERROR"), by:{serviceName, time = bin(timestamp, 1h)}`,
    `- When using bin(), sort by the alias: sort time — NOT sort timestamp`,
    `- Math: round(value, decimals:2)  — NOT round(value, 2)`,
    `- Multiplication must use explicit *: (a / b) * 100 — NOT (a / b) 100`,
    `- contains() is a FUNCTION not an operator: contains(fieldName, "value") — NOT fieldName contains "value"`,
    `- toDouble() for arithmetic on string fields`,
    ``,
    `Be concise and practical. Use bullet points.`,
  ].join('\n');

  try {
    const res = await functions.call('anthropic-chat', {
      data: {
        anthropicApiKey,
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt,
        maxTokens: 4096,
      },
    });

    const result = await res.json() as { status: string; response?: string; message?: string; usage?: { input_tokens: number; output_tokens: number } };

    if (result.status === 'success') {
      return { status: 'success', response: result.response || '', usage: result.usage };
    }
    return { status: 'error', response: '', message: result.message || 'Claude request failed' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error calling Claude';
    return { status: 'error', response: '', message: msg };
  }
}

/**
 * Notebook section definition for building notebook content.
 */
interface NotebookSection {
  type: 'markdown' | 'dql';
  content: string;
}

/**
 * Create a Dynatrace Notebook using the Document SDK.
 * Returns the notebook ID so the UI can link to it.
 */
export async function createNotebook(
  title: string,
  sections: NotebookSection[]
): Promise<{ status: string; notebookId?: string; message?: string }> {
  // Build the notebook JSON content following the Dynatrace notebook schema
  const cells = sections.map((section, idx) => {
    if (section.type === 'dql') {
      return {
        id: `cell-${idx}`,
        type: 'code' as const,
        language: 'dql',
        content: section.content,
      };
    }
    return {
      id: `cell-${idx}`,
      type: 'markdown' as const,
      content: section.content,
    };
  });

  const notebookContent = JSON.stringify({
    version: '1',
    defaultTimeframe: { from: 'now()-2h', to: 'now()' },
    sections: cells.map((cell) => ({
      id: cell.id,
      type: cell.type === 'code' ? 'dqlQuery' : 'markdown',
      ...(cell.type === 'code'
        ? {
            state: { input: { value: cell.content } },
            davisAnalysis: { analyzerComponentState: { resultState: {} } },
            visualization: 'table',
            visualizationSettings: {},
            querySettings: { maxResultRecords: 1000 },
          }
        : { content: cell.content }),
    })),
  });

  try {
    const result = await documentsClient.createDocument({
      body: {
        name: title,
        type: 'notebook',
        content: new Blob([notebookContent], { type: 'application/json' }),
      },
    });

    return { status: 'success', notebookId: result.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create notebook';
    return { status: 'error', message: msg };
  }
}
