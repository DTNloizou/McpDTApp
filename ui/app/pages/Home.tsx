import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { TitleBar } from '@dynatrace/strato-components-preview/layouts';
import { sendChat, testConnection, testDavisConnection, executeDql, getRecommendations, getClaudeRecommendations, repairDqlWithClaude, isLLMConfigured, createNotebook, type ToolCall, type DqlResult, type ChatResponse } from '../mcp-client';
import { getEnvironmentUrl } from '@dynatrace-sdk/app-environment';
import { loadConfig, GITHUB_MODEL_OPTIONS } from '../config';
import { getKBDocuments, buildKBContext, buildKBSummary, buildDiscoveryTasks, buildQueryGenerationPrompt, loadKBDocuments, addKBDocument, removeKBDocument, appendToKBDocument, detectPlaceholders, detectDiscoveryPlaceholders, loadPlaceholderValues, savePlaceholderValues, saveDiscoveryStatus, loadDiscoveryStatus, getDocumentFileRefs, uploadDocToAnthropic, deleteDocFromAnthropic, syncAllDocsToAnthropic, getDocSyncStatus, applyReplacements, indexAllDocuments, isKBIndexed, getVectorIndexStats, type KBDocument, type PlaceholderInfo, type DiscoveryPlaceholder } from '../knowledge-base';
import { loadCustomCategories, getCustomCategories, saveCustomCategories, type CustomCategory, type CustomQuery } from '../custom-queries';
import { autoPopulateKB, type PopulateProgress } from '../kb-auto-populate';
import { loadHistory, getHistory, addHistoryEntry, deleteHistoryEntry, clearHistory, type HistoryEntry } from '../recommendation-history';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  toolCalls?: ToolCall[];
}

interface HomeProps {
  onOpenSettings?: () => void;
}

export interface HomeHandle {
  reconnect: (serverUrl?: string, apiKey?: string) => void;
}

/* ─── Category & query definitions ─── */

interface QueryItem {
  label: string;
  emoji: string;
  query: string;
}

interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string;
  queries: QueryItem[];
}

