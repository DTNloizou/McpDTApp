import { functions } from '@dynatrace-sdk/app-utils';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';
import { documentsClient } from '@dynatrace-sdk/client-document';
import { loadConfig, getModelMaxInput } from './config';
import { getDocumentFileRefs, buildKBContext, buildKBSummary, retrieveRelevantKB, isKBIndexed, getKBDocuments } from './knowledge-base';

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
 * Call Davis CoPilot via the app function (server-side).
 * Routes through davis-copilot.function.ts so the request uses the
 * app's identity & scopes rather than the calling user's IAM permissions.
 */
async function davisChat(
  messages: { role: string; content: string }[]
): Promise<ChatResponse> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) {
    return { status: 'error', response: '', message: 'No user message provided' };
  }

  try {
    const res = await functions.call('davis-copilot', {
      data: { messages },
    });
    const body = await res.json() as { status: string; response?: string; message?: string };

    if (!body || body.status !== 'success') {
      return { status: 'error', response: '', message: body?.message || 'Davis CoPilot request failed' };
    }

    return { status: 'success', response: body.response || '' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown Davis CoPilot error';
    return { status: 'error', response: '', message: msg };
  }
}

/**
 * Test Davis CoPilot connectivity via the app function.
 */
export async function testDavisConnection(): Promise<ConnectionResult> {
  try {
    const res = await functions.call('davis-copilot', {
      data: { messages: [{ role: 'user', content: 'Hello' }] },
    });
    const body = await res.json() as { status: string; message?: string };
    if (body?.status === 'success') {
      return { status: 'success', message: 'Connected', environment: 'Dynatrace Assist' };
    }
    return { status: 'error', message: body?.message || 'Davis CoPilot test failed' };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function sendChat(
  message: string,
  history: { role: string; content: string }[],
  overrides?: ConnOverrides,
  documents?: { file_id: string; title: string }[],
  onToolCall?: (tc: ToolCallResult) => void,
): Promise<ChatResponse> {
  const config = loadConfig();

  // Route to Davis CoPilot when in dynatrace-assist mode
  if (config.aiMode === 'dynatrace-assist') {
    // If an LLM provider is configured, use it for general chat
    // (Davis CoPilot often refuses free-form questions)
    if (isLLMConfigured()) {
      const chatHistory = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: message });

      const tokenBudget = getModelMaxInput();
      const isLowBudget = tokenBudget <= 4000;

      // For low-budget models (GPT-5, o3, etc.), use a minimal system prompt
      // and skip KB context — the model can still discover data via tool calls
      let kbContext = '';
      if (!isLowBudget) {
        if (isKBIndexed() && config.githubPat) {
          try {
            kbContext = await retrieveRelevantKB(message, config.githubPat);
          } catch {
            kbContext = buildKBSummary();
          }
        } else {
          kbContext = buildKBSummary();
        }
      }

      const systemPrompt = isLowBudget
        ? [
            'Dynatrace SRE assistant. Use execute_dql tool to query real data.',
            'DQL: fetch bizevents/logs/spans/events/dt.entity.service',
            'Metrics: timeseries avg(metric.key), from:now()-3d',
            'Discover metrics: fetch dt.metrics | filter contains(metric.key,"keyword") | limit 20',
            'INVALID: fetch problems/services/errors/traces/metrics',
            'If a query fails, simplify it. Format DQL in ```dql blocks.',
          ].join('\n')
        : [
            'You are a Dynatrace SRE expert assistant connected to a live Dynatrace tenant.',
            'You have access to a tool called execute_dql that lets you run DQL queries against the tenant.',
            'ALWAYS use execute_dql to fetch real data before answering questions — do NOT guess or hallucinate data.',
            'Run multiple queries if needed to build a complete picture.',
            '',
            'VALID DQL DATA SOURCES (use ONLY these after "fetch"):',
            '- bizevents — business events (payments, transactions, custom events)',
            '- logs — log entries',
            '- spans — distributed traces',
            '- events — Davis problems, deployments, and other platform events. Filter by event.kind: "DAVIS_PROBLEM", "DAVIS_EVENT", "CUSTOM_DEPLOYMENT" etc.',
            '- dt.entity.service, dt.entity.host, dt.entity.process_group — entity tables',
            '',
            'METRICS — use the "timeseries" command (NOT "fetch"):',
            '  timeseries avg(metric.key), from:now()-3d',
            '  timeseries { lcp = avg(web.vital.lcp), cls = avg(web.vital.cls), fid = avg(web.vital.fid) }, from:now()-3d',
            '  timeseries avg(dt.host.cpu.usage), from:now()-1h, by:{dt.entity.host}',
            'TIMESERIES RULES:',
            '- Multiple metrics: timeseries { alias1 = fn(metric1), alias2 = fn(metric2) }, from:...',
            '- Functions: avg(), sum(), min(), max(), count(), rate(), percentile()',
            '- NEVER use "fetch" with metrics. NEVER use bin() or bucket with timeseries.',
            '- To discover metrics: fetch dt.metrics | filter contains(metric.key, "keyword") | fields metric.key | limit 20',
            '',
            'INVALID: "fetch problems", "fetch services", "fetch errors", "fetch traces", "fetch metrics" — these do NOT exist.',
            'For problems: fetch events | filter event.kind == "DAVIS_PROBLEM"',
            'For services: fetch dt.entity.service',
            '',
            'DQL SYNTAX RULES:',
            '- Group-by: summarize count(), by:{fieldName}',
            '- contains() is a FUNCTION: contains(fieldName, "value")',
            '- Time bucketing: summarize count(), by:{time = bin(timestamp, 1h)}',
            '- Math: round(value, decimals:2), explicit *: (a / b) * 100',
            '',
            'If a query fails, try a simpler version. Do not keep retrying similar syntax.',
            'Format DQL in ```dql code blocks.',
            ...(kbContext ? ['', 'Knowledge base context:', kbContext] : []),
          ].join('\n');

      // For low-budget models, limit iterations and cap tool output size
      const maxIter = isLowBudget ? 2 : 5;
      return agenticChat(systemPrompt, chatHistory, onToolCall, maxIter);
    }

    // Fall back to Davis
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
      const errorDetail = result.result?.records?.[0] 
        ? JSON.stringify(result.result.records[0]).slice(0, 500)
        : (result as unknown as Record<string, unknown>).error 
          ? JSON.stringify((result as unknown as Record<string, unknown>).error).slice(0, 500)
          : 'DQL query failed';
      return { status: 'error', message: errorDetail };
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
 * Unified LLM call helper — routes to GitHub Models or Anthropic based on config.
 * Accepts OpenAI-style messages (system/user/assistant).
 * KB documents are inlined into the system prompt for GitHub Models,
 * or passed as file refs for Anthropic.
 */
async function callLLM(
  userMessages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt?: string,
  maxTokens = 4096,
  /** When true, callLLM will NOT inject KB context — the caller already included it */
  skipKB = false,
): Promise<{ status: string; response: string; usage?: { input_tokens: number; output_tokens: number }; message?: string }> {
  const config = loadConfig();

  if (config.llmProvider === 'github-models') {
    if (!config.githubPat) {
      return { status: 'error', response: '', message: 'GitHub PAT not configured. Add it in Settings.' };
    }

    // Use RAG retrieval for KB context if indexed, otherwise fall back to summary
    // Skip if caller already embedded KB context in the system prompt
    let kbContext = '';
    if (!skipKB) {
      if (isKBIndexed() && config.githubPat) {
        try {
          // Use the last user message as the query for retrieval
          const lastMsg = userMessages[userMessages.length - 1]?.content || '';
          kbContext = await retrieveRelevantKB(lastMsg, config.githubPat);
        } catch {
          kbContext = buildKBSummary();
        }
      } else {
        kbContext = buildKBSummary();
      }
    }
    const fullSystem = [systemPrompt, kbContext].filter(Boolean).join('\n\n');

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
    if (fullSystem) {
      messages.push({ role: 'system', content: fullSystem });
    }
    messages.push(...userMessages);

    // Cap maxTokens to stay within GitHub Models free-tier output limit (4096)
    const cappedMaxTokens = Math.min(maxTokens, 4096);

    const res = await functions.call('github-chat', {
      data: {
        githubPat: config.githubPat,
        model: config.githubModel || 'openai/gpt-4.1',
        messages,
        maxTokens: cappedMaxTokens,
      },
    });
    return await res.json() as { status: string; response: string; usage?: { input_tokens: number; output_tokens: number }; message?: string };
  }

  // Anthropic path (legacy)
  const anthropicApiKey = config.claudeApiKey;
  if (!anthropicApiKey) {
    return { status: 'error', response: '', message: 'Anthropic API key not configured. Enable Claude in Settings and add your API key.' };
  }

  const documentRefs = getDocumentFileRefs();
  const res = await functions.call('anthropic-chat', {
    data: {
      anthropicApiKey,
      messages: userMessages,
      systemPrompt,
      maxTokens,
      documents: documentRefs.length > 0 ? documentRefs : undefined,
    },
  });
  return await res.json() as { status: string; response: string; usage?: { input_tokens: number; output_tokens: number }; message?: string };
}

/* ─── Agentic Chat with Tool-Calling ─── */

/** Tool definitions exposed to the LLM */
const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'execute_dql',
      description: 'Execute a DQL query against the Dynatrace tenant and return the results. Use this to fetch real data before answering questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The DQL query to execute' },
          reason: { type: 'string', description: 'Brief explanation of why this query is needed' },
        },
        required: ['query'],
      },
    },
  },
];

interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  output: string;
}

/**
 * Agentic chat — LLM can call tools (execute DQL) iteratively.
 * Loops up to maxIterations, executing tool calls and feeding results back.
 * `onToolCall` fires for each tool execution so the UI can show progress.
 */
export async function agenticChat(
  systemPrompt: string,
  userMessages: { role: string; content: string }[],
  onToolCall?: (tc: ToolCallResult) => void,
  maxIterations = 5,
): Promise<ChatResponse> {
  const config = loadConfig();
  const tokenBudget = getModelMaxInput();
  const toolOutputCap = tokenBudget <= 4000 ? 800 : 3000;

  if (config.llmProvider !== 'github-models' || !config.githubPat) {
    // Fall back to non-agentic callLLM for Anthropic (no tool-calling wired up)
    const msgs = userMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    return callLLM(msgs, systemPrompt, 4096, true);
  }

  // Build initial messages array with types compatible with the API
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages,
  ];

  const allToolCalls: ToolCallResult[] = [];
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let i = 0; i < maxIterations; i++) {
    // Estimate token usage — trim old tool results if conversation is getting large
    const trimThreshold = tokenBudget <= 4000 ? 6000 : 20000;
    const msgJson = JSON.stringify(messages);
    if (msgJson.length > trimThreshold) {
      // Keep system + first user + last 4 messages, trim tool outputs in the middle
      for (let m = 1; m < messages.length - 4; m++) {
        if (messages[m].role === 'tool' && typeof messages[m].content === 'string') {
          const content = messages[m].content as string;
          if (content.length > 200) {
            messages[m] = { ...messages[m], content: content.slice(0, 200) + '…(trimmed)' };
          }
        }
      }
    }

    let res;
    try {
      const payload = {
        githubPat: config.githubPat,
        model: config.githubModel || 'openai/gpt-4.1',
        messages,
        maxTokens: Math.min(2048, 4096),
        tools: AGENT_TOOLS,
      };

      res = await functions.call('github-chat', {
        data: payload,
      });
    } catch (err) {
      return { status: 'error', response: '', message: `API call failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    const result = await res.json() as {
      status: string;
      response: string;
      toolCalls?: { id: string; type: string; function: { name: string; arguments: string } }[];
      finishReason?: string;
      usage?: { input_tokens: number; output_tokens: number };
      message?: string;
    };

    if (result.status !== 'success') {
      return { status: 'error', response: '', message: result.message || 'LLM request failed' };
    }

    if (result.usage) {
      totalUsage.input_tokens += result.usage.input_tokens;
      totalUsage.output_tokens += result.usage.output_tokens;
    }

    // If no tool calls, the model is done — return the final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return {
        status: 'success',
        response: result.response || '',
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: totalUsage,
      };
    }

    // Append the assistant message with tool_calls to the conversation
    messages.push({
      role: 'assistant',
      content: result.response || null,
      tool_calls: result.toolCalls,
    });

    // Execute each tool call and append results
    for (const tc of result.toolCalls) {
      let toolOutput = '';
      const parsed = (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })();

      if (tc.function.name === 'execute_dql') {
        const query = parsed.query as string;
        if (query) {
          try {
            const dqlResult = await executeDql(query, tokenBudget <= 4000 ? 20 : 100);
            if (dqlResult.status === 'success') {
              const raw = dqlResult.result?.content?.[0]?.text || 'No records returned';
              // Cap results to stay within token budget
              toolOutput = raw.length > toolOutputCap ? raw.slice(0, toolOutputCap) + '\n…(truncated)' : raw;
            } else {
              toolOutput = `Query failed: ${dqlResult.message || 'Unknown error'}`;
            }
          } catch (err) {
            toolOutput = `Query error: ${err instanceof Error ? err.message : 'Unknown'}`;
          }
        } else {
          toolOutput = 'Error: no query provided';
        }
      } else {
        toolOutput = `Unknown tool: ${tc.function.name}`;
      }

      const tcResult: ToolCallResult = {
        tool: tc.function.name,
        input: parsed,
        output: toolOutput,
      };
      allToolCalls.push(tcResult);
      if (onToolCall) onToolCall(tcResult);

      // Append tool result to conversation
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolOutput,
      });
    }
  }

  // Max iterations reached — ask model for a final summary
  // Trim conversation to fit token limits: keep system + user + last 4 tool exchanges
  const trimmedMessages: Record<string, unknown>[] = [
    messages[0], // system
    messages[1], // original user message
  ];
  // Add the last 4 messages (most recent tool results)
  const tail = messages.slice(-4);
  trimmedMessages.push(...tail);
  trimmedMessages.push({
    role: 'user',
    content: 'Please provide your final analysis based on all the data gathered so far. If queries failed, explain what you found and suggest what the user can try.',
  });

  try {
    const finalRes = await functions.call('github-chat', {
      data: {
        githubPat: config.githubPat,
        model: config.githubModel || 'openai/gpt-4.1',
        messages: trimmedMessages,
        maxTokens: 4096,
      },
    });

    const finalResult = await finalRes.json() as { status: string; response: string; usage?: { input_tokens: number; output_tokens: number }; message?: string };
    if (finalResult.usage) {
      totalUsage.input_tokens += finalResult.usage.input_tokens;
      totalUsage.output_tokens += finalResult.usage.output_tokens;
    }

    if (finalResult.status !== 'success') {
      return { status: 'error', response: '', message: finalResult.message || 'Final summary request failed', toolCalls: allToolCalls };
    }

    return {
      status: 'success',
      response: finalResult.response || '',
      toolCalls: allToolCalls,
      usage: totalUsage,
    };
  } catch (err) {
    // If the final call fails, return what we have from tool calls
    const summary = allToolCalls.map((tc) => `**${tc.tool}** (${tc.input.query || ''}):\n${tc.output.slice(0, 300)}`).join('\n\n');
    return {
      status: 'success',
      response: `Tool calls completed but the final analysis failed. Here are the raw results:\n\n${summary}`,
      toolCalls: allToolCalls,
      usage: totalUsage,
    };
  }
}

/**
 * Check whether an LLM provider is configured and ready to use.
 */
export function isLLMConfigured(): boolean {
  const config = loadConfig();
  if (config.llmProvider === 'github-models') return !!config.githubPat;
  return config.claudeEnabled && !!config.claudeApiKey;
}

/**
 * Ask Claude to repair a broken DQL query using the parse error message.
 * Returns the corrected query string, or null if repair isn't possible.
 */
export async function repairDqlWithClaude(brokenDql: string, errorMsg: string): Promise<string | null> {
  if (!isLLMConfigured()) return null;
  try {
    const userContent = [
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
    ].join('\n');

    const result = await callLLM(
      [{ role: 'user', content: userContent }],
      'You are a Dynatrace DQL syntax expert. Use the reference documents for DQL syntax patterns. Return ONLY the corrected DQL query, no explanation.',
      1024,
    );
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
 * Ask the LLM directly (via in-app serverless function) with Davis CoPilot context.
 * Flow: Davis analyses first → LLM gets Davis context + raw data → deep analysis.
 * Routes to GitHub Models or Anthropic based on config.llmProvider.
 */
export async function getClaudeRecommendations(
  queryLabel: string,
  queryDql: string,
  queryResults: string,
  kbContext?: string,
  personaPrompt?: string,
  onToolCall?: (tc: { tool: string; input: Record<string, unknown>; output: string }) => void,
): Promise<ChatResponse> {
  if (!isLLMConfigured()) {
    return { status: 'error', response: '', message: 'No LLM configured. Add a GitHub PAT or Anthropic API key in Settings.' };
  }

  const config = loadConfig();
  // For GitHub Models (8K token limit), use condensed KB summary instead of full text
  const effectiveKB = (kbContext && config.llmProvider === 'github-models')
    ? buildKBSummary()
    : kbContext;

  // For GitHub Models (8K input token limit), cap results more aggressively
  // When using persona (agentic mode with tools), leave room for tool definitions
  const isAgentic = !!personaPrompt;

  // Always inject DQL reference docs into persona calls for better query accuracy
  let dqlRefContext = '';
  if (isAgentic) {
    const dqlDocs = getKBDocuments().filter(d =>
      d.name === 'DQL_Queries_Reference.md' || d.name === 'dql-lessons.md'
    );
    if (dqlDocs.length > 0) {
      dqlRefContext = dqlDocs.map(d => `--- ${d.name} ---\n${d.content}`).join('\n\n');
    }
  }
  const maxResults = config.llmProvider === 'github-models'
    ? (isAgentic ? 1500 : 3000)
    : 8000;
  const trimmedResults = queryResults.length > maxResults
    ? queryResults.slice(0, maxResults) + '\n\n… (results truncated for brevity)'
    : queryResults;

  // Step 1: Get Davis CoPilot context (skip for agentic mode — LLM queries Dynatrace directly)
  let davisContext = '';
  if (!isAgentic) {
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
  }

  // Step 2: Send to LLM with Davis context
  const defaultPersona = `You are a Dynatrace SRE expert. You have been given query results from Dynatrace and contextual analysis from Davis CoPilot (Dynatrace's built-in AI).\nProvide a deep, actionable analysis that builds on Davis's insights.`;

  // For agentic persona mode on GitHub Models, skip KB in system prompt to save tokens
  // — the LLM can discover data via execute_dql instead
  const includeKB = !isAgentic || config.llmProvider !== 'github-models';
  const systemPrompt = [
    personaPrompt || defaultPersona,
    ...(includeKB && effectiveKB ? [
      ``,
      `IMPORTANT: The user has provided reference documents below. Study them carefully for:`,
      `- DQL query syntax and patterns (use these as templates for any queries you suggest)`,
      `- Architecture, runbooks, SLAs, and domain-specific context`,
      `- Entity names, service IDs, and field names used in this environment`,
      ``,
      `When suggesting DQL queries, match the syntax patterns found in these documents exactly.`,
      ``,
      effectiveKB,
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
    `1. **Summary** — go beyond restating numbers. Interpret what the data MEANS.`,
    `2. **Key Findings** — specific anomalies, patterns, root causes.`,
    `3. **Recommendations** — concrete, implementable actions with thresholds.`,
    `4. **Follow-up Queries** — DQL in \`\`\`dql blocks using ONLY valid fields.`,
    ``,
    ...(isAgentic ? [
      `DQL SCHEMAS: bizevents(event.type,event.provider,timestamp) | logs(content,loglevel,log.source,dt.entity.service) | spans(span.name,duration,status_code,dt.entity.service,http.response.status_code,http.route) | events(event.kind,event.name,event.status) | user.sessions(duration,error.count,error.exception_count,error.http_4xx_count,error.http_5xx_count,browser.name,os.name,geo.country.iso_code,frontend.name,device.type) | user.events(error.id,error.type,error.message,page.source.url.full,navigation.type)`,
      `DQL SYNTAX (CRITICAL — follow exactly):`,
      `- summarize: alias results! summarize total=count(), errors=countIf(x>0), by:{field1, field2}`,
      `- CURLY BRACES required for by: by:{field} NOT by:field — multiple fields: by:{f1, f2, f3}`,
      `- sort by alias: summarize cnt=count() ... sort cnt desc — NEVER sort count() desc`,
      `- countIf() NOT count_if() — e.g. countIf(error.count > 0)`,
      `- fieldsAdd NOT compute — e.g. fieldsAdd pct = round(toDouble(a)/toDouble(b)*100, decimals:2)`,
      `- round(value, decimals:2) NOT round(value, 2)`,
      `- contains(field,"val") is a function NOT operator`,
      `- toDouble() for arithmetic on aggregated fields`,
      `- ENTITY FIELDS (dt.entity.service, dt.entity.host) hold IDs like SERVICE-XXX, NEVER human names`,
      `- NEVER write dt.entity.service == "service-name" — it will ALWAYS return 0 records`,
      `- Filter by name: fieldsAdd serviceName = entityName(dt.entity.service) then filter serviceName == "my-service"`,
      `- Display names: fieldsAdd serviceName = entityName(dt.entity.service) after summarize`,
      `- timeseries by:{} only accepts plain fields — use fieldsAdd entityName() AFTER timeseries, not inside by:{}`,
      `- timeseries avg(metric.key), from:now()-3d — NOT fetch for metrics`,
      `- SPAN COST: fetch spans is EXPENSIVE. Use from:now()-1h or from:now()-2h MAX. For 7d+ trends use timeseries (FREE)`,
      `- NEVER fetch spans from:now()-7d unless doing a summarize with limit. Use metrics/timeseries instead.`,
      ``,
      `WORKFLOW (CRITICAL — follow this order):`,
      `1. DISCOVER FIRST — NEVER guess field values. Before filtering on ANY field, run a discovery query to find actual values:`,
      `   - For bizevents: fetch bizevents, from:now()-7d | summarize cnt=count(), by:{event.provider} | sort cnt desc | limit 20`,
      `   - To discover custom fields on a bizevent: fetch bizevents, from:now()-7d | filter event.provider == "<actual value>" | limit 1`,
      `   - For spans related to a bizevent: first get the trace IDs from the bizevent, then query spans by trace_id`,
      `   - For span names: fetch spans, from:now()-2h | summarize cnt=count(), by:{span.name} | sort cnt desc | limit 20`,
      `   - For log sources: fetch logs, from:now()-7d | summarize cnt=count(), by:{log.source} | sort cnt desc | limit 20`,
      `2. USE REAL VALUES — only use field values that appeared in discovery results. Never fabricate span names, event types, or filter values.`,
      `3. CORRELATE VIA DATA — to cross-reference (e.g. bizevents→spans), use shared fields like trace_id or dt.entity.service from your discovery results. Do NOT guess that a bizevent field name will appear as a span.name.`,
      `4. EXECUTE AND VERIFY — run each query. If it returns 0 records, the filter is wrong. Re-discover and retry with corrected values.`,
      `5. Only include queries with verified non-empty results in your final analysis. Drop or fix any that return nothing.`,
      ...(dqlRefContext ? [
        ``,
        `DQL REFERENCE (verified queries — use these as exact templates):`,
        dqlRefContext,
      ] : []),
    ] : [
      `CRITICAL: Do NOT invent field names. Only use fields listed below for each data source.`,
      ``,
      `DQL DATA SOURCE SCHEMAS:`,
      `- bizevents: event.type, event.provider, event.kind, timestamp, and custom fields`,
      `- logs: content, loglevel, log.source, dt.entity.service, timestamp`,
      `- spans: span.name, span.kind, duration, status_code, dt.entity.service, http.response.status_code, http.request.method, http.route, timestamp`,
      `- events: event.kind ("DAVIS_PROBLEM","DAVIS_EVENT","CUSTOM_DEPLOYMENT"), event.name, event.status, dt.entity.service, timestamp`,
      `- dt.entity.service: entity.name, id, lifetime, tags`,
      `- dt.entity.host: entity.name, id, lifetime, tags`,
      `- user.sessions: duration, user_interaction_count, request_count, navigation_count, error.count, error.exception_count, error.http_4xx_count, error.http_5xx_count, end_reason, device.type, os.name, browser.name, browser.version, client.isp, geo.country.iso_code, frontend.name, dt.rum.application.entities, characteristics.is_invalid, timestamp`,
      `- user.events: error.id, error.type, error.message, dt.rum.application.id, os.name, browser.user_agent, page.source.url.full, navigation.type, client.isp, characteristics.classifier, timestamp`,
      `- Metrics (use timeseries, NOT fetch): timeseries avg(metric.key), from:now()-3d`,
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
      `- Entity fields (dt.entity.service, dt.entity.host) hold IDs like SERVICE-XXX, NEVER names`,
      `- NEVER write dt.entity.service == "service-name" — it will ALWAYS return 0 records`,
      `- Filter by name: fieldsAdd serviceName = entityName(dt.entity.service) then filter serviceName == "my-service"`,
      `- Display names: fieldsAdd serviceName = entityName(dt.entity.service) after summarize`,
      `- timeseries by:{} only accepts plain fields — use fieldsAdd entityName() AFTER timeseries`,
      `- SPAN COST: fetch spans is EXPENSIVE. Max from:now()-2h. For 7d trends use timeseries (FREE)`,
    ]),
    ``,
    `Be concise and practical. Use bullet points.`,
  ].join('\n');

  try {
    // When a persona is provided, try agentic mode (with tool-calling)
    // Fall back to non-agentic if it fails (e.g. GitHub Models 500)
    if (personaPrompt) {
      try {
        const agenticResult = await agenticChat(
          systemPrompt,
          [{ role: 'user', content: userMessage }],
          onToolCall,
          5,
        );
        // If agentic succeeded, return it; otherwise fall through to non-agentic
        if (agenticResult.status === 'success') {
          return agenticResult;
        }
        // Agentic mode returned error — fall back to non-agentic
      } catch (e) {
        // Agentic mode threw — fall back to non-agentic
      }
    }

    const result = await callLLM(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      4096,
      true, // KB already included in systemPrompt
    );

    if (result.status === 'success') {
      return { status: 'success', response: result.response || '', usage: result.usage };
    }
    return { status: 'error', response: '', message: result.message || 'LLM request failed' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error calling LLM';
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
  // Build notebook content using Dynatrace notebook schema v7
  // (matches the format used by the official Dynatrace MCP server)
  const notebookContent = JSON.stringify({
    version: '7',
    sections: sections.map((section, idx) => {
      const id = `cell-${idx}-${Date.now().toString(36)}`;
      if (section.type === 'dql') {
        return {
          id,
          type: 'dql',
          showTitle: false,
          state: {
            input: { value: section.content },
          },
        };
      }
      return {
        id,
        type: 'markdown',
        markdown: section.content,
      };
    }),
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
    // Capture detailed error info for debugging production issues
    let msg = 'Failed to create notebook';
    if (err instanceof Error) {
      msg = err.message;
      // Check for API error details
      const anyErr = err as { cause?: { message?: string }; response?: { status?: number; statusText?: string } };
      if (anyErr.cause?.message) {
        msg += ` (${anyErr.cause.message})`;
      }
      if (anyErr.response) {
        msg += ` [HTTP ${anyErr.response.status}: ${anyErr.response.statusText}]`;
      }
    } else if (typeof err === 'object' && err !== null) {
      msg = JSON.stringify(err).slice(0, 300);
    }

    return { status: 'error', message: msg };
  }
}
