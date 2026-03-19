import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { TitleBar } from '@dynatrace/strato-components-preview/layouts';
import { sendChat, testConnection, executeDql, getRecommendations, type ToolCall, type DqlResult, type ChatResponse } from '../mcp-client';
import { loadConfig } from '../config';
import { getKBDocuments, buildKBContext, buildKBSummary, buildKBIngestionMessage, buildDiscoveryTasks, buildQueryGenerationPrompt, loadKBDocuments, addKBDocument, removeKBDocument, appendToKBDocument, detectPlaceholders, detectDiscoveryPlaceholders, loadPlaceholderValues, savePlaceholderValues, saveDiscoveryStatus, loadDiscoveryStatus, type KBDocument, type PlaceholderInfo, type DiscoveryPlaceholder } from '../knowledge-base';
import { loadCustomCategories, getCustomCategories, saveCustomCategories, type CustomCategory, type CustomQuery } from '../custom-queries';

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
];

type ViewMode = 'explorer' | 'chat' | 'kb' | 'queries';

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
  const [kbLoaded, setKbLoaded] = useState(false);
  const [kbDocs, setKbDocs] = useState<KBDocument[]>([]);
  const [kbUploading, setKbUploading] = useState(false);
  const kbFileInputRef = useRef<HTMLInputElement>(null);
  const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([]);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [discoveryPlaceholders, setDiscoveryPlaceholders] = useState<DiscoveryPlaceholder[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [completedDiscoveryKeys, setCompletedDiscoveryKeys] = useState<Set<string>>(new Set());
  const [notebookGenerating, setNotebookGenerating] = useState(false);

  // Pre-built queries state
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [editingQuery, setEditingQuery] = useState<{ catId: string; qIdx: number } | null>(null);
  const [addingQueryTo, setAddingQueryTo] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
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
    if (config.serverUrl) handleConnect();
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
  }, []);

  const handleConnect = async (explicitUrl?: string, explicitKey?: string) => {
    const config = loadConfig();
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
      const jsonMatch = resultText.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) return resultText;
      const data = JSON.parse(jsonMatch[1]);
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
          return s.length > 60 ? s.substring(0, 57) + '...' : s;
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

  const handleGenerateNotebook = async () => {
    if (!lastQuery || !recommendation || recommendation.role !== 'assistant') return;
    setNotebookGenerating(true);
    try {
      // Use KB summary to keep tokens low and avoid rate limits
      const kbSummary = buildKBSummary(placeholderValues);

      const prompt = [
        `Create a Dynatrace Notebook using the create-notebook tool.`,
        ``,
        `**Notebook title:** ${lastQuery.label} — Analysis`,
        ``,
        `RULES:`,
        `- Every DQL query MUST be an executable DQL code section (type "code", language "dql"), NOT markdown code blocks`,
        `- VALIDATE every DQL query by running it with execute-dql BEFORE adding it to the notebook. If a query returns an error, fix the syntax and retry. Only include queries that execute successfully.`,
        `- Each DQL code section should have a markdown section above it explaining what it investigates`,
        ``,
        `NOTEBOOK SECTIONS:`,
        ``,
        `1. Markdown: Title "${lastQuery.label}" with brief context`,
        ``,
        `2. DQL code section — the original query:`,
        lastQuery.dql,
        ``,
        `3. Markdown: "Root Cause Analysis" — generate 2-3 analytical DQL queries as executable code sections that:`,
        `   - Break down errors/issues by time period (hourly bins)`,
        `   - Correlate with related services or dependencies`,
        `   - Analyse by key dimensions (customer, region, type)`,
        ``,
        `4. Markdown: "Impact Assessment" — 1-2 DQL queries as executable code sections for:`,
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

      const result = await sendChat(prompt, []);

      if (result.status === 'success') {
        // Check if the response contains a notebook URL or ID
        const urlMatch = result.response?.match(/notebook\/([a-zA-Z0-9-]+)/);
        if (urlMatch) {
          window.open(`/ui/apps/dynatrace.notebooks/notebook/${urlMatch[1]}`, '_blank');
        }
        setRecommendation({ role: 'assistant', content: result.response || 'Notebook created successfully.' });
        // Auto-save notebook findings to KB
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `## Notebook: ${lastQuery.label} — ${timestamp}\n\nNotebook generated with root-cause analysis and impact assessment.\n\n${recommendation.content.slice(0, 1500)}`;
        appendToKBDocument('discovered-findings.md', entry).catch(() => {/* best-effort */});
      } else {
        setRecommendation({ role: 'error', content: `Failed to create notebook: ${result.message}` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setRecommendation({ role: 'error', content: `Failed to create notebook: ${msg}` });
    } finally {
      setNotebookGenerating(false);
    }
  };

  const handleGetRecommendations = async () => {
    if (!lastQuery || recoLoading) return;
    setRecoLoading(true);
    setRecommendation(null);
    try {
      // Send condensed KB summary instead of full docs to avoid 504 timeouts
      const kbSummary = buildKBSummary(placeholderValues);
      const result: ChatResponse = await getRecommendations(lastQuery.label, lastQuery.dql, lastQuery.results, kbSummary || undefined);
      if (result.status === 'success') {
        setRecommendation({ role: 'assistant', content: result.response, toolCalls: result.toolCalls });
        // Auto-save findings to KB so the AI remembers them in future sessions
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `## ${lastQuery.label} — ${timestamp}\n\n**Query:** \`${lastQuery.dql.slice(0, 200)}\`\n\n${result.response.slice(0, 2000)}`;
        appendToKBDocument('discovered-findings.md', entry).catch(() => {/* best-effort */});
      } else {
        setRecommendation({ role: 'error', content: `Recommendations failed: ${result.message}` });
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

    // Only run tasks not yet completed
    const pendingTasks = allTasks.filter((t) => !completedDiscoveryKeys.has(t.key));
    if (pendingTasks.length === 0) {
      setDiscoveryStatus('success');
      setDiscoveryMessage('All discovery tables already completed.');
      return;
    }

    const newCompleted = new Set(completedDiscoveryKeys);
    const results: string[] = [];

    // ── Phase 1: One Claude call to generate DQL queries for all pending tables ──
    setDiscoveryMessage(`Generating DQL queries for ${pendingTasks.length} tables...`);
    const queryPrompt = buildQueryGenerationPrompt(pendingTasks);
    let queryPlans: { key: string; dql: string }[] = [];

    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const waitSec = Math.min(60, 15 * attempt);
        setDiscoveryMessage(`Rate limited — retrying query generation in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
      try {
        const chatResult = await sendChat(queryPrompt, []);
        if (chatResult.status === 'success' && chatResult.response) {
          // Extract JSON from response (may be wrapped in markdown fences)
          const jsonStr = chatResult.response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
          queryPlans = JSON.parse(jsonStr);
          break;
        }
        const msg = chatResult.message || '';
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) continue;
        setDiscoveryStatus('error');
        setDiscoveryMessage(`Query generation failed: ${msg}`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if ((msg.includes('429') || msg.toLowerCase().includes('rate limit')) && attempt < MAX_RETRIES - 1) continue;
        // Try to parse JSON error — might be a parse failure
        if (msg.includes('JSON')) {
          setDiscoveryStatus('error');
          setDiscoveryMessage('Claude returned invalid JSON. Try again.');
          return;
        }
        if (attempt === MAX_RETRIES - 1) {
          setDiscoveryStatus('error');
          setDiscoveryMessage(msg);
          return;
        }
      }
    }

    if (queryPlans.length === 0) {
      setDiscoveryStatus('error');
      setDiscoveryMessage('No query plans generated. Try again.');
      return;
    }

    // ── Phase 2: Run DQL queries directly (no Claude) ──
    setDiscoveryMessage(`Running ${queryPlans.length} DQL queries...`);

    for (let i = 0; i < queryPlans.length; i++) {
      const plan = queryPlans[i];
      const task = pendingTasks.find((t) => t.key === plan.key);
      const label = task?.label || plan.key;
      setDiscoveryMessage(`Querying ${i + 1}/${queryPlans.length}: ${label}...`);

      try {
        const dqlResult = await executeDql(plan.dql, 50);
        if (dqlResult.status === 'success') {
          const rawText = dqlResult.result?.content?.[0]?.text || 'No data returned';
          // Try to format as markdown table
          let formatted = rawText;
          try {
            const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              if (Array.isArray(data) && data.length > 0) {
                const cols = Object.keys(data[0]);
                formatted = '| ' + cols.join(' | ') + ' |\n';
                formatted += '| ' + cols.map(() => '---').join(' | ') + ' |\n';
                data.forEach((row: Record<string, unknown>) => {
                  formatted += '| ' + cols.map((c) => {
                    const v = row[c];
                    if (v === null || v === undefined) return '-';
                    const s = String(v);
                    return s.length > 80 ? s.substring(0, 77) + '...' : s;
                  }).join(' | ') + ' |\n';
                });
                formatted = `${data.length} record${data.length === 1 ? '' : 's'} found\n\n${formatted}`;
              }
            }
          } catch { /* use raw text */ }
          results.push(`## ${label}\n\n${formatted}`);
          newCompleted.add(plan.key);
          setCompletedDiscoveryKeys(new Set(newCompleted));
        } else {
          results.push(`## ${label}\n\n_Query failed: ${dqlResult.message || 'Unknown error'}_\n\nDQL: \`${plan.dql}\``);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push(`## ${label}\n\n_Error: ${msg}_\n\nDQL: \`${plan.dql}\``);
      }

      // Save after each query so progress isn't lost
      await saveDiscoveryStatus(Array.from(newCompleted));
      const progressContent = `# AI Discovery Results\n\n_Generated: ${new Date().toLocaleString()}_\n_Tables discovered: ${results.length}/${queryPlans.length}_\n\n${results.join('\n\n---\n\n')}`;
      await addKBDocument('AI_Discovery_Results.md', progressContent);
      setKbDocs(getKBDocuments());
    }

    setDiscoveryStatus('success');
    const remaining = allTasks.length - newCompleted.size;
    setDiscoveryMessage(remaining === 0
      ? `All ${allTasks.length} tables discovered.`
      : `${newCompleted.size}/${allTasks.length} tables done — ${remaining} remaining.`);
  };

  const handleLoadContext = async () => {
    const ingestionMsg = buildKBIngestionMessage(placeholderValues);
    if (!ingestionMsg || loading) return;
    await handleChatSend(ingestionMsg);
    setKbLoaded(true);
  };

  // Auto-load KB docs when entering chat view with docs available
  useEffect(() => {
    if (viewMode === 'chat' && connected && !kbLoaded && !loading && getKBDocuments().length > 0 && messages.length === 0) {
      handleLoadContext();
    }
  }, [viewMode, connected]);

  const handleChatSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
      const result = await sendChat(msg, history);
      if (result.status === 'success') {
        setMessages((prev) => [...prev, { role: 'assistant', content: result.response, toolCalls: result.toolCalls }]);
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
  };

  const handleKBRemove = async (name: string) => {
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
                // Compute discovery status for this doc
                const docDiscoveryKeys = new Set<string>();
                for (const dp of discoveryPlaceholders) {
                  if (dp.docName === doc.name) docDiscoveryKeys.add(`${dp.docName}::${dp.section}`);
                }
                const totalTables = docDiscoveryKeys.size;
                const completedTables = totalTables > 0 ? Array.from(docDiscoveryKeys).filter((k) => completedDiscoveryKeys.has(k)).length : 0;

                return (
                <div
                  key={doc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid ' + (totalTables > 0 && completedTables === totalTables ? 'rgba(0,168,107,0.3)' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'),
                    background: totalTables > 0 && completedTables === totalTables ? 'rgba(0,168,107,0.04)' : 'var(--dt-colors-background-base-default, #fff)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {(doc.content.length / 1024).toFixed(1)} KB • {new Date(doc.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {totalTables > 0 && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: completedTables === totalTables ? '#00a86b' : completedTables > 0 ? '#ff9500' : '#e0e0e0',
                      color: completedTables > 0 ? '#fff' : '#666',
                      whiteSpace: 'nowrap',
                    }}>
                      {completedTables === totalTables ? `✓ ${completedTables}/${totalTables}` : `${completedTables}/${totalTables}`}
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

              {/* Placeholder replacement */}
              {placeholders.length > 0 && (
                <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(255,149,0,0.06) 0%, rgba(255,100,0,0.06) 100%)', border: '1px solid rgba(255,149,0,0.25)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
                    🔧 Replace Placeholders
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
                    {placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'} detected. Fill in values below — they'll be replaced before loading into AI.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {placeholders.map((ph) => (
                      <div key={ph.token} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ minWidth: 140, fontSize: 12 }}>
                          <span style={{ fontWeight: 600, color: '#b36305' }}>{ph.friendlyName}</span>
                          <span style={{ color: '#999', marginLeft: 4, fontSize: 11 }}>×{ph.occurrences}</span>
                        </div>
                        <input
                          type="text"
                          placeholder={ph.token}
                          value={placeholderValues[ph.token] || ''}
                          onChange={(e) => handlePlaceholderChange(ph.token, e.target.value)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid ' + (placeholderValues[ph.token]?.trim() ? '#00a86b' : '#e0a000'),
                            background: 'var(--dt-colors-background-base-default, #fff)',
                            fontSize: 12,
                            color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
                            outline: 'none',
                          }}
                        />
                        {placeholderValues[ph.token]?.trim() && (
                          <span style={{ color: '#00a86b', fontSize: 14 }}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {placeholders.some((ph) => !placeholderValues[ph.token]?.trim()) && (
                    <div style={{ fontSize: 11, color: '#e0a000', marginTop: 8, fontStyle: 'italic' }}>
                      ⚠ Unfilled placeholders will remain as-is in the documents.
                    </div>
                  )}
                </div>
              )}

              {/* AI Discovery — populate template rows via MCP */}
              <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,168,107,0.08) 0%, rgba(0,152,212,0.08) 100%)', border: '1px solid ' + (discoveryStatus === 'success' ? 'rgba(0,168,107,0.3)' : discoveryStatus === 'error' ? 'rgba(227,32,23,0.3)' : 'rgba(0,152,212,0.25)') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                      {discoveryStatus === 'success' && completedDiscoveryKeys.size > 0 ? '✅ AI Discovery Complete' : discoveryStatus === 'error' ? '❌ AI Discovery Failed' : discoveryStatus === 'running' ? '⏳ Running AI Discovery...' : '🤖 AI Update Placeholders'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {discoveryStatus === 'running'
                        ? discoveryMessage || 'Starting discovery...'
                        : discoveryStatus === 'success'
                          ? discoveryMessage
                          : discoveryStatus === 'error'
                            ? discoveryMessage
                            : 'Ask Claude to use MCP tools to populate all template rows in your reference files.'}
                    </div>
                  </div>
                  <button
                    onClick={handleAIDiscovery}
                    disabled={discoveryStatus === 'running'}
                    style={{
                      ...recoBtnStyle,
                      fontSize: 13,
                      padding: '10px 18px',
                      background: discoveryStatus === 'success' ? '#00a86b' : discoveryStatus === 'error' ? '#e32017' : '#1496ff',
                      opacity: discoveryStatus === 'running' ? 0.5 : 1,
                      cursor: discoveryStatus === 'running' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {discoveryStatus === 'running' ? '⏳ Running...' : discoveryStatus === 'success' && completedDiscoveryKeys.size > 0 ? '🔄 Update Remaining' : discoveryStatus === 'error' ? '🔄 Retry' : '🤖 Run AI Discovery'}
                  </button>
                </div>
              </div>

              {/* Load into AI context — only available after successful discovery */}
              {(discoveryStatus === 'success' || completedDiscoveryKeys.size > 0) && (
              <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(105,80,161,0.08) 0%, rgba(20,150,255,0.08) 100%)', border: '1px solid rgba(105,80,161,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                      {kbLoaded ? '✅ Documents loaded into AI context' : 'Ready to load into AI context'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {kbLoaded
                        ? 'The AI is using these documents in the current chat session.'
                        : 'Send these documents to the AI so it can reference them when answering your queries.'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setKbLoaded(false);
                      setMessages([]);
                      setViewMode('chat');
                    }}
                    disabled={!connected}
                    style={{
                      ...recoBtnStyle,
                      fontSize: 13,
                      padding: '10px 18px',
                      opacity: !connected ? 0.5 : 1,
                      cursor: !connected ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🧠 {kbLoaded ? 'Reload Context' : 'Load into AI'}
                  </button>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
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

  // ─── CHAT VIEW ───
  if (viewMode === 'chat') {
    return (
      <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
        <TitleBar>
          <TitleBar.Title>Your Own Query</TitleBar.Title>
          <TitleBar.Subtitle>
            {connected ? <span style={{ color: '#00a86b' }}>Connected — {connectionInfo}</span> : <span style={{ color: '#999' }}>Not connected</span>}
          </TitleBar.Subtitle>
          <TitleBar.Action>
            <button onClick={() => setViewMode('explorer')} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              ← Back to Explorer
            </button>
          </TitleBar.Action>
        </TitleBar>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 60, fontSize: 14 }}>
              Ask anything about your Dynatrace environment.<br />The AI assistant will use MCP tools to query data and provide insights.
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
          {kbLoaded && (
            <span title="Knowledge base loaded in this session" style={{ fontSize: 18, padding: '6px 4px', opacity: 0.6 }}>✅</span>
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

  // ─── EXPLORER VIEW (default) ───
  return (
    <Flex width="100%" flexDirection="column" gap={0} style={{ height: '100%' }}>
      <TitleBar>
        <TitleBar.Title>MCP Query Explorer</TitleBar.Title>
        <TitleBar.Subtitle>
          {connected ? <span style={{ color: '#00a86b' }}>Connected — {connectionInfo}</span> : <span style={{ color: '#999' }}>Not connected</span>}
        </TitleBar.Subtitle>
        <TitleBar.Action>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setCustomCategories(getCustomCategories()); setViewMode('queries'); }} style={{ ...modeBtnStyle, background: '#B36305' }}>
              📋 Pre-Built Queries
            </button>
            <button onClick={() => { setKbDocs(getKBDocuments()); setViewMode('kb'); }} style={{ ...modeBtnStyle, background: '#6950a1' }}>
              📄 Knowledge Base{kbDocs.length > 0 ? ` (${kbDocs.length})` : ''}
            </button>
            <button onClick={() => setViewMode('chat')} style={{ ...modeBtnStyle, background: '#1496ff' }}>
              💬 Your Own Query
            </button>
          </div>
        </TitleBar.Action>
      </TitleBar>

      {/* Setup banner */}
      {!connected && !loading && !loadConfig().serverUrl && (
        <div style={bannerStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
              Configure your MCP server to get started
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>Click the ⚙ cog in the top-right to add your remote MCP server URL.</div>
          </div>
          <button onClick={onOpenSettings} style={{ ...actionBtnStyle, background: '#1496ff' }}>Open Settings</button>
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

      {/* Bottom: Output + Recommendations side by side */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        {/* Output panel */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
          <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={panelHeaderStyle}>Output</span>
            {output.length > 0 && (
              <button onClick={() => { setOutput([]); setRecommendation(null); setLastQuery(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 11, color: '#999', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={panelHeaderStyle}>🤖 Recommendations</span>
            {recommendation && recommendation.role === 'assistant' && (
              <button
                onClick={handleGenerateNotebook}
                disabled={notebookGenerating}
                title="Generate a Dynatrace Notebook with query and recommendations"
                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #6950a1', background: 'rgba(105,80,161,0.08)', color: '#6950a1', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: notebookGenerating ? 0.6 : 1 }}
              >
                {notebookGenerating ? '⏳ Generating...' : '📓 Generate Notebook'}
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {!lastQuery && !recoLoading && !recommendation && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 40, fontSize: 13 }}>
                Run a query first, then get AI-powered recommendations based on the results.
              </div>
            )}
            {lastQuery && !recommendation && !recoLoading && (
              <div style={{ textAlign: 'center', marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 13, color: '#666' }}>Results ready for <strong>{lastQuery.label}</strong></div>
                <button
                  onClick={handleGetRecommendations}
                  style={{ ...recoBtnStyle }}
                >
                  🤖 Get AI Recommendations
                </button>
                <div style={{ fontSize: 11, color: '#999', maxWidth: 280, lineHeight: 1.5 }}>
                  Claude will analyse the results and use Dynatrace MCP tools for additional context.
                </div>
              </div>
            )}
            {recoLoading && (
              <div style={{ textAlign: 'center', marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <TypingDots />
                <div style={{ fontSize: 12, color: '#6950a1', fontWeight: 500 }}>Analysing results and gathering context...</div>
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
  // Escape HTML first to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre style="background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;margin:8px 0">${code.trim()}</pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(105,80,161,0.12);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<div style="font-size:14px;font-weight:700;margin:12px 0 6px">$1</div>');
  html = html.replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:700;margin:12px 0 6px">$1</div>');
  html = html.replace(/^## (.+)$/gm, '<div style="font-size:16px;font-weight:700;margin:12px 0 6px">$1</div>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

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

    let table = '<div style="overflow-x:auto;margin:8px 0"><table style="width:100%;border-collapse:collapse;font-size:13px">';

    // Header
    table += '<thead><tr>';
    headers.forEach((h: string, i: number) => {
      table += `<th style="padding:8px 12px;text-align:${alignments[i] || 'left'};background:#6950a1;color:#fff;font-weight:600;white-space:nowrap">${h}</th>`;
    });
    table += '</tr></thead>';

    // Body
    table += '<tbody>';
    for (let r = dataStart; r < lines.length; r++) {
      const cells = parseRow(lines[r]);
      const bg = (r - dataStart) % 2 === 0 ? 'transparent' : 'rgba(105,80,161,0.05)';
      table += `<tr style="background:${bg}">`;
      cells.forEach((cell: string, i: number) => {
        table += `<td style="padding:6px 12px;text-align:${alignments[i] || 'left'};border-bottom:1px solid rgba(0,0,0,0.06);white-space:nowrap">${cell}</td>`;
      });
      table += '</tr>';
    }
    table += '</tbody></table></div>';
    return table;
  });

  // Bullet lists
  html = html.replace(/^- (.+)$/gm, '<div style="padding-left:16px">• $1</div>');

  // Markdown links [text](url) — only allow https URLs
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#1496ff;text-decoration:underline">$1</a>');

  // Bare URLs (not already in an <a> tag)
  html = html.replace(/(?<!href="|&gt;)(https?:\/\/[^\s<&]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#1496ff;text-decoration:underline">$1</a>');

  // Line breaks (double newline = paragraph, single = br)
  html = html.replace(/\n\n/g, '<div style="height:8px"></div>');
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
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: isSystem ? '100%' : '90%' }}>
      <div
        style={{
          padding: isSystem ? '6px 12px' : '10px 16px',
          borderRadius: 12,
          background: bgColor,
          color: textColor,
          fontSize: isSystem ? 12 : 14,
          lineHeight: 1.5,
          wordBreak: 'break-word',
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