const CATEGORIES: Category[] = [
  {
    id: 'financial',
    label: 'Financial',
    emoji: '💰',
    color: '#B36305',
    queries: [
      { label: 'Failed Payments & Value', emoji: '💰', query: 'fetch bizevents, from:now()-7d | filter event.provider == "bank-payment.process.transactions" | filter settlementStatus == "DISCREPANCY" | summarize failedPayments = count(), totalFailedValueGBP = round(sum(toDouble(instructedAmount)) / 100, decimals:2)' },
      { label: 'Total Shortfall', emoji: '🔻', query: 'fetch bizevents, from:now()-7d | filter event.provider == "bank-payment.process.transactions" | filter settlementStatus == "DISCREPANCY" | summarize totalShortfallGBP = round(sum(toDouble(instructedAmount) - toDouble(settledAmount)) / 100, decimals:2)' },
      { label: 'Settlement Success Rate', emoji: '✅', query: 'fetch bizevents, from:now()-7d | filter event.provider == "bank-payment.process.transactions" | summarize total = count(), discrepancies = countIf(settlementStatus == "DISCREPANCY"), successRate = round((toDouble(count()) - toDouble(countIf(settlementStatus == "DISCREPANCY"))) / toDouble(count()) * 100, decimals:2)' },
      { label: 'By Sending Bank', emoji: '🏦', query: 'fetch bizevents, from:now()-7d | filter event.provider == "bank-payment.process.transactions" | filter settlementStatus == "DISCREPANCY" | summarize failedCount = count(), failedValueGBP = round(sum(toDouble(instructedAmount)) / 100, decimals:2), shortfallGBP = round(sum(toDouble(instructedAmount) - toDouble(settledAmount)) / 100, decimals:2), by:{orderingCustomerName} | sort failedValueGBP desc' },
      { label: 'Recent Failures (24h)', emoji: '📋', query: 'fetch bizevents, from:now()-24h | filter event.provider == "bank-payment.process.transactions" | filter settlementStatus == "DISCREPANCY" | sort timestamp desc | fieldsAdd instructedGBP = round(toDouble(instructedAmount) / 100, decimals:2), shortfallGBP = round((toDouble(instructedAmount) - toDouble(settledAmount)) / 100, decimals:2), time = formatTimestamp(timestamp, format:"HH:mm") | fields time, orderingCustomerName, beneficiaryCustomerName, instructedGBP, shortfallGBP | limit 20' },
    ],
  },
  {
    id: 'problems',
    label: 'Problems',
    emoji: '🚨',
    color: '#E32017',
    queries: [
      { label: 'Active Problems', emoji: '🚨', query: 'fetch events, from:now()-24h | filter event.kind == "DAVIS_PROBLEM" | filter event.status == "ACTIVE" | fields timestamp, display_id, title, event.status | sort timestamp desc | limit 20' },
      { label: 'Problem History (7d)', emoji: '📊', query: 'fetch events, from:now()-7d | filter event.kind == "DAVIS_PROBLEM" | summarize problemCount = count(), by:{event.status} | sort problemCount desc' },
      { label: 'Impacted Services', emoji: '🔗', query: 'fetch events, from:now()-24h | filter event.kind == "DAVIS_PROBLEM" | filter event.status == "ACTIVE" | fields title, affected_entity_ids, root_cause_entity_id | limit 20' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    emoji: '⚙️',
    color: '#0098D4',
    queries: [
      { label: 'Service Error Rates', emoji: '⚠️', query: 'fetch spans, from:now()-1h | filter http.response.status_code >= 500 | summarize errorCount = count(), by:{dt.entity.service} | sort errorCount desc | limit 10' },
      { label: 'Slowest Services', emoji: '🐢', query: 'fetch spans, from:now()-1h | summarize avgDuration = avg(duration), by:{dt.entity.service} | sort avgDuration desc | limit 10' },
      { label: 'Throughput by Service', emoji: '📈', query: 'fetch spans, from:now()-1h | summarize requestCount = count(), by:{dt.entity.service} | sort requestCount desc | limit 10' },
    ],
  },
  {
    id: 'databases',
    label: 'Databases',
    emoji: '🗄️',
    color: '#00782A',
    queries: [
      { label: 'Slow DB Queries', emoji: '🐌', query: 'fetch spans, from:now()-1h | filter span.kind == "CLIENT" | filter db.system != "" | summarize avgDuration = avg(duration), callCount = count(), by:{db.system, db.statement} | sort avgDuration desc | limit 10' },
      { label: 'DB Call Volume', emoji: '📊', query: 'fetch spans, from:now()-1h | filter span.kind == "CLIENT" | filter db.system != "" | summarize callCount = count(), avgDuration = avg(duration), by:{db.system} | sort callCount desc' },
      { label: 'Failed DB Calls', emoji: '❌', query: 'fetch spans, from:now()-1h | filter span.kind == "CLIENT" | filter db.system != "" | filter otel.status_code == "ERROR" | summarize errorCount = count(), by:{db.system, db.statement} | sort errorCount desc | limit 10' },
    ],
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    emoji: '☸️',
    color: '#6950A1',
    queries: [
      { label: 'K8s Events', emoji: '📋', query: 'fetch events, from:now()-1h | filter event.kind == "K8S_EVENT" | fields timestamp, k8s.event.reason, k8s.namespace.name, content | sort timestamp desc | limit 10' },
      { label: 'Pod Restarts', emoji: '🔄', query: 'fetch events, from:now()-24h | filter event.kind == "K8S_EVENT" | filter k8s.event.reason == "BackOff" or k8s.event.reason == "Killing" | summarize restarts = count(), by:{k8s.namespace.name, k8s.pod.name} | sort restarts desc | limit 10' },
      { label: 'Namespace Health', emoji: '🏷️', query: 'fetch events, from:now()-1h | filter event.kind == "K8S_EVENT" | summarize total = count(), warnings = countIf(k8s.event.reason == "BackOff" or k8s.event.reason == "Failed"), by:{k8s.namespace.name} | sort warnings desc' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    emoji: '💻',
    color: '#A0A5A9',
    queries: [
      { label: 'Host CPU Usage', emoji: '🔥', query: 'timeseries avg(dt.host.cpu.usage), by:{dt.entity.host} | limit 10' },
      { label: 'Host Memory', emoji: '🧠', query: 'timeseries avg(dt.host.memory.usage), by:{dt.entity.host} | limit 10' },
      { label: 'Disk Usage', emoji: '💾', query: 'timeseries avg(dt.host.disk.usage), by:{dt.entity.host} | limit 10' },
      { label: 'Recent Logs', emoji: '📋', query: 'fetch logs, from:now()-15m | summarize count(), by:{status} | sort `count()` desc' },
    ],
  },
  {
    id: 'rum',
    label: 'RUM',
    emoji: '🌐',
    color: '#1496FF',
    queries: [
      { label: 'Session Overview (7d)', emoji: '📊', query: 'fetch user.sessions, from:now()-7d | summarize totalSessions = count(), avgDuration = avg(duration), avgRequests = avg(request_count), avgInteractions = avg(user_interaction_count), bounceRate = round(toDouble(countIf(user_interaction_count <= 1)) / toDouble(count()) * 100, decimals:2)' },
      { label: 'Sessions by Browser', emoji: '🌐', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), avgDuration = avg(duration), by:{browser.name} | sort sessions desc | limit 10' },
      { label: 'Sessions by OS', emoji: '📱', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), avgDuration = avg(duration), by:{os.name} | sort sessions desc | limit 10' },
      { label: 'Sessions by Country', emoji: '🗺️', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), by:{geo.country.iso_code} | sort sessions desc | limit 15' },
      { label: 'Sessions with Errors', emoji: '❌', query: 'fetch user.sessions, from:now()-7d | filter error.count > 0 | summarize errorSessions = count(), totalErrors = sum(error.count), avgErrorsPerSession = avg(error.count) | fieldsAdd errorSessionRate = "See Session Overview for total"' },
      { label: 'Error Breakdown', emoji: '🐛', query: 'fetch user.sessions, from:now()-7d | filter error.count > 0 | summarize httpErrors4xx = sum(error.http_4xx_count), httpErrors5xx = sum(error.http_5xx_count), jsExceptions = sum(error.exception_count), totalErrors = sum(error.count)' },
      { label: 'Device Types', emoji: '💻', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), avgDuration = avg(duration), by:{device.type} | sort sessions desc' },
      { label: 'Top ISPs', emoji: '📡', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), avgDuration = avg(duration), errorRate = round(toDouble(countIf(error.count > 0)) / toDouble(count()) * 100, decimals:2), by:{client.isp} | sort sessions desc | limit 10' },
      { label: 'JS Errors (Events)', emoji: '⚠️', query: 'fetch user.events, from:now()-24h | filter error.type != "" | summarize errorCount = count(), by:{error.type, error.message} | sort errorCount desc | limit 15' },
      { label: 'Page Load Actions', emoji: '📄', query: 'fetch user.events, from:now()-24h | filter navigation.type != "" | summarize pageLoads = count(), by:{navigation.type, page.source.url.full} | sort pageLoads desc | limit 15' },
      { label: 'Session Trend (Hourly)', emoji: '📈', query: 'fetch user.sessions, from:now()-24h | summarize sessions = count(), by:{bin(timestamp, 1h)} | sort `bin(timestamp, 1h)` asc' },
      { label: 'Screen Resolutions', emoji: '🖥️', query: 'fetch user.sessions, from:now()-7d | summarize sessions = count(), by:{device.screen.width, device.screen.height} | sort sessions desc | limit 10' },
    ],
  },
];

type ViewMode = 'explorer' | 'chat' | 'kb' | 'queries' | 'history';

/* ─── Helper components ─── */

function CategoryButton({ cat, active, onClick }: { cat: Category; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        border: 'none',
        borderLeft: `4px solid ${active ? cat.color : 'transparent'}`,
        background: active ? `${cat.color}14` : 'transparent',
        color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        textAlign: 'left' as const,
        width: '100%',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 18 }}>{cat.emoji}</span>
      <span>{cat.label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999', fontWeight: 400 }}>{cat.queries.length}</span>
    </button>
  );
}

function QueryButton({ q, disabled, color, onClick }: { q: QueryItem; disabled: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={q.query}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
        borderLeft: `3px solid ${color}`,
        background: 'var(--dt-colors-background-surface-default, #f8f8fb)',
        color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left' as const,
        width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span>{q.emoji}</span>
      <span style={{ flex: 1 }}>{q.label}</span>
      <span style={{ fontSize: 11, color: '#999' }}>▶</span>
    </button>
  );
}

export const Home = forwardRef<HomeHandle, HomeProps>(({ onOpenSettings }, ref) => {
  const [viewMode, setViewMode] = useState<ViewMode>('explorer');
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0].id);
  const [output, setOutput] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState('');

  // Recommendations state
  const [recommendation, setRecommendation] = useState<Message | null>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<{ label: string; dql: string; results: string } | null>(null);
  const recoEndRef = useRef<HTMLDivElement>(null);

  // Chat mode state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [kbDocs, setKbDocs] = useState<KBDocument[]>([]);
  const [kbUploading, setKbUploading] = useState(false);
  const kbFileInputRef = useRef<HTMLInputElement>(null);
  const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([]);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [discoveryPlaceholders, setDiscoveryPlaceholders] = useState<DiscoveryPlaceholder[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [dqlPopStatus, setDqlPopStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [dqlPopProgress, setDqlPopProgress] = useState<PopulateProgress | null>(null);
  const [dqlPopMessage, setDqlPopMessage] = useState('');
  const [completedDiscoveryKeys, setCompletedDiscoveryKeys] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState('');
  const [fileUploadStatus, setFileUploadStatus] = useState<Record<string, 'uploading' | 'done' | 'error'>>({});
  const [resolvingPlaceholders, setResolvingPlaceholders] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);
  const [notebookGenerating, setNotebookGenerating] = useState(false);
  const [enrichingReco, setEnrichingReco] = useState(false);
  const [nlQuery, setNlQuery] = useState('');
  const [nlGenerating, setNlGenerating] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState('');
  const [indexingDoc, setIndexingDoc] = useState('');

  // Pre-built queries state
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [editingQuery, setEditingQuery] = useState<{ catId: string; qIdx: number } | null>(null);
  const [addingQueryTo, setAddingQueryTo] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  // History state
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  const scrollOutput = useCallback(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollChat = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollReco = useCallback(() => {
    recoEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollOutput(); }, [output, scrollOutput]);
  useEffect(() => { scrollChat(); }, [messages, scrollChat]);
  useEffect(() => { scrollReco(); }, [recommendation, scrollReco]);

  useImperativeHandle(ref, () => ({
    reconnect: (url?: string, key?: string) => handleConnect(url, key),
  }));

  useEffect(() => {
    const config = loadConfig();
    if (config.aiMode === 'dynatrace-assist' || config.serverUrl) handleConnect();
    // Load persisted KB documents and placeholder values
    loadKBDocuments().then((docs) => {
      setKbDocs(docs);
      setPlaceholders(detectPlaceholders());
      setDiscoveryPlaceholders(detectDiscoveryPlaceholders());
    });
    loadPlaceholderValues().then((vals) => setPlaceholderValues(vals));
    loadDiscoveryStatus().then((keys) => {
      setCompletedDiscoveryKeys(new Set(keys));
      if (keys.length > 0) setDiscoveryStatus('success');
    });
    loadCustomCategories().then((cats) => setCustomCategories(cats));
    loadHistory().then((entries) => setHistoryEntries(entries));
  }, []);

  const handleConnect = async (explicitUrl?: string, explicitKey?: string) => {
    const config = loadConfig();

    // In Davis mode, always mark as connected (Davis CoPilot is built-in)
    if (config.aiMode === 'dynatrace-assist') {
      setConnected(true);
      setConnectionInfo('Dynatrace Assist (Davis CoPilot)');
      return;
    }

    const serverUrl = explicitUrl || config.serverUrl;
    const apiKey = explicitKey ?? config.apiKey;
    if (!serverUrl) return;

    try {
      const result = await testConnection({ serverUrl, apiKey });
      if (result.status === 'success') {
        setConnected(true);
        setConnectionInfo(result.environment || serverUrl);
      }
    } catch {
      // silent
    }
  };

  const formatDqlResult = (resultText: string): string => {
    try {
      // Try to extract JSON from markdown fences first, then fall back to raw JSON
      let jsonStr: string;
      const jsonMatch = resultText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        jsonStr = resultText.trim();
      }
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data) || data.length === 0) return resultText;

      const columns = Object.keys(data[0]);
      const headers = columns.map((c) => c.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase()));

      let table = `### 📊 Query Results (${data.length} record${data.length === 1 ? '' : 's'})\n\n`;
      table += '| ' + headers.join(' | ') + ' |\n';
      table += '| ' + columns.map(() => '---').join(' | ') + ' |\n';

      data.forEach((row: Record<string, unknown>) => {
        table += '| ' + columns.map((col) => {
          const v = row[col];
          if (v === null || v === undefined) return '-';
          if (typeof v === 'boolean') return v ? '✓' : '✗';
          if (typeof v === 'number') {
            if (col.toLowerCase().includes('rate') || col.toLowerCase().includes('percent')) return v.toFixed(2) + '%';
            return v.toLocaleString();
          }
          const s = String(v);
          // Truncate long values (encoded IDs, base64, etc.) and pipe chars break tables
          const clean = s.replace(/\|/g, '∣');
          return clean.length > 40 ? clean.substring(0, 37) + '...' : clean;
        }).join(' | ') + ' |\n';
      });
      return table;
    } catch { return resultText; }
  };

  const handleRunQuery = async (query: string, label: string) => {
    if (loading || !connected) return;
    setOutput((prev) => [...prev, { role: 'user', content: label }]);
    setRecommendation(null);
    setLastQuery(null);
    setLoading(true);
    try {
      const result: DqlResult = await executeDql(query);
      if (result.status === 'success') {
        const rawText = result.result?.content?.[0]?.text || 'Query executed successfully';
        const formatted = formatDqlResult(rawText);
        setOutput((prev) => [...prev, { role: 'assistant', content: formatted }]);
        setLastQuery({ label, dql: query, results: rawText });
      } else {
        setOutput((prev) => [...prev, { role: 'error', content: `Query failed: ${result.message}` }]);
      }
    } catch (err: unknown) {
      setOutput((prev) => [...prev, { role: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` }]);
    } finally { setLoading(false); }
  };

  const handleNaturalLanguageQuery = async () => {
    if (!nlQuery.trim() || nlGenerating || !connected) return;
    const question = nlQuery.trim();
    setNlQuery('');
    setNlGenerating(true);
    setOutput((prev) => [...prev, { role: 'user', content: `🔮 ${question}` }]);
    setRecommendation(null);
    setLastQuery(null);
    setLoading(true);

    try {
      const dqlPrompt = [
        `Convert this natural language question into a single DQL query for Dynatrace.`,
        ``,
        `Question: "${question}"`,
        ``,
        `DQL RULES:`,
        `- Entity types are lowercase: dt.entity.service, dt.entity.host, dt.entity.application, dt.entity.process_group, etc.`,
        `- Valid entity fields: entity.name, id, entity.detected_name, lifetime, tags, managementZones`,
        `- BizEvents: fetch bizevents, from:now()-7d | summarize count = count(), by:{event.type}`,
        `- Logs: fetch logs, from:now()-24h | fields timestamp, content, status, log.source`,
        `- Spans: fetch spans, from:now()-1h | fields span.name, duration, status_code`,
        `- Metrics: fetch dt.metrics | fields metric.key, metric.displayName`,
        `- Use appropriate time ranges and limits`,
        ``,
        `Return ONLY the DQL query, no explanation, no markdown fences, no commentary.`,
      ].join('\n');

      const fileRefs = getDocumentFileRefs();
      const chatResult = await sendChat(dqlPrompt, [], undefined, fileRefs.length > 0 ? fileRefs : undefined);
      if (chatResult.status !== 'success' || !chatResult.response) {
        setOutput((prev) => [...prev, { role: 'error', content: `Failed to generate query: ${chatResult.message || 'No response'}` }]);
        return;
      }

      // Clean the DQL from any markdown fencing
      let dql = chatResult.response.trim();
      const fenceMatch = dql.match(/^```(?:dql)?\n([\s\S]*?)\n```$/);
      if (fenceMatch) dql = fenceMatch[1].trim();
      // Remove any leading/trailing quotes
      if ((dql.startsWith('"') && dql.endsWith('"')) || (dql.startsWith("'") && dql.endsWith("'"))) {
        dql = dql.slice(1, -1);
      }

      setOutput((prev) => [...prev, { role: 'assistant', content: `**Generated DQL:**\n\`\`\`\n${dql}\n\`\`\`` }]);

      // Now execute the generated query
      const result: DqlResult = await executeDql(dql);
      if (result.status === 'success') {
        const rawText = result.result?.content?.[0]?.text || 'Query executed successfully';
        const formatted = formatDqlResult(rawText);
        setOutput((prev) => [...prev, { role: 'assistant', content: formatted }]);
        setLastQuery({ label: `🔮 ${question}`, dql, results: rawText });
      } else {
        setOutput((prev) => [...prev, { role: 'error', content: `Query failed: ${result.message}` }]);
      }
    } catch (err: unknown) {
      setOutput((prev) => [...prev, { role: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` }]);
    } finally {
      setNlGenerating(false);
      setLoading(false);
    }
  };

  const handleGenerateNotebook = async () => {
    if (!lastQuery || !recommendation || recommendation.role !== 'assistant') return;
    setNotebookGenerating(true);
    try {
      const config = loadConfig();

      if (config.aiMode === 'dynatrace-assist') {
        // Build notebook directly using the Document SDK
        const recoText = recommendation.content;

        // Clean the recommendation text first (before any truncation):
        // 1. Strip XML tags from Davis CoPilot responses
        // 2. Remove inlined query execution results (from enrichRecommendationContent)
        // 3. Remove CUSTOM_INFO MCP blocks and raw JSON result dumps
        let cleanText = recoText
          // Remove entire <function_calls>...</function_calls> blocks including content
          .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
          // Remove any remaining XML-like tags
          .replace(/<\/?(?:function_calls|antml:[a-z]+|result|output|name|invoke)[^>]*>/g, '')
          // Remove CUSTOM_INFO MCP Query Execution lines and their JSON payloads
          .replace(/CUSTOM_INFO\s+MCP\s+Query\s+Execution[^\n]*\n?/g, '')
          // Remove "Query returned no data:" error blocks
          .replace(/Query returned no data:[\s\S]*?(?=\n\n|\n#{1,3}\s|$)/g, '')
          // Remove inlined result tables (### 📊 Query Results... through the end of the table)
          .replace(/###\s*📊\s*Query Results[\s\S]*?(?=\n\n(?:#{1,3}\s|\*\*|$))/g, '')
          // Remove "Query Results (N records):" blocks and their markdown tables
          .replace(/Query Results\s*\(\d+\s*records?\):[\s\S]*?(?=\n\n(?:#{1,3}\s|\*\*|[A-Z])|$)/g, '')
          // Remove raw JSON arrays that were inlined as results
          .replace(/\n```json\n[\s\S]*?\n```\n?/g, '\n')
          // Collapse excessive blank lines
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Split recommendation content into markdown + DQL sections
        // Extract only the DQL queries (not results) into executable notebook tiles
        const recoSections: { type: 'markdown' | 'dql'; content: string }[] = [];

        // First pass: extract fenced code blocks (```dql or ```sql or ```)
        // Second pass: extract unfenced DQL statements (lines starting with fetch/timeseries)
        const dqlBlockRe = /```(?:dql|sql)?[ \t]*\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = dqlBlockRe.exec(cleanText)) !== null) {
          const dql = match[1].trim();
          const dqlBody = stripDqlComments(dql);
          if (dqlBody.startsWith('fetch ') || dqlBody.startsWith('timeseries ')) {
            const before = cleanText.slice(lastIndex, match.index).trim();
            if (before) recoSections.push({ type: 'markdown', content: before });
            recoSections.push({ type: 'dql', content: dqlBody });
            lastIndex = match.index + match[0].length;
          }
        }
        const afterFenced = cleanText.slice(lastIndex).trim();

        // If no fenced DQL blocks were found, scan for unfenced DQL statements in the text
        // (Davis CoPilot sometimes returns DQL as inline text without code fences)
        if (recoSections.length === 0 && afterFenced) {
          const lines = afterFenced.split('\n');
          let mdBuffer: string[] = [];
          let dqlBuffer: string[] = [];
          let inDql = false;

          for (const line of lines) {
            const trimmed = line.trim();
            const isDqlStart = /^(?:fetch |timeseries )/.test(trimmed);
            const isDqlContinuation = inDql && /^\|/.test(trimmed);

            if (isDqlStart || isDqlContinuation) {
              if (!inDql && mdBuffer.length > 0) {
                recoSections.push({ type: 'markdown', content: mdBuffer.join('\n').trim() });
                mdBuffer = [];
              }
              inDql = true;
              dqlBuffer.push(trimmed);
            } else {
              if (inDql && dqlBuffer.length > 0) {
                recoSections.push({ type: 'dql', content: dqlBuffer.join(' ') });
                dqlBuffer = [];
                inDql = false;
              }
              mdBuffer.push(line);
            }
          }
          // Flush remaining buffers
          if (dqlBuffer.length > 0) {
            recoSections.push({ type: 'dql', content: dqlBuffer.join(' ') });
          }
          if (mdBuffer.length > 0) {
            const md = mdBuffer.join('\n').trim();
            if (md) recoSections.push({ type: 'markdown', content: md });
          }
        } else if (afterFenced) {
          recoSections.push({ type: 'markdown', content: afterFenced });
        }

        // If still nothing, just use the cleaned text as a single markdown section
        if (recoSections.length === 0) {
          recoSections.push({ type: 'markdown', content: cleanText });
        }

        // Final pass: strip "Query Results (N records):" blocks and markdown tables
        // from all markdown sections (these are inlined execution results)
        const cleanMarkdownSection = (md: string): string => {
          const lines = md.split('\n');
          const out: string[] = [];
          let skipping = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detect "Query Results (N records):" — start skipping
            if (/^(\*\*)?Query Results/i.test(trimmed)) {
              skipping = true;
              continue;
            }

            if (skipping) {
              // Skip "No records returned", blank lines, and markdown table rows
              if (trimmed === '' || /^No records returned$/i.test(trimmed) || trimmed.startsWith('|')) {
                continue;
              }
              // Non-table, non-empty line — stop skipping
              skipping = false;
            }

            out.push(line);
          }

          return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        };

        const cleanedRecoSections = recoSections.map(s =>
          s.type === 'markdown' ? { ...s, content: cleanMarkdownSection(s.content) } : s
        ).filter(s => s.content.length > 0);

        const sections: { type: 'markdown' | 'dql'; content: string }[] = [
          { type: 'markdown', content: `# ${lastQuery.label}\n\nGenerated from the Query Explorer with AI recommendations.` },
          { type: 'markdown', content: `## Original Query` },
          { type: 'dql', content: lastQuery.dql },
          { type: 'markdown', content: `## Recommendations` },
          ...cleanedRecoSections,
        ];

        const result = await createNotebook(`${lastQuery.label} — Analysis`, sections);
        if (result.status === 'success' && result.notebookId) {
          const envUrl = getEnvironmentUrl().replace(/\/$/, '');
          window.open(`${envUrl}/ui/apps/dynatrace.notebooks/notebook/${result.notebookId}`, '_blank');
          setRecommendation({
            role: 'assistant',
            content: `**Notebook created successfully.** Opening in a new tab...\n\n${recoText}`,
          });
        } else {
          setRecommendation({ role: 'error', content: `Failed to create notebook: ${result.message}` });
        }
      } else {
        // External MCP mode — ask Claude to use the create-notebook tool
        const fileRefs = getDocumentFileRefs();
        const kbSummary = fileRefs.length > 0 ? undefined : buildKBSummary(placeholderValues);

        const prompt = [
          `Create a Dynatrace Notebook using the create-notebook tool.`,
          ``,
          `**Notebook title:** ${lastQuery.label} — Analysis`,
          ``,
          `RULES:`,
          `- Every DQL query MUST be an executable DQL code section (type "code", language "dql"), NOT markdown code blocks.`,
          `- Do NOT validate or run any queries before creating the notebook — just create it directly in a single create-notebook call.`,
          `- Do NOT call execute-dql. Only call create-notebook once with all sections.`,
          `- Each DQL code section should have a markdown section above it explaining what it investigates.`,
          `- Entity types in DQL are lowercase: dt.entity.service, dt.entity.host, etc.`,
          `- Valid entity fields: entity.name, id, entity.detected_name, lifetime, tags, managementZones.`,
          ``,
          `NOTEBOOK SECTIONS:`,
          ``,
          `1. Markdown: Title "${lastQuery.label}" with brief context`,
          ``,
          `2. DQL code section — the original query:`,
          lastQuery.dql,
          ``,
          `3. Markdown: "Root Cause Analysis" — followed by 2-3 DQL code sections that:`,
          `   - Break down errors/issues by time period (hourly bins)`,
          `   - Correlate with related services or dependencies`,
          `   - Analyse by key dimensions (customer, region, type)`,
          ``,
          `4. Markdown: "Impact Assessment" — followed by 1-2 DQL code sections for:`,
          `   - Quantifying affected transactions/users`,
          `   - Comparison with baseline periods`,
          ``,
          `5. Markdown: "Recommendations" containing:`,
          recommendation.content.slice(0, 3000),
          ``,
          ...(kbSummary ? [
            `Context from reference docs: ${kbSummary}`,
            `Reference architecture components, SLAs, and entity names from docs where relevant.`,
          ] : []),
        ].join('\n');

        const result = await sendChat(prompt, [], undefined, fileRefs.length > 0 ? fileRefs : undefined);

        if (result.status === 'success') {
          const urlMatch = result.response?.match(/notebook\/([a-zA-Z0-9-]+)/);
          if (urlMatch) {
            const envUrl = getEnvironmentUrl().replace(/\/$/, '');
            window.open(`${envUrl}/ui/apps/dynatrace.notebooks/notebook/${urlMatch[1]}`, '_blank');
          }
          setRecommendation({ role: 'assistant', content: result.response || 'Notebook created successfully.' });
          const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
          const entry = `## Notebook: ${lastQuery.label} — ${timestamp}\n\nNotebook generated with root-cause analysis and impact assessment.\n\n${recommendation.content.slice(0, 1500)}`;
          appendToKBDocument('discovered-findings.md', entry).catch(() => {/* best-effort */});
        } else {
          setRecommendation({ role: 'error', content: `Failed to create notebook: ${result.message}` });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setRecommendation({ role: 'error', content: `Failed to create notebook: ${msg}` });
    } finally {
      setNotebookGenerating(false);
    }
  };

  // Extract leading comment lines as a title and return the executable DQL body
  const parseDqlBlock = (dql: string): { title: string; body: string } => {
    const lines = dql.split('\n');
    const commentLines: string[] = [];
    let i = 0;
    while (i < lines.length && /^\s*(#|--|\/\/)/.test(lines[i])) {
      commentLines.push(lines[i].replace(/^\s*(#|--|\/\/)\s*/, '').trim());
      i++;
    }
    return {
      title: commentLines.filter(Boolean).join(' — '),
      body: lines.slice(i).join('\n').trim(),
    };
  };
  const stripDqlComments = (dql: string): string => parseDqlBlock(dql).body;

  // Fix common DQL syntax errors before execution
  const fixDqlSyntax = (dql: string): string => {
    let fixed = dql;
    // Fix "summarize ... by field" → "summarize ..., by:{field}"
    fixed = fixed.replace(/\|\s*summarize\s+(.+?)\s+by\s+(?!\{)(.+?)(?=\s*\||\s*$)/g, (_m, aggs, fields) => {
      return `| summarize ${aggs.replace(/,\s*$/, '')}, by:{${fields.trim()}}`;
    });
    // Fix "round(x, 2)" → "round(x, decimals:2)"
    fixed = fixed.replace(/round\(([^,]+),\s*(\d+)\)/g, 'round($1, decimals:$2)');
    // Fix "sort count desc" → "sort `count()` desc" (unquoted aggregation names)
    fixed = fixed.replace(/sort\s+count\s+(asc|desc)/gi, 'sort `count()` $1');
    // Fix bare "bin(timestamp, 1h)" inside by:{} → "time = bin(timestamp, 1h)" so the field is named
    fixed = fixed.replace(/by:\{([^}]*)\b(?<!\w\s*=\s*)bin\(timestamp,/g, (_m, prefix) => {
      return `by:{${prefix}time = bin(timestamp,`;
    });
    // Also fix "sort timestamp" → "sort time" when bin alias was applied
    if (fixed.includes('time = bin(timestamp,')) {
      fixed = fixed.replace(/\|\s*sort\s+timestamp\b/g, '| sort time');
    }
    // Fix infix "field contains "x"" → "contains(field, "x")" (contains is a function, not an operator)
    fixed = fixed.replace(/(\w+(?:\.\w+)*)\s+contains\s+"([^"]+)"/g, 'contains($1, "$2")');
    fixed = fixed.replace(/(\w+(?:\.\w+)*)\s+contains\s+'([^']+)'/g, "contains($1, '$2')");
    // Fix missing * operator: ") 100" → ") * 100"
    fixed = fixed.replace(/\)\s+(\d+(?:\.\d+)?)\s*(?=[,\n|)]|$)/g, ') * $1');
    return fixed;
  };

  const enrichRecommendationContent = async (text: string): Promise<string> => {
    const blocks: { fullMatch: string; dql: string; title: string; index: number }[] = [];

    // 1. Fenced code blocks: ```dql, ```sql, or plain ```
    const fencedRegex = /```(?:dql|sql|)[ \t]*\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = fencedRegex.exec(text)) !== null) {
      const raw = m[1].trim();
      const { title, body: dqlBody } = parseDqlBlock(raw);
      if (dqlBody.startsWith('fetch ') || dqlBody.startsWith('timeseries ')) {
        blocks.push({ fullMatch: m[0], dql: dqlBody, title, index: m.index });
      }
    }

    // 2. Parenthesised DQL: (fetch ... | ...) or (timeseries ... | ...)
    const parenRegex = /\(\s*((?:fetch |timeseries )[^)]+)\)/g;
    while ((m = parenRegex.exec(text)) !== null) {
      const dql = m[1].trim();
      const insideFenced = blocks.some((b) => m!.index >= b.index && m!.index < b.index + b.fullMatch.length);
      if (insideFenced) continue;
      if (dql.includes(' | ')) {
        blocks.push({ fullMatch: m[0], dql, title: '', index: m.index });
      }
    }

    // 3. Bare inline DQL: "fetch ... | ..." not in parens or code blocks
    const inlineRegex = /(?<![(\w])((?:fetch |timeseries )[^\n]*\|[^\n]*)/g;
    while ((m = inlineRegex.exec(text)) !== null) {
      const dql = m[1].trim();
      const insideExisting = blocks.some((b) => m!.index >= b.index && m!.index < b.index + b.fullMatch.length);
      if (insideExisting) continue;
      if (!/\|\s*(?:filter|summarize|fields|sort|limit|lookup|join|parse|append|compare|group|fieldsAdd|fieldsRemove|timeseries|makeTimeseries|countIf)/.test(dql)) continue;
      blocks.push({ fullMatch: m[0], dql, title: '', index: m.index });
    }

    if (blocks.length === 0) return text;

    // Sort by index and deduplicate overlaps
    blocks.sort((a, b) => a.index - b.index);
    const deduped: typeof blocks = [];
    for (const b of blocks) {
      const prev = deduped[deduped.length - 1];
      if (prev && b.index < prev.index + prev.fullMatch.length) continue;
      deduped.push(b);
    }

    // Process in reverse order so string indices stay valid
    let enriched = text;
    for (let i = deduped.length - 1; i >= 0; i--) {
      const { fullMatch, dql, title, index } = deduped[i];
      let insertText = '';
      try {
        // Step 1: Apply known syntax fixes
        let currentDql = fixDqlSyntax(dql);
        if (currentDql !== dql) {
          const lesson = `### Auto-corrected DQL\n**Bad:** \`${dql}\`\n**Fixed:** \`${currentDql}\`\n`;
          appendToKBDocument('dql-lessons.md', lesson).catch(() => {});
        }

        // Step 2: Execute, and if it fails with PARSE_ERROR, try to self-heal
        let result = await executeDql(currentDql, 50);
        let raw = result.result?.content?.[0]?.text || '';
        const errMsg = result.message || '';
        const isParseError = errMsg.includes('PARSE_ERROR') || errMsg.includes('DQL-ERROR');

        if (isParseError) {
          // Attempt Claude-based repair
          const repaired = await repairDqlWithClaude(currentDql, errMsg);
          if (repaired && repaired !== currentDql) {
            // Log the repair to KB
            const lesson = `### Claude-repaired DQL\n**Original:** \`${currentDql}\`\n**Error:** ${errMsg.slice(0, 300)}\n**Repaired:** \`${repaired}\`\n`;
            appendToKBDocument('dql-lessons.md', lesson).catch(() => {});
            // Retry with repaired query
            currentDql = repaired;
            result = await executeDql(currentDql, 50);
            raw = result.result?.content?.[0]?.text || '';
          } else {
            // No repair available — log the failure
            const lesson = `### Failed DQL Query (unfixable)\n**Query:** \`${currentDql}\`\n**Error:** ${errMsg.slice(0, 300)}\n`;
            appendToKBDocument('dql-lessons.md', lesson).catch(() => {});
          }
        }

        // Step 3: Format the result
        if (result.status === 'success' && raw && raw.length > 5) {
          let tableOutput = '';
          try {
            const records = JSON.parse(raw) as Record<string, unknown>[];
            if (Array.isArray(records) && records.length > 0) {
              const keys = Object.keys(records[0]);
              const header = '| ' + keys.join(' | ') + ' |';
              const sep = '| ' + keys.map(() => '---').join(' | ') + ' |';
              const rows = records.slice(0, 30).map((r) =>
                '| ' + keys.map((k) => {
                  const v = r[k];
                  return v === null || v === undefined ? '' : String(v);
                }).join(' | ') + ' |'
              );
              tableOutput = [header, sep, ...rows].join('\n');
              if (records.length > 30) tableOutput += `\n\n*(showing 30 of ${records.length} records)*`;
            } else {
              tableOutput = raw;
            }
          } catch {
            tableOutput = raw.length > 2000 ? raw.slice(0, 2000) + '\n...(truncated)' : raw;
          }
          insertText = `\n\n**Query Results** (${result.stats?.recordsReturned ?? '?'} records):\n\n${tableOutput}`;
        } else {
          const finalErr = result.message || 'No data returned';
          insertText = `\n\n*Query returned no data: ${finalErr}*`;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Query failed';
        insertText = `\n\n*Query error: ${errMsg}*`;
      }
      const endPos = index + fullMatch.length;
      const titlePrefix = title ? `\n\n**${title}**\n` : '';
      enriched = enriched.slice(0, index) + titlePrefix + enriched.slice(index, endPos) + insertText + enriched.slice(endPos);
    }
    return enriched;
  };

  /** Check if recommendation contains any failed or empty queries */
  const hasFailedQueries = (text: string): boolean =>
    /\*Query returned no data:.*\*|\*Query error:.*\*|\*Retry failed:.*\*|\*Retry error:.*\*|\*\*Query Results\*\*\s*\(0 records\)/.test(text);

  /**
   * Retry only the failed DQL queries in the recommendation.
   * For each failure: extract the DQL from the preceding code block,
   * send it + the error through repairDqlWithClaude, re-execute, and
   * replace the error text with the new result.
   */
  const retryFailedQueries = async (text: string): Promise<string> => {
    // Two-pass approach: find code blocks, then check what follows each one
    const codeBlockRegex = /```(?:dql|sql|)[ \t]*\n([\s\S]*?)```/g;
    const failures: { blockStart: number; blockEnd: number; dql: string; errorStart: number; errorEnd: number; errorMsg: string }[] = [];

    let cbMatch: RegExpExecArray | null;
    while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
      const blockStart = cbMatch.index;
      const blockEnd = cbMatch.index + cbMatch[0].length;
      const dqlRaw = cbMatch[1].trim();
      const dql = stripDqlComments(dqlRaw);
      if (!dql.startsWith('fetch ') && !dql.startsWith('timeseries ')) continue;

      // Look at text immediately after the code block for error/empty patterns
      const after = text.slice(blockEnd);

      // Pattern 1: *Query returned no data: ...*  or  *Query error: ...*  or  *Retry failed: ...*
      const errMatch = after.match(/^\s*\n\n(\*(?:Query returned no data|Query error|Retry failed|Retry error):[\s\S]*?\*)/);
      if (errMatch) {
        const errorStart = blockEnd + errMatch.index!;
        const errorEnd = errorStart + errMatch[0].length;
        failures.push({ blockStart, blockEnd, dql, errorStart, errorEnd, errorMsg: errMatch[1].replace(/^\*/, '').replace(/\*$/, '').trim() });
        continue;
      }

      // Pattern 2: **Query Results** (0 records):\n\nNo records returned
      const emptyMatch = after.match(/^\s*\n\n(\*\*Query Results\*\*\s*\(0 records\):?\s*\n\nNo records returned)/);
      if (emptyMatch) {
        const errorStart = blockEnd + emptyMatch.index!;
        const errorEnd = errorStart + emptyMatch[0].length;
        failures.push({ blockStart, blockEnd, dql, errorStart, errorEnd, errorMsg: 'Query returned 0 records' });
      }
    }

    if (failures.length === 0) return text;

    let result = text;
    // Process in reverse so indices stay valid
    for (let i = failures.length - 1; i >= 0; i--) {
      const { blockStart, blockEnd, dql, errorEnd, errorMsg } = failures[i];

      try {
        // Try to repair the DQL using the error message
        let fixedDql = dql;
        const repaired = await repairDqlWithClaude(dql, errorMsg);
        let addedToLearnings = false;
        if (repaired && repaired !== dql) {
          fixedDql = repaired;
          const lesson = `### Retry-repaired DQL\n**Original:** \`${dql}\`\n**Error:** ${errorMsg.slice(0, 300)}\n**Repaired:** \`${repaired}\`\n`;
          await appendToKBDocument('dql-lessons.md', lesson);
          addedToLearnings = true;
        }

        // Execute the (possibly repaired) query
        const execResult = await executeDql(fixedDql, 50);
        const raw = execResult.result?.content?.[0]?.text || '';

        if (execResult.status === 'success' && raw && raw.length > 5) {
          let tableOutput = '';
          try {
            const records = JSON.parse(raw) as Record<string, unknown>[];
            if (Array.isArray(records) && records.length > 0) {
              const keys = Object.keys(records[0]);
              const header = '| ' + keys.join(' | ') + ' |';
              const sep = '| ' + keys.map(() => '---').join(' | ') + ' |';
              const rows = records.slice(0, 30).map((r) =>
                '| ' + keys.map((k) => {
                  const v = r[k];
                  return v === null || v === undefined ? '' : String(v);
                }).join(' | ') + ' |'
              );
              tableOutput = [header, sep, ...rows].join('\n');
              if (records.length > 30) tableOutput += `\n\n*(showing 30 of ${records.length} records)*`;
            } else {
              tableOutput = raw;
            }
          } catch {
            tableOutput = raw.length > 2000 ? raw.slice(0, 2000) + '\n...(truncated)' : raw;
          }
          const learningNote = addedToLearnings ? '\n\n*📝 Query repaired and added to learnings*' : '';
          // Replace the old code block + error with the fixed code block + results
          const newBlock = fixedDql !== dql
            ? `\`\`\`dql\n${fixedDql}\n\`\`\`\n\n**Query Results** (${execResult.stats?.recordsReturned ?? '?'} records):\n\n${tableOutput}${learningNote}`
            : result.slice(blockStart, blockEnd) + `\n\n**Query Results** (${execResult.stats?.recordsReturned ?? '?'} records):\n\n${tableOutput}`;
          result = result.slice(0, blockStart) + newBlock + result.slice(errorEnd);
        } else {
          // Still failed — log and update error message
          const finalErr = execResult.message || 'No data returned';
          const lesson = `### Retry still failed\n**Query:** \`${fixedDql}\`\n**Error:** ${finalErr.slice(0, 300)}\n`;
          await appendToKBDocument('dql-lessons.md', lesson);
          const newErr = fixedDql !== dql
            ? `\`\`\`dql\n${fixedDql}\n\`\`\`\n\n*Retry failed: ${finalErr}*\n\n*📝 Added to learnings*`
            : result.slice(blockStart, blockEnd) + `\n\n*Retry failed: ${finalErr}*\n\n*📝 Added to learnings*`;
          result = result.slice(0, blockStart) + newErr + result.slice(errorEnd);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result = result.slice(0, blockEnd) + `\n\n*Retry error: ${msg}*` + result.slice(errorEnd);
      }
    }
    return result;
  };

  /** Save a recommendation to persistent history */
  const saveToHistory = (content: string, persona?: string) => {
    if (!lastQuery) return;
    addHistoryEntry({
      label: lastQuery.label,
      dql: lastQuery.dql,
      content,
      persona,
    }).then((entry) => {
      setHistoryEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
    }).catch(() => {/* best-effort */});
  };

  const handleExportRecommendationsMd = () => {
    if (!recommendation || recommendation.role !== 'assistant') return;
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const title = lastQuery?.label || 'Recommendations';
    const lines: string[] = [
      `# ${title}`,
      '',
      `> Exported on ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at ${now.toLocaleTimeString('en-GB')}`,
      '',
    ];
    if (lastQuery) {
      lines.push('## Query', '', '```dql', lastQuery.dql, '```', '');
    }
    lines.push('## AI Recommendations', '', recommendation.content, '');
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_ -]/g, '').trim().replace(/\s+/g, '_')}_${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGetRecommendations = async () => {
    if (!lastQuery || recoLoading) return;
    setRecoLoading(true);
    setRecommendation(null);
    try {
      // Pass file references if docs are synced to Anthropic, otherwise fall back to inline summary
      const fileRefs = getDocumentFileRefs();
      const kbSummary = fileRefs.length > 0 ? undefined : buildKBSummary(placeholderValues);
      const result: ChatResponse = await getRecommendations(lastQuery.label, lastQuery.dql, lastQuery.results, kbSummary || undefined, undefined, fileRefs.length > 0 ? fileRefs : undefined);
      if (result.status === 'success') {
        // Show initial recommendations immediately
        setRecommendation({ role: 'assistant', content: result.response, toolCalls: result.toolCalls });
        // Auto-run any DQL queries found in the recommendations
        setEnrichingReco(true);
        try {
          const enriched = await enrichRecommendationContent(result.response);
          setRecommendation({ role: 'assistant', content: enriched, toolCalls: result.toolCalls });
        } finally {
          setEnrichingReco(false);
        }
        // Auto-save findings to KB so the AI remembers them in future sessions
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `## ${lastQuery.label} — ${timestamp}\n\n**Query:** \`${lastQuery.dql.slice(0, 200)}\`\n\n${result.response.slice(0, 2000)}`;
        appendToKBDocument('discovered-findings.md', entry).catch(() => {/* best-effort */});
        saveToHistory(result.response, 'Davis');
      } else {
        setRecommendation({ role: 'error', content: `Recommendations failed: ${result.message}` });
      }
    } catch (err: unknown) {
      setRecommendation({ role: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
    } finally { setRecoLoading(false); }
  };

  const handleAskClaude = async () => {
    if (!lastQuery || recoLoading) return;
    setRecoLoading(true);
    setRecommendation(null);
    try {
      const kbContext = buildKBContext(placeholderValues);
      const result: ChatResponse = await getClaudeRecommendations(lastQuery.label, lastQuery.dql, lastQuery.results, kbContext || undefined);
      if (result.status === 'success') {
        setRecommendation({ role: 'assistant', content: result.response, toolCalls: result.toolCalls });
        setEnrichingReco(true);
        try {
          const enriched = await enrichRecommendationContent(result.response);
          setRecommendation({ role: 'assistant', content: enriched, toolCalls: result.toolCalls });
        } finally {
          setEnrichingReco(false);
        }
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `## ${lastQuery.label} (Claude) — ${timestamp}\n\n**Query:** \`${lastQuery.dql.slice(0, 200)}\`\n\n${result.response.slice(0, 2000)}`;
        appendToKBDocument('discovered-findings.md', entry).catch(() => {});
        saveToHistory(result.response, 'Claude');
      } else {
        setRecommendation({ role: 'error', content: `Claude analysis failed: ${result.message}` });
      }
    } catch (err: unknown) {
      setRecommendation({ role: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
    } finally { setRecoLoading(false); }
  };

  const handlePersonaAnalysis = async (persona: typeof ANALYSIS_PERSONAS[number]) => {
    if (!lastQuery || recoLoading) return;
    setRecoLoading(true);
    setRecommendation(null);
    try {
      const kbContext = buildKBContext(placeholderValues);
      const result: ChatResponse = await getClaudeRecommendations(
        lastQuery.label, lastQuery.dql, lastQuery.results, kbContext || undefined, persona.systemPrompt,
        (tc) => {
          // Show live MCP tool calls in the recommendation area
          const query = tc.input.query || '';
          const reason = tc.input.reason ? ` — ${tc.input.reason}` : '';
          setRecommendation((prev) => {
            const line = `🔧 \`${query}\`${reason}`;
            if (prev && prev.role === 'system') {
              return { role: 'system', content: prev.content + '\n' + line };
            }
            return { role: 'system', content: `**${persona.emoji} ${persona.name} is querying Dynatrace...**\n\n` + line };
          });
          // Log failed DQL queries to dql-lessons.md so future prompts can learn
          if (tc.output && (tc.output.startsWith('Query failed') || tc.output.startsWith('Query error') || tc.output.includes('FIELD_DOES_NOT_EXIST') || tc.output.includes('SYNTAX_ERROR') || tc.output.includes('UNKNOWN_FUNCTION') || tc.output.includes('PARSE_ERROR') || tc.output.includes('DQL-ERROR'))) {
            const lesson = `### Agentic DQL Error (${persona.name})\n**Query:** \`${query}\`\n**Error:** ${tc.output.slice(0, 400)}\n`;
            appendToKBDocument('dql-lessons.md', lesson).catch(() => {});
          }
        },
      );
      if (result.status === 'success') {
        setRecommendation({ role: 'assistant', content: result.response, toolCalls: result.toolCalls });
        setEnrichingReco(true);
        try {
          const enriched = await enrichRecommendationContent(result.response);
          setRecommendation({ role: 'assistant', content: enriched, toolCalls: result.toolCalls });
        } finally {
          setEnrichingReco(false);
        }
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `## ${lastQuery.label} (${persona.name}) — ${timestamp}\n\n**Query:** \`${lastQuery.dql.slice(0, 200)}\`\n\n${result.response.slice(0, 2000)}`;
        appendToKBDocument('discovered-findings.md', entry).catch(() => {});
        saveToHistory(result.response, persona.name);
      } else {
        setRecommendation({ role: 'error', content: `${persona.name} analysis failed: ${result.message}` });
      }
    } catch (err: unknown) {
      setRecommendation({ role: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
    } finally { setRecoLoading(false); }
  };

  const handleAIDiscovery = async () => {
    if (discoveryStatus === 'running') return;
    if (!connected) {
      await handleConnect();
    }
    setDiscoveryStatus('running');
    setDiscoveryMessage('');

    const allTasks = buildDiscoveryTasks(placeholderValues);
    if (allTasks.length === 0) { setDiscoveryStatus('error'); setDiscoveryMessage('No discovery tables found in documents.'); return; }

    // On re-run, only process tasks that haven't succeeded yet
    const pendingTasks = allTasks.filter((t) => !completedDiscoveryKeys.has(t.key));
    if (pendingTasks.length === 0) { setDiscoveryStatus('success'); setDiscoveryMessage('All tables already populated.'); return; }

    const newCompleted = new Set(completedDiscoveryKeys);

    // ── Phase 1: Generate DQL queries in small batches (3 tables per call) ──
    const BATCH_SIZE = 3;
    const queryPlans: { key: string; dql: string }[] = [];
    const totalBatches = Math.ceil(pendingTasks.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batchTasks = pendingTasks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      setDiscoveryMessage(`Generating DQL queries — batch ${b + 1}/${totalBatches} (${batchTasks.length} tables)...`);

      const queryPrompt = buildQueryGenerationPrompt(batchTasks);
      let batchPlans: { key: string; dql: string }[] = [];

      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const waitSec = Math.min(60, 15 * attempt);
          setDiscoveryMessage(`Batch ${b + 1}/${totalBatches}: retrying in ${waitSec}s (attempt ${attempt + 1})...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
        try {
          const chatResult = await sendChat(queryPrompt, []);
          if (chatResult.status === 'success' && chatResult.response) {
            const jsonStr = chatResult.response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            batchPlans = JSON.parse(jsonStr);
            break;
          }
          const msg = chatResult.message || '';
          if (msg.includes('429') || msg.includes('504') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('timeout')) continue;
          // Non-retryable error — skip this batch
          break;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          const retryable = msg.includes('429') || msg.includes('504') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('timeout');
          if (retryable && attempt < MAX_RETRIES - 1) continue;
          // JSON parse error or final attempt — skip this batch
          break;
        }
      }

      queryPlans.push(...batchPlans);

      // Pause between batches to avoid rate limits
      if (b < totalBatches - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (queryPlans.length === 0) {
      setDiscoveryStatus('error');
      setDiscoveryMessage('No query plans generated. Try again.');
      return;
    }

    // ── Phase 2: Run DQL queries, collect raw results per document ──
    setDiscoveryMessage(`Running ${queryPlans.length} DQL queries...`);

    const discoveryLog: string[] = [];
    // Group results by document name for Phase 3
    const resultsByDoc = new Map<string, { section: string; dql: string; rawResult: string }[]>();

    for (let i = 0; i < queryPlans.length; i++) {
      const plan = queryPlans[i];
      const task = allTasks.find((t) => t.key === plan.key);
      const label = task?.label || plan.key;
      setDiscoveryMessage(`Querying ${i + 1}/${queryPlans.length}: ${label}...`);

      // Throttle: max 5 tool calls per 20s → space them 4.5s apart
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 4500));
      }

      const sepIdx = plan.key.indexOf('::');
      const docName = sepIdx >= 0 ? plan.key.slice(0, sepIdx) : plan.key;
      const sectionName = sepIdx >= 0 ? plan.key.slice(sepIdx + 2) : '';

      try {
        const dqlResult = await executeDql(plan.dql, 50);
        if (dqlResult.status === 'success') {
          const rawText = dqlResult.result?.content?.[0]?.text || '';
          if (rawText && rawText.length > 5) {
            if (!resultsByDoc.has(docName)) resultsByDoc.set(docName, []);
            resultsByDoc.get(docName)!.push({ section: sectionName, dql: plan.dql, rawResult: rawText });
            discoveryLog.push(`✅ ${label}: data received`);
          } else {
            discoveryLog.push(`⚠️ ${label}: empty result`);
          }
        } else {
          const errMsg = dqlResult.message || 'DQL query failed';
          discoveryLog.push(`❌ ${label}: ${errMsg}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        discoveryLog.push(`❌ ${label}: ${msg}`);
      }

      // Only save progress periodically (completed keys updated in Phase 3)
      setKbDocs(getKBDocuments());
    }

    // ── Phase 3: Ask Claude to update each document with its query results ──
    const docsToUpdate = Array.from(resultsByDoc.entries());
    if (docsToUpdate.length === 0) {
      setDiscoveryStatus('error');
      setDiscoveryMessage(`No query results to populate.\n${discoveryLog.join('\n')}`);
      return;
    }

    for (let d = 0; d < docsToUpdate.length; d++) {
      const [docName, sectionResults] = docsToUpdate[d];
      setDiscoveryMessage(`Updating document ${d + 1}/${docsToUpdate.length}: ${docName}...`);

      const doc = getKBDocuments().find((dd) => dd.name === docName);
      if (!doc) {
        discoveryLog.push(`⚠️ ${docName}: document not found, skipping update`);
        continue;
      }

      // Apply placeholder replacements before sending to Claude
      const resolvedContent = applyReplacements(doc.content, placeholderValues);

      // Build the results summary for this document
      const resultsSummary = sectionResults.map((r, idx) =>
        `### Result ${idx + 1}: ${r.section}\nDQL: \`${r.dql}\`\nRaw output:\n${r.rawResult.length > 3000 ? r.rawResult.substring(0, 3000) + '\n...(truncated)' : r.rawResult}`
      ).join('\n\n');

      const updatePrompt = [
        `You are updating a Dynatrace reference document with real data from DQL queries.`,
        ``,
        `Here is the current document:`,
        `\`\`\`markdown`,
        resolvedContent,
        `\`\`\``,
        ``,
        `Here are the DQL query results to populate into the document:`,
        resultsSummary,
        ``,
        `INSTRUCTIONS:`,
        `1. Find all tables that have template/placeholder rows (marked with "*(Add as discovered)*" or "⏳" or similar placeholder text) and replace them with REAL data rows from the query results above.`,
        `2. Match each query result to its corresponding section by the section name.`,
        `3. Keep the existing table headers — only replace the placeholder DATA rows with real data.`,
        `4. If a query returned JSON records, convert them to pipe-delimited markdown table rows matching the table's columns.`,
        `5. If a section already has real data (not placeholder rows), leave it as-is.`,
        `6. Keep ALL other content exactly as-is — headings, code blocks, notes, non-template tables, etc.`,
        `7. Do NOT add any commentary, explanation, or markdown fences around the output.`,
        `8. Return the COMPLETE updated document content, not just the changed parts.`,
      ].join('\n');

      const MAX_RETRIES = 3;
      let updated = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const waitSec = Math.min(60, 15 * attempt);
          setDiscoveryMessage(`Updating ${docName}: retrying in ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
        try {
          const chatResult = await sendChat(updatePrompt, []);
          if (chatResult.status === 'success' && chatResult.response) {
            // Strip any markdown fences Claude might wrap around the output
            let updatedContent = chatResult.response.trim();
            const fenceMatch = updatedContent.match(/^```(?:markdown)?\n([\s\S]*)\n```$/);
            if (fenceMatch) updatedContent = fenceMatch[1];

            // Sanity check: updated content should be at least 50% the size of original
            if (updatedContent.length >= resolvedContent.length * 0.5) {
              await addKBDocument(docName, updatedContent);
              discoveryLog.push(`📝 ${docName}: updated with ${sectionResults.length} section(s) of data`);
              updated = true;
            } else {
              discoveryLog.push(`⚠️ ${docName}: Claude response too short (${updatedContent.length} vs ${resolvedContent.length}), skipped`);
            }
            break;
          }
          const msg = chatResult.message || '';
          const retryable = msg.includes('429') || msg.includes('504') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('timeout');
          if (!retryable) {
            discoveryLog.push(`❌ ${docName}: ${msg}`);
            break;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          const retryable = msg.includes('429') || msg.includes('504') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('timeout');
          if (!retryable || attempt === MAX_RETRIES - 1) {
            discoveryLog.push(`❌ ${docName}: ${msg}`);
            break;
          }
        }
      }

      if (!updated) {
        discoveryLog.push(`⚠️ ${docName}: update failed after retries`);
      } else {
        // Mark all sections for this doc as completed
        for (const sr of sectionResults) {
          newCompleted.add(`${docName}::${sr.section}`);
        }
        setCompletedDiscoveryKeys(new Set(newCompleted));
        await saveDiscoveryStatus(Array.from(newCompleted));
      }

      // Pause between document updates
      if (d < docsToUpdate.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }

      setKbDocs(getKBDocuments());
    }

    setDiscoveryStatus('success');
    setDiscoveryMessage(`Discovery complete.\n${discoveryLog.join('\n')}`);
    // Refresh doc list and re-detect template rows (some may now be populated)
    setKbDocs(getKBDocuments());
    setDiscoveryPlaceholders(detectDiscoveryPlaceholders());
  };

  // handleLoadContext removed — file_ids are passed with each request now

  const handleChatSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      // Keep last 10 messages to avoid oversized payloads
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      // Include last query results so the LLM has context for follow-ups
      const queryContext = lastQuery
        ? `\n\n[Recent query context]\nQuery: ${lastQuery.label}\nDQL: ${lastQuery.dql}\nResults (truncated):\n${lastQuery.results.slice(0, 2000)}`
        : '';
      const enrichedMsg = queryContext ? msg + queryContext : msg;

      const fileRefs = getDocumentFileRefs();
      const result = await sendChat(enrichedMsg, history, undefined, fileRefs.length > 0 ? fileRefs : undefined, (tc) => {
        // Show live tool call progress as a system message
        const reason = tc.input.reason ? ` — ${tc.input.reason}` : '';
        const query = tc.input.query || '';
        setMessages((prev) => {
          // Update the existing "thinking" message if present, otherwise add one
          const last = prev[prev.length - 1];
          const line = `🔧 ${tc.tool}: \`${query}\`${reason}`;
          if (last && last.role === 'system' && last.content.startsWith('🔧')) {
            return [...prev.slice(0, -1), { role: 'system' as const, content: last.content + '\n' + line }];
          }
          return [...prev, { role: 'system' as const, content: line }];
        });
      });
      if (result.status === 'success') {
        // Remove the "thinking" system message and add the final response
        setMessages((prev) => {
          const cleaned = prev.filter((m) => !(m.role === 'system' && m.content.startsWith('🔧')));
          return [...cleaned, { role: 'assistant', content: result.response, toolCalls: result.toolCalls }];
        });
      } else {
        setMessages((prev) => [...prev, { role: 'error', content: result.message || 'Unknown error' }]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [...prev, { role: 'error', content: err instanceof Error ? err.message : 'Unknown error' }]);
    } finally { setLoading(false); }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  const handleSaveToKB = async (name: string, content: string) => {
    await addKBDocument(name, content);
    setKbDocs(getKBDocuments());
  };

  const handleKBFileUpload = async (files: FileList) => {
    setKbUploading(true);
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const text = await file.text();
      await addKBDocument(file.name, text);
    }
    setKbDocs(getKBDocuments());
    setPlaceholders(detectPlaceholders());
    setDiscoveryPlaceholders(detectDiscoveryPlaceholders());
    setKbUploading(false);

    // Auto-upload to Anthropic Files API (with placeholder replacements applied)
    const config = loadConfig();
    const anthropicKey = config.agent?.apiKey;
    if (anthropicKey) {
      const currentDocs = getKBDocuments();
      for (const file of fileArray) {
        setFileUploadStatus((prev) => ({ ...prev, [file.name]: 'uploading' }));
        try {
          const doc = currentDocs.find((d) => d.name === file.name);
          const content = applyReplacements(doc?.content ?? await file.text(), placeholderValues);
          await uploadDocToAnthropic(file.name, content, anthropicKey);
          setFileUploadStatus((prev) => ({ ...prev, [file.name]: 'done' }));
        } catch {
          setFileUploadStatus((prev) => ({ ...prev, [file.name]: 'error' }));
        }
      }
      setKbDocs(getKBDocuments());
    }
  };

  const handleKBRemove = async (name: string) => {
    // Delete from Anthropic if synced
    const config = loadConfig();
    const anthropicKey = config.agent?.apiKey;
    if (anthropicKey) {
      try { await deleteDocFromAnthropic(name, anthropicKey); } catch { /* best-effort */ }
    }
    await removeKBDocument(name);
    setKbDocs(getKBDocuments());
    setPlaceholders(detectPlaceholders());
    setDiscoveryPlaceholders(detectDiscoveryPlaceholders());
  };

  const handlePlaceholderChange = (token: string, value: string) => {
    setPlaceholderValues((prev) => {
      const next = { ...prev, [token]: value };
      savePlaceholderValues(next);
      return next;
    });
  };

  const handleAutoResolvePlaceholders = async () => {
    if (resolvingPlaceholders || placeholders.length === 0) return;
    if (!connected) await handleConnect();
    setResolvingPlaceholders(true);

    // Only resolve unfilled placeholders
    const unfilled = placeholders.filter((ph) => !placeholderValues[ph.token]?.trim());
    if (unfilled.length === 0) { setResolvingPlaceholders(false); return; }

    const prompt = [
      `I have reference documents with placeholder tokens that need to be replaced with real values from my Dynatrace environment.`,
      `Use your MCP tools to query Dynatrace and figure out the correct value for each placeholder below.`,
      ``,
      `Placeholders to resolve:`,
      ...unfilled.map((ph) => `- ${ph.token} (friendly name: "${ph.friendlyName}", appears ${ph.occurrences} time${ph.occurrences === 1 ? '' : 's'})`),
      ``,
      `Guidelines:`,
      `- [TENANT_ID] or [ENVIRONMENT_ID]: use the Dynatrace environment/tenant ID`,
      `- [CLIENT_NAME] or [COMPANY_NAME]: use the Dynatrace environment name or organisation name`,
      `- [ENVIRONMENT_URL]: use the Dynatrace environment URL`,
      `- For entity-related placeholders: query the relevant entity type and use the most prominent result`,
      `- For date/time placeholders: use today's date in ISO format`,
      `- If you genuinely cannot determine a value, use "UNKNOWN" as the value`,
      ``,
      `Return ONLY a valid JSON object (no markdown fences, no explanation) mapping each placeholder token to its resolved value.`,
      `Example: {"[TENANT_ID]": "abc12345", "[CLIENT_NAME]": "Acme Corp"}`,
    ].join('\n');

    try {
      const result = await sendChat(prompt, []);
      if (result.status === 'success' && result.response) {
        // Extract JSON from response (may be wrapped in markdown fences)
        const jsonStr = result.response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const resolved: Record<string, string> = JSON.parse(jsonStr);

        // Apply resolved values
        setPlaceholderValues((prev) => {
          const next = { ...prev };
          for (const [token, value] of Object.entries(resolved)) {
            if (value && value !== 'UNKNOWN') {
              next[token] = value;
            }
          }
          savePlaceholderValues(next);
          return next;
        });
      }
    } catch {
      // Silently fail — user can still fill manually
    } finally {
      setResolvingPlaceholders(false);
    }
  };

  // Merge built-in + custom categories for the explorer
  // Custom categories can override built-in ones (same id) or be entirely new
  const allCategories: Category[] = (() => {
    const customIds = new Set(customCategories.map((c) => c.id));
    const base = CATEGORIES.map((c) => customIds.has(c.id) ? customCategories.find((cc) => cc.id === c.id)! : c);
    const added = customCategories.filter((c) => !CATEGORIES.some((b) => b.id === c.id));
    return [...base, ...added];
  })();
  const activeCat = allCategories.find((c) => c.id === selectedCategory) || allCategories[0];
  const disabled = loading || !connected;

  // ─── KB PANEL VIEW ───
  if (viewMode === 'kb') {
    return (
      <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
        <TitleBar>
          <TitleBar.Title>Knowledge Base</TitleBar.Title>
          <TitleBar.Subtitle>
            {kbDocs.length} document{kbDocs.length === 1 ? '' : 's'} uploaded
          </TitleBar.Subtitle>
          <TitleBar.Action>
            <button onClick={() => setViewMode('explorer')} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              ← Back to Explorer
            </button>
          </TitleBar.Action>
        </TitleBar>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Upload area */}
          <div
            onClick={() => kbFileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleKBFileUpload(e.dataTransfer.files); }}
            style={{
              padding: '28px 20px',
              borderRadius: 10,
              border: '2px dashed var(--dt-colors-border-neutral-default, #ccc)',
              background: 'var(--dt-colors-background-surface-default, #f8f8fb)',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 20,
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
              {kbUploading ? 'Uploading...' : 'Click or drag files here to upload'}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              Supports .md, .markdown, and .txt files • Multiple files supported
            </div>
            <input
              ref={kbFileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) { handleKBFileUpload(e.target.files); e.target.value = ''; } }}
            />
          </div>

          {/* Document list */}
          {kbDocs.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 40, fontSize: 13 }}>
              No documents uploaded yet. Upload .md files to provide context for AI recommendations.
            </div>
          )}

          {kbDocs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
                Uploaded Documents
              </div>
              {kbDocs.map((doc) => {
                const syncStatus = getDocSyncStatus(doc.name);
                const uploadStatus = fileUploadStatus[doc.name];
                const isSynced = syncStatus === 'synced';

                return (
                <div
                  key={doc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid ' + (isSynced ? 'rgba(0,168,107,0.3)' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'),
                    background: isSynced ? 'rgba(0,168,107,0.04)' : 'var(--dt-colors-background-base-default, #fff)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{isSynced ? '☁️' : '📄'}</span>
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => setViewingDoc(doc)}
                    title="Click to view document"
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.15)', textUnderlineOffset: '2px' }}>
                      {doc.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {(doc.content.length / 1024).toFixed(1)} KB • {new Date(doc.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {isSynced && doc.fileId ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: '#00a86b',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}>
                      ✓ {doc.fileId}
                    </span>
                  ) : uploadStatus === 'uploading' ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: '#ff9500',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}>
                      ↻ Uploading...
                    </span>
                  ) : uploadStatus === 'error' ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: '#e32017',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}>
                      ✕ Failed
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: '#e0e0e0',
                      color: '#666',
                      whiteSpace: 'nowrap',
                    }}>
                      Not synced
                    </span>
                  )}
                  <button
                    onClick={() => handleKBRemove(doc.name)}
                    title="Remove document"
                    style={{
                      background: 'none',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: '#c62828',
                      fontSize: 12,
                      padding: '4px 10px',
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
                );
              })}

              {/* Upload status summary */}
              {(() => {
                const totalDocs = kbDocs.length;
                const syncedDocs = kbDocs.filter((d) => getDocSyncStatus(d.name) === 'synced').length;
                const config = loadConfig();
                const usingGitHub = config.llmProvider === 'github-models';
                const anthropicKey = config.claudeApiKey || config.agent?.apiKey || '';
                const hasApiKey = usingGitHub ? !!config.githubPat : !!anthropicKey;
                const allSynced = usingGitHub ? true : (syncedDocs === totalDocs && totalDocs > 0);
                const hasPending = usingGitHub ? false : (syncedDocs < totalDocs);
                const vectorStats = getVectorIndexStats();
                const kbIsIndexed = isKBIndexed();

                return (
                <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,168,107,0.08) 0%, rgba(0,152,212,0.08) 100%)', border: '1px solid ' + (allSynced ? 'rgba(0,168,107,0.3)' : 'rgba(0,152,212,0.25)') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                        {usingGitHub
                          ? kbIsIndexed
                            ? `✅ ${totalDocs} doc${totalDocs === 1 ? '' : 's'} indexed — ${vectorStats.totalChunks} chunks in vector store`
                            : `📄 ${totalDocs} document${totalDocs === 1 ? '' : 's'} — not yet indexed`
                          : allSynced
                            ? `✅ All ${totalDocs} document${totalDocs === 1 ? '' : 's'} synced to Claude`
                            : `☁️ ${syncedDocs}/${totalDocs} document${totalDocs === 1 ? '' : 's'} synced`}
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {usingGitHub
                          ? kbIsIndexed
                            ? 'KB documents are embedded and only relevant chunks are injected per query (RAG). Re-index after editing docs.'
                            : 'Click Index to embed your KB documents. Only relevant chunks will be sent per query, saving tokens.'
                          : !hasApiKey
                            ? 'Set your Anthropic API key in Settings to enable file syncing.'
                            : allSynced
                              ? 'All documents are uploaded to Anthropic and referenced by file_id in conversations.'
                              : `${totalDocs - syncedDocs} document${totalDocs - syncedDocs === 1 ? '' : 's'} pending upload. Click Sync to upload now.`}
                      </div>
                      {indexingDoc && <div style={{ fontSize: 10, color: '#6950a1', marginTop: 3 }}>Indexing: {indexingDoc}</div>}
                      {indexStatus && <div style={{ fontSize: 10, color: '#00a86b', marginTop: 3 }}>{indexStatus}</div>}
                    </div>
                    {usingGitHub && hasApiKey && totalDocs > 0 && (
                      <button
                        onClick={async () => {
                          if (indexing || !config.githubPat) return;
                          setIndexing(true);
                          setIndexStatus('');
                          setIndexingDoc('');
                          setSyncError('');
                          try {
                            const result = await indexAllDocuments(config.githubPat!, (docName, status) => {
                              setIndexingDoc(status === 'indexing' ? docName : '');
                            });
                            if (result.errors.length > 0) {
                              setSyncError(result.errors.join('\n'));
                            }
                            setIndexStatus(`Indexed ${result.indexed} chunk${result.indexed === 1 ? '' : 's'}, ${result.skipped} unchanged`);
                          } catch (err) {
                            setSyncError(err instanceof Error ? err.message : 'Indexing failed');
                          } finally {
                            setIndexing(false);
                            setIndexingDoc('');
                          }
                        }}
                        disabled={indexing}
                        style={{
                          ...recoBtnStyle,
                          fontSize: 13,
                          padding: '10px 18px',
                          background: indexing ? '#ccc' : kbIsIndexed ? '#00a86b' : '#1496ff',
                          cursor: indexing ? 'wait' : 'pointer',
                        }}
                      >
                        {indexing ? '⏳ Indexing...' : kbIsIndexed ? '🔄 Re-index KB' : '🔍 Index KB'}
                      </button>
                    )}
                    {!usingGitHub && hasApiKey && hasPending && (
                      <button
                        onClick={async () => {
                          if (!anthropicKey) return;
                          setSyncError('');
                          const pending = kbDocs.filter((d) => getDocSyncStatus(d.name) !== 'synced');
                          let lastError = '';
                          for (const doc of pending) {
                            setFileUploadStatus((prev) => ({ ...prev, [doc.name]: 'uploading' }));
                            try {
                              const content = applyReplacements(doc.content, placeholderValues);
                              await uploadDocToAnthropic(doc.name, content, anthropicKey);
                              setFileUploadStatus((prev) => ({ ...prev, [doc.name]: 'done' }));
                            } catch (err) {
                              lastError = err instanceof Error ? err.message : 'Unknown error';
                              setFileUploadStatus((prev) => ({ ...prev, [doc.name]: 'error' }));
                            }
                          }
                          if (lastError) setSyncError(lastError);
                          setKbDocs(getKBDocuments());
                        }}
                        style={{
                          ...recoBtnStyle,
                          fontSize: 13,
                          padding: '10px 18px',
                          background: '#1496ff',
                        }}
                      >
                        ☁ Sync to Claude
                      </button>
                    )}
                  </div>
                </div>
                );
              })()}

              {syncError && (
                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(227,32,23,0.08)', border: '1px solid rgba(227,32,23,0.2)', fontSize: 11, color: '#c62828', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  ✕ Sync error: {syncError}
                </div>
              )}

              {/* DQL Auto-Populate — no AI needed */}
              <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,168,107,0.08) 0%, rgba(0,120,42,0.08) 100%)', border: '1px solid ' + (dqlPopStatus === 'success' ? 'rgba(0,168,107,0.3)' : dqlPopStatus === 'error' ? 'rgba(227,32,23,0.3)' : 'rgba(0,168,107,0.25)') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                      {dqlPopStatus === 'success' ? '✅ Auto-population complete' : dqlPopStatus === 'error' ? '❌ Auto-population failed' : dqlPopStatus === 'running' ? '⏳ Auto-populating...' : '⚡ Auto-Populate with DQL'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>
                      {dqlPopStatus === 'running'
                        ? (dqlPopProgress ? `${dqlPopProgress.phase}: ${dqlPopProgress.detail}` : 'Starting...')
                        : dqlPopStatus === 'success' || dqlPopStatus === 'error'
                          ? dqlPopMessage
                          : 'Run DQL queries directly against your environment to populate reference docs. No AI or API keys needed.'}
                    </div>
                    {dqlPopStatus === 'running' && dqlPopProgress && (
                      <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'var(--dt-colors-border-neutral-default, #e0e0e0)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${dqlPopProgress.pct}%`, background: '#00a86b', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (dqlPopStatus === 'running') return;
                      setDqlPopStatus('running');
                      setDqlPopMessage('');
                      setDqlPopProgress(null);
                      try {
                        const result = await autoPopulateKB((progress) => {
                          setDqlPopProgress({ ...progress });
                        });
                        setKbDocs(getKBDocuments());
                        setDiscoveryPlaceholders(detectDiscoveryPlaceholders());
                        const parts: string[] = [];
                        if (result.updated.length) parts.push(`Updated: ${result.updated.join(', ')}`);
                        if (result.errors.length) parts.push(`\nWarnings: ${result.errors.join('; ')}`);
                        setDqlPopMessage(parts.join('\n') || 'Complete — no changes needed');
                        setDqlPopStatus(result.errors.length > 0 && result.updated.length === 0 ? 'error' : 'success');
                      } catch (err) {
                        setDqlPopMessage(err instanceof Error ? err.message : 'Auto-populate failed');
                        setDqlPopStatus('error');
                      } finally {
                        setDqlPopProgress(null);
                      }
                    }}
                    disabled={dqlPopStatus === 'running'}
                    style={{
                      ...recoBtnStyle,
                      fontSize: 13,
                      padding: '10px 18px',
                      background: dqlPopStatus === 'success' ? '#00a86b' : dqlPopStatus === 'error' ? '#e32017' : '#00782A',
                      opacity: dqlPopStatus === 'running' ? 0.5 : 1,
                      cursor: dqlPopStatus === 'running' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {dqlPopStatus === 'running' ? '⏳ Running...' : dqlPopStatus === 'success' ? '🔄 Re-run' : dqlPopStatus === 'error' ? '🔄 Retry' : '⚡ Populate'}
                  </button>
                </div>
              </div>

              {/* AI Discovery — populate *(Add as discovered)* template rows */}
              {discoveryPlaceholders.length > 0 && (
              <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(20,150,255,0.08) 0%, rgba(105,80,161,0.08) 100%)', border: '1px solid ' + (discoveryStatus === 'success' ? 'rgba(0,168,107,0.3)' : discoveryStatus === 'error' ? 'rgba(227,32,23,0.3)' : 'rgba(20,150,255,0.25)') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                      {discoveryStatus === 'success' && completedDiscoveryKeys.size > 0 ? '✅ Template tables populated' : discoveryStatus === 'error' ? '❌ Discovery failed' : discoveryStatus === 'running' ? '⏳ Populating tables...' : '🔍 Populate template tables'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>
                      {discoveryStatus === 'running'
                        ? discoveryMessage || 'Starting discovery...'
                        : discoveryStatus === 'success'
                          ? discoveryMessage
                          : discoveryStatus === 'error'
                            ? discoveryMessage
                            : `${discoveryPlaceholders.length} template row${discoveryPlaceholders.length === 1 ? '' : 's'} found. Run discovery to populate them with real Dynatrace data.`}
                    </div>
                  </div>
                  <button
                    onClick={handleAIDiscovery}
                    disabled={discoveryStatus === 'running'}
                    style={{
                      ...recoBtnStyle,
                      fontSize: 13,
                      padding: '10px 18px',
                      background: discoveryStatus === 'success' ? '#00a86b' : discoveryStatus === 'error' ? '#e32017' : '#6950a1',
                      opacity: discoveryStatus === 'running' ? 0.5 : 1,
                      cursor: discoveryStatus === 'running' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {discoveryStatus === 'running' ? '⏳ Running...' : discoveryStatus === 'success' ? '🔄 Re-run' : discoveryStatus === 'error' ? '🔄 Retry' : '🔍 Discover'}
                  </button>
                </div>
              </div>
              )}
            </div>
          )}
        </div>

        {/* Document viewer overlay */}
        {viewingDoc && (
          <>
            <div
              onClick={() => setViewingDoc(null)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 50,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 20,
                left: 20,
                right: 20,
                bottom: 20,
                background: 'var(--dt-colors-background-base-default, #fff)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                zIndex: 51,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Viewer header */}
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 16 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {viewingDoc.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {(viewingDoc.content.length / 1024).toFixed(1)} KB • {new Date(viewingDoc.addedAt).toLocaleDateString()} • Read-only
                  </div>
                </div>
                <button
                  onClick={() => setViewingDoc(null)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '6px 14px',
                    color: 'var(--dt-colors-text-primary-default, #666)',
                  }}
                >
                  ✕ Close
                </button>
              </div>
              {/* Viewer content — lightweight markdown rendering */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
                  userSelect: 'text',
                }}
              >
                {(() => {
                  const raw = applyReplacements(viewingDoc.content, placeholderValues);
                  const lines = raw.split('\n');
                  const elements: React.ReactNode[] = [];
                  let i = 0;

                  // Inline formatting helper
                  const renderInline = (text: string): React.ReactNode => {
                    // Bold + italic, bold, italic, inline code, links
                    const parts: React.ReactNode[] = [];
                    // eslint-disable-next-line no-useless-escape
                    const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*\(([^)]+)\)\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
                    let lastIdx = 0;
                    let m: RegExpExecArray | null;
                    let pIdx = 0;
                    while ((m = re.exec(text)) !== null) {
                      if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
                      if (m[2]) parts.push(<strong key={pIdx}><em>{m[2]}</em></strong>);
                      else if (m[3]) parts.push(<strong key={pIdx}>{m[3]}</strong>);
                      else if (m[4]) {
                        // *(Add as discovered)* style — highlight as pending
                        parts.push(
                          <span key={pIdx} style={{ background: 'rgba(255,149,0,0.15)', color: '#b36305', padding: '1px 4px', borderRadius: 3, fontSize: 11, fontStyle: 'italic' }}>
                            ⏳ {m[4]}
                          </span>
                        );
                      }
                      else if (m[5]) parts.push(<em key={pIdx}>{m[5]}</em>);
                      else if (m[6]) parts.push(<code key={pIdx} style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: "'SF Mono', monospace", fontSize: 11 }}>{m[6]}</code>);
                      else if (m[7] && m[8]) parts.push(<span key={pIdx} style={{ color: '#1496ff', textDecoration: 'underline' }}>{m[7]}</span>);
                      pIdx++;
                      lastIdx = m.index + m[0].length;
                    }
                    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
                    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
                  };

                  while (i < lines.length) {
                    const line = lines[i];

                    // Code block
                    if (line.startsWith('```')) {
                      const lang = line.slice(3).trim();
                      const codeLines: string[] = [];
                      i++;
                      while (i < lines.length && !lines[i].startsWith('```')) {
                        codeLines.push(lines[i]);
                        i++;
                      }
                      i++; // skip closing ```
                      elements.push(
                        <pre key={elements.length} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '12px 14px', margin: '8px 0', overflowX: 'auto', fontFamily: "'SF Mono', monospace", fontSize: 11, lineHeight: 1.5 }}>
                          {lang && <div style={{ fontSize: 10, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>{lang}</div>}
                          <code>{codeLines.join('\n')}</code>
                        </pre>
                      );
                      continue;
                    }

                    // Headings
                    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
                    if (headingMatch) {
                      const level = headingMatch[1].length;
                      const sizes = [22, 18, 15, 14, 13, 12];
                      elements.push(
                        <div key={elements.length} style={{ fontSize: sizes[level - 1], fontWeight: 700, marginTop: level <= 2 ? 20 : 12, marginBottom: 6, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', borderBottom: level <= 2 ? '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' : undefined, paddingBottom: level <= 2 ? 6 : undefined }}>
                          {renderInline(headingMatch[2])}
                        </div>
                      );
                      i++;
                      continue;
                    }

                    // Table
                    if (line.startsWith('|') && line.includes('|')) {
                      const tableLines: string[] = [];
                      while (i < lines.length && lines[i].startsWith('|')) {
                        tableLines.push(lines[i]);
                        i++;
                      }
                      // Parse: header, separator, rows
                      const parseRow = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim());
                      const header = parseRow(tableLines[0]);
                      const isSep = (r: string) => /^\|[\s:|-]+\|$/.test(r);
                      const dataStart = tableLines.length > 1 && isSep(tableLines[1]) ? 2 : 1;
                      const rows = tableLines.slice(dataStart).map(parseRow);

                      elements.push(
                        <div key={elements.length} style={{ overflowX: 'auto', margin: '8px 0' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr>
                                {header.map((h, hi) => (
                                  <th key={hi} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid var(--dt-colors-border-neutral-default, #ccc)', fontWeight: 700, fontSize: 11, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', whiteSpace: 'nowrap' }}>
                                    {renderInline(h)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, ri) => {
                                const isTemplate = row.some((c) => /\*\([^)]+\)\*/.test(c));
                                return (
                                  <tr key={ri} style={{ background: isTemplate ? 'rgba(255,149,0,0.06)' : ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    {row.map((cell, ci) => (
                                      <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 12 }}>
                                        {renderInline(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                      continue;
                    }

                    // Horizontal rule
                    if (/^---+$/.test(line.trim())) {
                      elements.push(<hr key={elements.length} style={{ border: 'none', borderTop: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', margin: '12px 0' }} />);
                      i++;
                      continue;
                    }

                    // Bullet list
                    if (/^[\s]*[-*+]\s/.test(line)) {
                      const items: string[] = [];
                      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
                        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ''));
                        i++;
                      }
                      elements.push(
                        <ul key={elements.length} style={{ margin: '6px 0', paddingLeft: 24 }}>
                          {items.map((item, idx) => <li key={idx} style={{ marginBottom: 3 }}>{renderInline(item)}</li>)}
                        </ul>
                      );
                      continue;
                    }

                    // Numbered list
                    if (/^\s*\d+\.\s/.test(line)) {
                      const items: string[] = [];
                      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
                        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
                        i++;
                      }
                      elements.push(
                        <ol key={elements.length} style={{ margin: '6px 0', paddingLeft: 24 }}>
                          {items.map((item, idx) => <li key={idx} style={{ marginBottom: 3 }}>{renderInline(item)}</li>)}
                        </ol>
                      );
                      continue;
                    }

                    // Blank line
                    if (!line.trim()) {
                      elements.push(<div key={elements.length} style={{ height: 8 }} />);
                      i++;
                      continue;
                    }

                    // Normal paragraph
                    elements.push(
                      <div key={elements.length} style={{ marginBottom: 4 }}>
                        {renderInline(line)}
                      </div>
                    );
                    i++;
                  }

                  return elements;
                })()}
              </div>
            </div>
          </>
        )}
      </Flex>
    );
  }

  // ─── PRE-BUILT QUERIES VIEW ───
  if (viewMode === 'queries') {
    // Merge defaults + custom for display (deduplicated — overrides replace built-ins)
    const customIds = new Set(customCategories.map((c) => c.id));
    const allCats: CustomCategory[] = [
      ...CATEGORIES.map((c) => customIds.has(c.id) ? { ...customCategories.find((cc) => cc.id === c.id)! } : { ...c }),
      ...customCategories.filter((c) => !CATEGORIES.some((b) => b.id === c.id)),
    ];

    const isCustom = (catId: string) => !CATEGORIES.some((c) => c.id === catId);
    const isOverridden = (catId: string) => !isCustom(catId) && customIds.has(catId);

    const handleSaveQueryEdit = async (catId: string, qIdx: number, form: { label: string; emoji: string; query: string }) => {
      const updated = allCats.map((c) => {
        if (c.id !== catId) return c;
        const qs = [...c.queries];
        qs[qIdx] = { ...form };
        return { ...c, queries: qs };
      });
      // Split back into defaults-overrides and custom
      const builtInIds = new Set(CATEGORIES.map((c) => c.id));
      const overrides = updated.filter((c) => builtInIds.has(c.id));
      const custom = updated.filter((c) => !builtInIds.has(c.id));
      // For built-in categories that were edited, save them as custom overrides
      const toSave = [...custom, ...overrides.filter((o) => {
        const orig = CATEGORIES.find((c) => c.id === o.id);
        return JSON.stringify(orig) !== JSON.stringify(o);
      })];
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
      setEditingQuery(null);
    };

    const handleDeleteQuery = async (catId: string, qIdx: number) => {
      const updated = allCats.map((c) => {
        if (c.id !== catId) return c;
        const qs = c.queries.filter((_, i) => i !== qIdx);
        return { ...c, queries: qs };
      });
      const builtInIds = new Set(CATEGORIES.map((c) => c.id));
      const overrides = updated.filter((c) => builtInIds.has(c.id));
      const custom = updated.filter((c) => !builtInIds.has(c.id));
      const toSave = [...custom, ...overrides.filter((o) => {
        const orig = CATEGORIES.find((c) => c.id === o.id);
        return JSON.stringify(orig) !== JSON.stringify(o);
      })];
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
    };

    const handleAddQuery = async (catId: string, form: { label: string; emoji: string; query: string }) => {
      const updated = allCats.map((c) => {
        if (c.id !== catId) return c;
        return { ...c, queries: [...c.queries, { ...form }] };
      });
      const builtInIds = new Set(CATEGORIES.map((c) => c.id));
      const overrides = updated.filter((c) => builtInIds.has(c.id));
      const custom = updated.filter((c) => !builtInIds.has(c.id));
      const toSave = [...custom, ...overrides.filter((o) => {
        const orig = CATEGORIES.find((c) => c.id === o.id);
        return JSON.stringify(orig) !== JSON.stringify(o);
      })];
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
      setAddingQueryTo(null);
    };

    const handleAddCategory = async (form: { label: string; emoji: string; color: string }) => {
      const id = `custom-${form.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const newCat: CustomCategory = { id, ...form, queries: [] };
      const toSave = [...customCategories, newCat];
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
      setAddingCategory(false);
    };

    const handleDeleteCategory = async (catId: string) => {
      const toSave = customCategories.filter((c) => c.id !== catId);
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
    };

    const handleResetCategory = async (catId: string) => {
      const toSave = customCategories.filter((c) => c.id !== catId);
      await saveCustomCategories(toSave);
      setCustomCategories(toSave);
    };

    return (
      <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
        <TitleBar>
          <TitleBar.Title>Pre-Built Queries</TitleBar.Title>
          <TitleBar.Subtitle>Manage categories and queries used in the Explorer</TitleBar.Subtitle>
          <TitleBar.Action>
            <button onClick={() => setViewMode('explorer')} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              ← Back to Explorer
            </button>
          </TitleBar.Action>
        </TitleBar>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {allCats.map((cat) => {
            const catIsCustom = isCustom(cat.id);
            const catIsOverridden = isOverridden(cat.id);

            return (
              <div key={cat.id} style={{ border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', borderRadius: 10 }}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: `${cat.color}14`, borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
                  <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: cat.color }}>{cat.label}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>({cat.queries.length} queries)</span>
                  {catIsCustom && <span style={{ fontSize: 10, background: '#1496ff', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>Custom</span>}
                  {catIsOverridden && <span style={{ fontSize: 10, background: '#FF9500', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>Modified</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {catIsOverridden && (
                      <button onClick={() => handleResetCategory(cat.id)} title="Reset to defaults" style={{ background: 'none', border: '1px solid #999', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#999' }}>↩ Reset</button>
                    )}
                    {catIsCustom && (
                      <button onClick={() => handleDeleteCategory(cat.id)} title="Delete category" style={{ background: 'none', border: '1px solid #E32017', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#E32017' }}>🗑 Delete</button>
                    )}
                  </div>
                </div>

                {/* Queries */}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cat.queries.map((q, qIdx) => {
                    const isEditing = editingQuery?.catId === cat.id && editingQuery.qIdx === qIdx;

                    if (isEditing) {
                      return (
                        <QueryEditForm
                          key={`edit-${qIdx}`}
                          initial={{ label: q.label, emoji: q.emoji, query: q.query }}
                          onSave={(form) => handleSaveQueryEdit(cat.id, qIdx, form)}
                          onCancel={() => setEditingQuery(null)}
                        />
                      );
                    }

                    return (
                      <div key={qIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', background: 'var(--dt-colors-background-surface-default, #f8f8fb)' }}>
                        <span>{q.emoji}</span>
                        <span style={{ flex: 1, fontSize: 13 }}>{q.label}</span>
                        <span style={{ fontSize: 11, color: '#999', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{q.query.slice(0, 60)}…</span>
                        <button
                          onClick={() => setEditingQuery({ catId: cat.id, qIdx })}
                          style={{ background: 'none', border: '1px solid #1496ff', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#1496ff' }}
                        >✏️ Edit</button>
                        <button
                          onClick={() => handleDeleteQuery(cat.id, qIdx)}
                          style={{ background: 'none', border: '1px solid #E32017', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#E32017' }}
                        >🗑</button>
                      </div>
                    );
                  })}

                  {/* Add query form */}
                  {addingQueryTo === cat.id ? (
                    <QueryAddForm
                      onAdd={(form) => handleAddQuery(cat.id, form)}
                      onCancel={() => setAddingQueryTo(null)}
                    />
                  ) : (
                    <button onClick={() => setAddingQueryTo(cat.id)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--dt-colors-border-neutral-default, #ccc)', background: 'none', color: '#1496ff', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      + Add Query
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add category */}
          {addingCategory ? (
            <CategoryAddForm
              onAdd={(form) => handleAddCategory(form)}
              onCancel={() => setAddingCategory(false)}
            />
          ) : (
            <button onClick={() => setAddingCategory(true)} style={{ padding: '14px 20px', borderRadius: 10, border: '2px dashed var(--dt-colors-border-neutral-default, #ccc)', background: 'none', color: '#6950a1', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + Add New Category
            </button>
          )}
        </div>
      </Flex>
    );
  }

  // ─── CHAT VIEW (ADVANCED MODE) ───
  if (viewMode === 'chat') {
    return (
      <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
        <TitleBar>
          <TitleBar.Title>Advanced Mode</TitleBar.Title>
          <TitleBar.Subtitle>
            {connected
              ? <span style={{ color: '#00a86b' }}>✓ Connected — {connectionInfo}</span>
              : loadConfig().aiMode === 'dynatrace-assist'
                ? <span style={{ color: '#b35900' }}>⚠ Connecting to Dynatrace Assist...</span>
                : !loadConfig().serverUrl
                  ? <span style={{ color: '#c41a16', fontWeight: 600 }}>⚠ MCP Server not configured — open Settings to connect</span>
                  : <span style={{ color: '#b35900' }}>⚠ Not connected to MCP Server</span>}
          </TitleBar.Subtitle>
          <TitleBar.Action>
            <button onClick={() => setViewMode('explorer')} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              ← Simple Mode
            </button>
          </TitleBar.Action>
        </TitleBar>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 60, fontSize: 14 }}>
              Ask anything in plain English about your Dynatrace environment.<br />
              The AI will automatically query your tenant data to build an answer.
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              previousMessage={i > 0 ? messages[i - 1] : undefined}
              onSaveToKB={msg.role === 'assistant' ? (name, content) => handleSaveToKB(name, content) : undefined}
            />
          ))}
          {loading && <TypingDots />}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {getDocumentFileRefs().length > 0 && (
            <span title="Knowledge base documents attached via file references" style={{ fontSize: 18, padding: '6px 4px', opacity: 0.6 }}>📎</span>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask about your Dynatrace environment..."
            disabled={disabled}
            rows={1}
            style={textareaStyle}
          />
          <button
            onClick={() => handleChatSend()}
            disabled={!input.trim() || disabled}
            style={{ ...actionBtnStyle, background: !input.trim() || disabled ? '#ccc' : '#1496ff', cursor: !input.trim() || disabled ? 'not-allowed' : 'pointer' }}
          >
            Send
          </button>
        </div>
      </Flex>
    );
  }

  // ─── HISTORY VIEW ───
  if (viewMode === 'history') {
    return (
      <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
        <TitleBar>
          <TitleBar.Title>🕒 Recommendation History</TitleBar.Title>
          <TitleBar.Subtitle>
            {historyEntries.length} saved recommendation{historyEntries.length !== 1 ? 's' : ''}
          </TitleBar.Subtitle>
          <TitleBar.Action>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setViewMode('explorer')} style={{ ...modeBtnStyle, background: '#6950a1' }}>
                ← Back to Explorer
              </button>
              {historyEntries.length > 0 && (
                <button
                  onClick={async () => {
                    if (confirm('Clear all recommendation history? This cannot be undone.')) {
                      await clearHistory();
                      setHistoryEntries([]);
                    }
                  }}
                  style={{ ...modeBtnStyle, background: '#c41a16' }}
                >
                  🗑 Clear All
                </button>
              )}
            </div>
          </TitleBar.Action>
        </TitleBar>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {historyEntries.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 60, fontSize: 14 }}>
              No recommendations saved yet. Run a query and get AI recommendations — they'll appear here automatically.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {historyEntries.map((entry) => {
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const preview = entry.content.replace(/[#*`|>\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
                return (
                  <div
                    key={entry.id}
                    style={{
                      border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: 'var(--dt-colors-background-surface-default, #fff)',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        cursor: 'pointer',
                        background: 'var(--dt-colors-background-surface-default, #fafafa)',
                      }}
                      onClick={() => {
                        setRecommendation({ role: 'assistant', content: entry.content });
                        setLastQuery({ label: entry.label, dql: entry.dql, results: '' });
                        setViewMode('explorer');
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--dt-colors-text-primary-default, #2c2d4d)' }}>
                          {entry.label}
                        </div>
                        <div style={{ fontSize: 12, color: '#999', display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span>{timeStr}</span>
                          {entry.persona && (
                            <span style={{ background: 'rgba(105,80,161,0.12)', padding: '1px 8px', borderRadius: 4, fontWeight: 600, color: '#6950a1' }}>
                              {entry.persona}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{preview}...</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHistoryEntry(entry.id).then(() => {
                            setHistoryEntries((prev) => prev.filter((h) => h.id !== entry.id));
                          });
                        }}
                        title="Delete this entry"
                        style={{ background: 'none', border: 'none', fontSize: 16, color: '#999', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Flex>
    );
  }

  // ─── EXPLORER VIEW (default) ───
  return (
    <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
      <TitleBar>
        <TitleBar.Title>{loadConfig().aiMode === 'dynatrace-assist' ? 'Query Explorer' : 'MCP Query Explorer'}</TitleBar.Title>
        <TitleBar.Subtitle>
          {connected
            ? <span style={{ color: '#00a86b' }}>✓ Connected — {connectionInfo}</span>
            : loadConfig().aiMode === 'dynatrace-assist'
              ? <span style={{ color: '#b35900' }}>⚠ Connecting to Dynatrace Assist...</span>
              : !loadConfig().serverUrl
                ? <span style={{ color: '#c41a16', fontWeight: 600 }}>⚠ MCP Server not configured — open Settings to connect</span>
                : <span style={{ color: '#b35900' }}>⚠ Not connected to MCP Server</span>}
        </TitleBar.Subtitle>
        <TitleBar.Action>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setCustomCategories(getCustomCategories()); setViewMode('queries'); }} style={{ ...modeBtnStyle, background: '#B36305' }}>
              📋 Pre-Built Queries
            </button>
            <button onClick={() => { setKbDocs(getKBDocuments()); setViewMode('kb'); }} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              📄 Knowledge Base{kbDocs.length > 0 ? ` (${kbDocs.length})` : ''}
            </button>
            <button onClick={() => { setHistoryEntries(getHistory()); setViewMode('history'); }} style={{ ...modeBtnStyle, background: '#0098D4' }}>
              🕒 History{historyEntries.length > 0 ? ` (${historyEntries.length})` : ''}
            </button>
          </div>
        </TitleBar.Action>
      </TitleBar>

      {/* Setup banner */}
      {!connected && !loading && loadConfig().aiMode === 'external-mcp' && !loadConfig().serverUrl && (
        <div style={{ ...bannerStyle, background: 'linear-gradient(135deg, rgba(196,26,22,0.06) 0%, rgba(179,89,0,0.06) 100%)', border: '1px solid rgba(196,26,22,0.3)' }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>⚙️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#c41a16', marginBottom: 4 }}>
              MCP Server not configured
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>You need to configure an MCP server URL and API key in Settings before you can use AI features like chat, recommendations, and discovery.</div>
          </div>
          <button onClick={onOpenSettings} style={{ ...actionBtnStyle, background: '#c41a16' }}>⚙ Open Settings</button>
        </div>
      )}

      {/* Top row: Categories + Queries */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 0, height: '45%', borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
        {/* Left: Categories */}
        <div style={{ borderRight: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={panelHeaderStyle}>Categories</div>
          {allCategories.map((cat) => (
            <CategoryButton key={cat.id} cat={cat} active={selectedCategory === cat.id} onClick={() => setSelectedCategory(cat.id)} />
          ))}
        </div>

        {/* Right: Queries for selected category */}
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{activeCat.emoji}</span>
            <span style={panelHeaderStyle}>{activeCat.label} Queries</span>
            <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>({activeCat.queries.length})</span>
          </div>
          {activeCat.queries.map((q) => (
            <QueryButton key={q.label} q={q} disabled={disabled} color={activeCat.color} onClick={() => handleRunQuery(q.query, `${q.emoji} ${q.label}`)} />
          ))}
        </div>
      </div>



      {/* Mode switch bar */}
      <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', display: 'flex', alignItems: 'center', background: 'var(--dt-colors-background-surface-default, #f8f8fb)' }}>
        <span style={{ fontSize: 12, color: '#999', flex: 1 }}>Simple Mode — select a pre-built query above to run</span>
        <button
          onClick={() => setViewMode('chat')}
          style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #1496ff 0%, #6950a1 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          🚀 Switch to Advanced Mode
        </button>
      </div>

      {/* Bottom: Output + Recommendations side by side */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        {/* Output panel */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, borderRight: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
          <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={panelHeaderStyle}>Output</span>
            {output.length > 0 && (
              <button onClick={() => { setOutput([]); setRecommendation(null); setLastQuery(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 11, color: '#999', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {output.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 40, fontSize: 13 }}>
                Select a category and click a query to see results here.
              </div>
            )}
            {output.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                previousMessage={i > 0 ? output[i - 1] : undefined}
                onSaveToKB={msg.role === 'assistant' ? (name, content) => handleSaveToKB(name, content) : undefined}
              />
            ))}
            {loading && <TypingDots />}
            <div ref={outputEndRef} />
          </div>
        </div>

        {/* Recommendations panel */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={panelHeaderStyle}>🤖 Recommendations</span>
            {recommendation && recommendation.role === 'assistant' && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    if (!recommendation || enrichingReco) return;
                    setEnrichingReco(true);
                    try {
                      const enriched = await enrichRecommendationContent(recommendation.content);
                      setRecommendation({ ...recommendation, content: enriched });
                    } finally {
                      setEnrichingReco(false);
                    }
                  }}
                  disabled={enrichingReco}
                  title="Execute DQL queries found in the recommendations and show live results"
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #00782A', background: 'rgba(0,120,42,0.08)', color: '#00782A', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: enrichingReco ? 0.6 : 1 }}
                >
                  {enrichingReco ? '⏳ Running...' : '▶ Run Queries'}
                </button>
                {recommendation && hasFailedQueries(recommendation.content) && (
                  <button
                    onClick={async () => {
                      if (!recommendation || enrichingReco) return;
                      setEnrichingReco(true);
                      try {
                        const retried = await retryFailedQueries(recommendation.content);
                        setRecommendation({ ...recommendation, content: retried });
                      } finally {
                        setEnrichingReco(false);
                      }
                    }}
                    disabled={enrichingReco}
                    title="Retry failed DQL queries — auto-repair syntax and re-execute"
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #E32017', background: 'rgba(227,32,23,0.08)', color: '#E32017', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: enrichingReco ? 0.6 : 1 }}
                  >
                    {enrichingReco ? '⏳ Retrying...' : '🔄 Retry Failed'}
                  </button>
                )}
                <button
                  onClick={handleGenerateNotebook}
                  disabled={notebookGenerating}
                  title="Generate a Dynatrace Notebook with query and recommendations"
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #6950a1', background: 'rgba(105,80,161,0.08)', color: '#6950a1', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: notebookGenerating ? 0.6 : 1 }}
                >
                  {notebookGenerating ? '⏳ Generating...' : '📓 Generate Notebook'}
                </button>
                <button
                  onClick={handleExportRecommendationsMd}
                  title="Export recommendations as a formatted Markdown file"
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #1976d2', background: 'rgba(25,118,210,0.08)', color: '#1976d2', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  📄 Export MD
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {!lastQuery && !recoLoading && !recommendation && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 40, fontSize: 13 }}>
                Run a query first, then get AI-powered recommendations based on the results.
              </div>
            )}
            {lastQuery && !recommendation && !recoLoading && (
              <div style={{ textAlign: 'center', marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 13, color: '#666' }}>Results ready for <strong>{lastQuery.label}</strong></div>
                <button
                  onClick={handleGetRecommendations}
                  style={{ ...recoBtnStyle }}
                >
                  🤖 DAVIS Intelligence Recommendations
                </button>

                {isLLMConfigured() && (
                  <div style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      AI Agent Analysis
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {ANALYSIS_PERSONAS.map((persona) => (
                        <button
                          key={persona.name}
                          onClick={() => handlePersonaAnalysis(persona)}
                          style={{
                            ...recoBtnStyle,
                            background: persona.colour,
                            fontSize: 12,
                            padding: '10px 14px',
                          }}
                        >
                          {persona.emoji} Analyse as {persona.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 8, lineHeight: 1.5 }}>
                      Each persona analyses the results through a different lens using {loadConfig().llmProvider === 'github-models' ? (GITHUB_MODEL_OPTIONS.find((m) => m.id === loadConfig().githubModel)?.label || 'your model') : 'Claude'}.
                    </div>
                  </div>
                )}
              </div>
            )}
            {recoLoading && (
              <div style={{ textAlign: 'center', marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <TypingDots />
                <div style={{ fontSize: 12, color: '#6950a1', fontWeight: 500 }}>
                  {loadConfig().aiMode === 'dynatrace-assist' ? '🧠 Davis is analysing results... ' : '🧠 Claude is analysing results... '}
                  <ElapsedTimer />
                </div>
                <div style={{ fontSize: 11, color: '#999', maxWidth: 280, lineHeight: 1.5 }}>
                  {loadConfig().aiMode === 'dynatrace-assist'
                    ? 'Davis CoPilot will analyse the results and provide recommendations.'
                    : 'Claude will analyse the results and use Dynatrace MCP tools for additional context.'}
                </div>
              </div>
            )}
            {recommendation && (
              <>
                <MessageBubble
                  message={recommendation}
                  onSaveToKB={(name, content) => handleSaveToKB(name, content)}
                />
                {recommendation.role === 'error' && lastQuery && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <button
                      onClick={handleGetRecommendations}
                      disabled={recoLoading}
                      style={{ ...recoBtnStyle, fontSize: 13, padding: '8px 16px' }}
                    >
                      🔄 Retry Recommendations
                    </button>
                  </div>
                )}
              </>
            )}
            <div ref={recoEndRef} />
          </div>
        </div>
      </div>
    </Flex>
  );
});

/* ─── Shared components ─── */

/* ─── Isolated form components (own state → no parent re-render issues) ─── */

function QueryEditForm({ initial, onSave, onCancel }: {
  initial: { label: string; emoji: string; query: string };
  onSave: (form: { label: string; emoji: string; query: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'rgba(20,150,255,0.04)', borderRadius: 8, border: '1px solid #1496ff' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} style={{ ...queryInputStyle, width: 50, textAlign: 'center' }} placeholder="Emoji" />
        <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={{ ...queryInputStyle, flex: 1 }} placeholder="Query label" autoFocus />
      </div>
      <textarea value={form.query} onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))} rows={4} style={{ ...queryInputStyle, minHeight: 80, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder="DQL query" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(form)} style={{ ...actionBtnStyle, background: '#00a86b', padding: '6px 14px', fontSize: 12 }}>Save</button>
        <button onClick={onCancel} style={{ ...actionBtnStyle, background: '#999', padding: '6px 14px', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

function QueryAddForm({ onAdd, onCancel }: {
  onAdd: (form: { label: string; emoji: string; query: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ label: '', emoji: '📊', query: '' });
  const valid = form.label.trim() && form.query.trim();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'rgba(0,168,107,0.04)', borderRadius: 8, border: '1px dashed #00a86b' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} style={{ ...queryInputStyle, width: 50, textAlign: 'center' }} placeholder="📊" />
        <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={{ ...queryInputStyle, flex: 1 }} placeholder="Query label" autoFocus />
      </div>
      <textarea value={form.query} onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))} rows={4} style={{ ...queryInputStyle, minHeight: 80, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder="fetch logs, from:now()-1h | ..." />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { if (valid) onAdd(form); }} style={{ ...actionBtnStyle, background: valid ? '#00a86b' : '#ccc', padding: '6px 14px', fontSize: 12, cursor: valid ? 'pointer' : 'not-allowed' }}>Add Query</button>
        <button onClick={onCancel} style={{ ...actionBtnStyle, background: '#999', padding: '6px 14px', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

function CategoryAddForm({ onAdd, onCancel }: {
  onAdd: (form: { label: string; emoji: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ label: '', emoji: '📂', color: '#6950A1' });
  return (
    <div style={{ border: '1px dashed #00a86b', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>New Category</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} style={{ ...queryInputStyle, width: 50, textAlign: 'center' }} placeholder="📂" />
        <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={{ ...queryInputStyle, flex: 1 }} placeholder="Category name" autoFocus />
        <input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} type="color" style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { if (form.label.trim()) onAdd(form); }} style={{ ...actionBtnStyle, background: form.label.trim() ? '#00a86b' : '#ccc', padding: '6px 14px', fontSize: 12 }}>Create Category</button>
        <button onClick={onCancel} style={{ ...actionBtnStyle, background: '#999', padding: '6px 14px', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ color: '#6950a1', fontSize: 18, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}>●</span>
      ))}
    </div>
  );
}

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>;
}

/* ─── Styles ─── */

const panelHeaderStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
  marginBottom: 8,
};

const bannerStyle: React.CSSProperties = {
  margin: '12px 16px',
  padding: '16px 20px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, rgba(20,150,255,0.08) 0%, rgba(105,80,161,0.08) 100%)',
  border: '1px solid rgba(20,150,255,0.25)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const modeBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 6,
  border: 'none',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--dt-colors-border-neutral-default, #ccc)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  minHeight: 40,
  maxHeight: 120,
  background: 'var(--dt-colors-background-surface-default, #fff)',
  color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
};

const recoBtnStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #6950a1 0%, #1496ff 100%)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const ANALYSIS_PERSONAS = [
  {
    name: 'SRE',
    emoji: '🔧',
    colour: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
    systemPrompt: 'Senior SRE analysing Dynatrace data. Focus: root cause hypotheses, blast radius (% users affected), SLO/SLI definitions with thresholds, error budget calculations, incident classification (SEV1-3). No generic advice — every recommendation needs a metric and threshold.',
  },
  {
    name: 'Security',
    emoji: '🛡️',
    colour: 'linear-gradient(135deg, #C62828 0%, #E53935 100%)',
    systemPrompt: 'Security Analyst reviewing Dynatrace telemetry. Focus: threat indicators (error spikes, geo anomalies), attack surface mapping, OWASP Top 10 classification, 4xx vs 5xx pattern analysis, anomaly severity scoring (Critical/High/Medium/Low), specific detection rules as DQL queries.',
  },
  {
    name: 'FinOps',
    emoji: '💰',
    colour: 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)',
    systemPrompt: 'FinOps Engineer analysing Dynatrace data for cost. Focus: DDU cost estimation, data volume/growth rates, high-cardinality fields, query optimisation rewrites, resource utilisation, cost-per-transaction. Every recommendation must quantify savings (%, DDUs, or absolute).',
  },
  {
    name: 'Performance',
    emoji: '⚡',
    colour: 'linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)',
    systemPrompt: 'Performance Engineer analysing Dynatrace data. Focus: latency percentiles (p50/p90/p99), bottleneck identification (service/endpoint), throughput (req/s), saturation indicators, scalability extrapolation, specific SLA/SLO targets with thresholds from observed data.',
  },
] as const;

const queryInputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--dt-colors-border-neutral-default, #ccc)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--dt-colors-background-surface-default, #fff)',
  color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
};

const kbLoadBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px dashed #6950a1',
  background: 'rgba(105,80,161,0.08)',
  color: '#6950a1',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const kbSmallBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #6950a1',
  background: 'rgba(105,80,161,0.08)',
  fontSize: 16,
  cursor: 'pointer',
  lineHeight: 1,
};

/* ─── Simple markdown renderer ─── */

function renderMarkdown(text: string): string {
  // First, strip any leaked XML-like blocks (function calls, invoke tags, etc.)
  let cleaned = text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/g, '')
    .replace(/<parameter[\s\S]*?<\/parameter>/g, '')
    .trim();

  // Escape HTML to prevent XSS
  let html = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre style="background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;margin:12px 0">${code.trim()}</pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(105,80,161,0.15);padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>');

  // Headers with better styling
  // H1 - major sections with top border
  html = html.replace(/^# (.+)$/gm, '<div style="font-size:18px;font-weight:700;margin:20px 0 10px;padding-top:16px;border-top:2px solid rgba(105,80,161,0.3)">$1</div>');
  // H2 - section headers
  html = html.replace(/^## (.+)$/gm, '<div style="font-size:16px;font-weight:700;margin:18px 0 8px;color:#4a4a6a">$1</div>');
  // H3 - subsection headers
  html = html.replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:600;margin:14px 0 6px;color:#5a5a7a">$1</div>');
  // H4 - minor headers
  html = html.replace(/^#### (.+)$/gm, '<div style="font-size:14px;font-weight:600;margin:10px 0 4px;color:#6a6a8a">$1</div>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(105,80,161,0.2);margin:16px 0"/>');

  // Markdown tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (_match, tableBlock: string) => {
    const lines = tableBlock.trim().split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) return tableBlock;

    const parseRow = (line: string) =>
      line.split('|').slice(1, -1).map((c: string) => c.trim());

    const headers = parseRow(lines[0]);

    // Check if line[1] is separator (|---|---|)
    const isSeparator = /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(lines[1].trim());
    const dataStart = isSeparator ? 2 : 1;

    // Detect right-alignment from separator
    const alignments = isSeparator
      ? parseRow(lines[1]).map((cell: string) => (cell.trim().endsWith(':') ? 'right' : 'left'))
      : headers.map(() => 'left');

    let table = '<div style="overflow-x:auto;margin:12px 0;max-width:100%"><table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;border-radius:8px;overflow:hidden">';

    // Header
    table += '<thead><tr>';
    headers.forEach((h: string, i: number) => {
      table += `<th style="padding:10px 12px;text-align:${alignments[i] || 'left'};background:#6950a1;color:#fff;font-weight:600;white-space:nowrap">${h}</th>`;
    });
    table += '</tr></thead>';

    // Body
    table += '<tbody>';
    for (let r = dataStart; r < lines.length; r++) {
      const cells = parseRow(lines[r]);
      const bg = (r - dataStart) % 2 === 0 ? 'transparent' : 'rgba(105,80,161,0.06)';
      table += `<tr style="background:${bg}">`;
      cells.forEach((cell: string, i: number) => {
        table += `<td style="padding:8px 12px;text-align:${alignments[i] || 'left'};border-bottom:1px solid rgba(0,0,0,0.08);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="${cell.replace(/"/g, '&quot;')}">${cell}</td>`;
      });
      table += '</tr>';
    }
    table += '</tbody></table></div>';
    return table;
  });

  // Numbered lists (1. item, 2. item, etc.)
  html = html.replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:20px;margin:4px 0"><span style="color:#6950a1;font-weight:600;margin-right:6px">$1.</span>$2</div>');

  // Bullet lists - improved styling
  html = html.replace(/^[•\-] (.+)$/gm, '<div style="padding-left:20px;margin:4px 0;position:relative"><span style="position:absolute;left:6px;color:#6950a1">•</span>$1</div>');

  // Markdown links [text](url) — allow https URLs and relative paths
  html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#1496ff;text-decoration:underline">$1</a>');

  // Bare URLs (not already in an <a> tag)
  html = html.replace(/(?<!href="|&gt;)(https?:\/\/[^\s<&]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#1496ff;text-decoration:underline">$1</a>');

  // Line breaks (double newline = paragraph, single = br)
  html = html.replace(/\n\n/g, '<div style="height:12px"></div>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

/* ─── Message bubble ─── */

function MessageBubble({ message, previousMessage, onSaveToKB }: {
  message: Message;
  previousMessage?: Message;
  onSaveToKB?: (name: string, content: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.role === 'error';
  const isAssistant = message.role === 'assistant';

  const bgColor = isUser
    ? '#1496ff'
    : isError
      ? '#fdecea'
      : isSystem
        ? 'var(--dt-colors-background-surface-default, #f5f5f5)'
        : 'var(--dt-colors-background-surface-default, #f0f0f5)';

  const textColor = isUser ? '#fff' : isError ? '#c62828' : 'var(--dt-colors-text-primary-default, #2c2d4d)';

  const handleSave = async () => {
    if (!onSaveToKB || saving) return;
    const defaultName = `kb-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.md`;
    const name = prompt('Save to Knowledge Base as:', defaultName);
    if (!name) return;

    const fileName = name.endsWith('.md') ? name : `${name}.md`;

    // Build content: include the question (previous user message) + the answer
    let content = '';
    if (previousMessage && previousMessage.role === 'user') {
      content += `## Question\n\n${previousMessage.content}\n\n`;
    }
    content += `## Answer\n\n${message.content}\n`;

    setSaving(true);
    try {
      await onSaveToKB(fileName, content);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: isSystem ? '100%' : '90%', minWidth: 0 }}>
      <div
        style={{
          padding: isSystem ? '6px 12px' : '10px 16px',
          borderRadius: 12,
          background: bgColor,
          color: textColor,
          fontSize: isSystem ? 12 : 14,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          overflowX: 'auto',
          ...(isAssistant ? {} : { whiteSpace: 'pre-wrap' as const }),
        }}
      >
        {isAssistant ? (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        ) : (
          message.content
        )}
      </div>

      {/* Save to KB + Tool calls row */}
      {(onSaveToKB || (message.toolCalls && message.toolCalls.length > 0)) && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          {onSaveToKB && (
            <button
              onClick={handleSave}
              disabled={saving}
              title="Save this Q&A to the Knowledge Base"
              style={{
                background: 'none',
                border: '1px solid var(--dt-colors-border-neutral-default, #ddd)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                color: saved ? '#00a86b' : '#888',
                cursor: saving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {saved ? '✓ Saved' : saving ? '...' : '💾 Save to KB'}
            </button>
          )}
        </div>
      )}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {message.toolCalls.map((tc, i) => (
            <ToolCallCard key={i} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Tool call accordion ─── */

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input, null, 2);
  const outputStr = toolCall.output.length > 500 ? toolCall.output.substring(0, 500) + '... (truncated)' : toolCall.output;

  return (
    <div style={{ border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', borderLeft: '3px solid #1496ff', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '8px 12px', background: 'var(--dt-colors-background-surface-default, #fafafa)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
      >
        <span>🔧</span>
        <span style={{ fontWeight: 600 }}>{toolCall.tool}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: 12, fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#666' }}>Input:</div>
            <pre style={preStyle}>{inputStr}</pre>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#666' }}>Output:</div>
            <pre style={{ ...preStyle, maxHeight: 200 }}>{outputStr}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

const preStyle: React.CSSProperties = {
  background: 'var(--dt-colors-background-surface-default, #f5f5f5)',
  padding: 8,
  borderRadius: 4,
  overflow: 'auto',
  maxHeight: 150,
  margin: 0,
  fontSize: 11,
};
