/**
 * Knowledge base for uploaded .md documents.
 * Persisted via the Dynatrace App State API so documents survive page reloads.
 * An in-memory cache avoids repeated API calls within the same session.
 */

import { stateClient } from '@dynatrace-sdk/client-state';

const KB_PREFIX = 'kb-doc-';
const KB_MANIFEST_KEY = 'kb-manifest';
const KB_PLACEHOLDERS_KEY = 'kb-placeholders';
const KB_DISCOVERY_STATUS_KEY = 'kb-discovery-status';

// Patterns we ignore when detecting placeholders (common markdown/code tokens)
const IGNORED_TOKENS = new Set([
  'OK', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
  'JSON', 'CSV', 'XML', 'HTML', 'ID', 'URL', 'API', 'SDK', 'CLI',
  'NOTE', 'WARNING', 'IMPORTANT', 'TIP', 'AVOID', 'NEVER', 'TODO',
  'TRUE', 'FALSE', 'NULL', 'YES', 'NO', 'NA', 'TBD', 'WIP',
]);

export interface KBDocument {
  name: string;
  content: string;
  addedAt: number; // timestamp
}

// In-memory cache — synced with state API
let documents: KBDocument[] = [];
let loaded = false;

/**
 * Load all KB documents from the Dynatrace state store into memory.
 * Call once on app init; subsequent calls return the cache.
 */
export async function loadKBDocuments(): Promise<KBDocument[]> {
  if (loaded) return [...documents];

  try {
    const manifest = await stateClient.getAppState({ key: KB_MANIFEST_KEY });
    const names: string[] = JSON.parse(manifest.value);
    const docs: KBDocument[] = [];

    for (const name of names) {
      try {
        const state = await stateClient.getAppState({ key: KB_PREFIX + name });
        const doc: KBDocument = JSON.parse(state.value);
        docs.push(doc);
      } catch {
        // individual doc missing — skip
      }
    }

    documents = docs;
  } catch {
    // no manifest yet — fresh state
    documents = [];
  }

  loaded = true;
  return [...documents];
}

export function getKBDocuments(): KBDocument[] {
  return [...documents];
}

export async function addKBDocument(name: string, content: string): Promise<void> {
  // Ensure cache is populated
  if (!loaded) await loadKBDocuments();

  // Remove existing doc with same name from cache
  documents = documents.filter((d) => d.name !== name);
  const doc: KBDocument = { name, content, addedAt: Date.now() };
  documents.push(doc);

  // Persist doc and update manifest
  await stateClient.setAppState({
    key: KB_PREFIX + name,
    body: { value: JSON.stringify(doc) },
  });
  await saveManifest();
}

export async function removeKBDocument(name: string): Promise<void> {
  documents = documents.filter((d) => d.name !== name);

  try {
    await stateClient.deleteAppState({ key: KB_PREFIX + name });
  } catch {
    // already gone
  }
  await saveManifest();
}

/**
 * Append a new entry to an existing KB document, or create it if it doesn't exist.
 * Used for accumulating findings over time (e.g. discovered-problems.md).
 */
export async function appendToKBDocument(name: string, entry: string): Promise<void> {
  if (!loaded) await loadKBDocuments();

  const existing = documents.find((d) => d.name === name);
  const newContent = existing
    ? `${existing.content}\n\n---\n\n${entry}`
    : entry;

  await addKBDocument(name, newContent);
}

async function saveManifest(): Promise<void> {
  const names = documents.map((d) => d.name);
  await stateClient.setAppState({
    key: KB_MANIFEST_KEY,
    body: { value: JSON.stringify(names) },
  });
}

/**
 * Build a context string from all uploaded documents for inclusion in prompts.
 */
/**
 * Condensed summary of KB docs for lightweight prompts (avoids 504 timeouts).
 * Returns doc names + first few content lines each — enough for Claude to reference.
 */
export function buildKBSummary(replacements?: Record<string, string>): string {
  if (documents.length === 0) return '';

  const parts = documents.map((doc) => {
    const content = applyReplacements(doc.content, replacements);
    const lines = content.split('\n').filter((l) => l.trim()).slice(0, 10);
    return `- **${doc.name}**: ${lines.join(' | ')}`;
  });

  return [
    `Reference documents available (summaries):`,
    ...parts,
  ].join('\n');
}

export function buildKBContext(replacements?: Record<string, string>): string {
  if (documents.length === 0) return '';

  const parts = documents.map(
    (doc) => `--- ${doc.name} ---\n${applyReplacements(doc.content, replacements)}`
  );

  return [
    `The user has provided the following reference documents. Use them as context when answering:`,
    ``,
    ...parts,
    ``,
    `--- End of reference documents ---`,
    ``,
  ].join('\n');
}

export interface DiscoveryTask {
  key: string;       // stable identifier e.g. "Entities_Reference.md::Web Services"
  label: string;     // e.g. "Entities_Reference.md — Web Services"
  headerRow: string; // table header for formatting results
}

/**
 * Extract discovery table metadata — one per unique table with *(Add as discovered)*.
 */
export function buildDiscoveryTasks(replacements?: Record<string, string>): DiscoveryTask[] {
  if (documents.length === 0) return [];

  const tasks: DiscoveryTask[] = [];
  const pattern = /\|\s*\*\([^)]+\)\*\s*\|/;

  for (const doc of documents) {
    const content = applyReplacements(doc.content, replacements);
    const lines = content.split('\n');
    let currentSection = '';
    const seen = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,4}\s+(.+)/);
      if (headingMatch) {
        currentSection = headingMatch[1].replace(/[🏢🖥️📦📱🌐📊🔍📈⚡🔧💰📋🔗⚠️✅]/gu, '').trim();
      }
      if (pattern.test(line)) {
        let headerRow = '';
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (lines[j].startsWith('|') && !lines[j].includes('---')) {
            headerRow = lines[j].trim();
            break;
          }
        }
        if (!headerRow) continue;
        const dedupKey = `${currentSection}::${headerRow}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        tasks.push({
          key: `${doc.name}::${currentSection}`,
          label: `${doc.name} — ${currentSection}`,
          headerRow,
        });
      }
    }
  }

  return tasks;
}

/**
 * Build a single prompt that asks Claude to generate DQL queries for all
 * pending discovery tables. One Claude call, then run queries directly.
 */
export function buildQueryGenerationPrompt(tasks: DiscoveryTask[]): string {
  const tableDescriptions = tasks.map((t, i) =>
    `${i + 1}. key: "${t.key}"\n   Section: "${t.label}"\n   Columns: ${t.headerRow}`
  ).join('\n');

  return [
    `I need DQL queries for my Dynatrace environment to populate these reference tables.`,
    `For each table below, generate the best DQL query to discover the data.`,
    ``,
    tableDescriptions,
    ``,
    `Return ONLY a valid JSON array (no markdown fences, no explanation) where each item has:`,
    `- "key": the exact key string from above`,
    `- "dql": a valid Dynatrace DQL query`,
    ``,
    `DQL rules:`,
    `- Entities: fetch dt.entity.SERVICE, dt.entity.HOST, dt.entity.PROCESS_GROUP, dt.entity.APPLICATION, dt.entity.CONTAINER_GROUP, dt.entity.SYNTHETIC_TEST, dt.entity.CUSTOM_DEVICE etc. Use | fields entity.name, id | limit 50`,
    `- BizEvents: fetch bizevents, from:now()-7d | summarize count=count(), by:{event.type} | sort count desc | limit 50`,
    `- Logs: fetch logs, from:now()-24h | summarize count=count(), by:{log.source, status} | sort count desc | limit 30`,
    `- Spans: fetch spans, from:now()-1h | summarize count=count(), by:{span.name} | sort count desc | limit 30`,
    `- Keep queries lightweight with appropriate limits`,
    ``,
    `Example: [{"key":"Entities_Reference.md::Web Services","dql":"fetch dt.entity.SERVICE | fields entity.name, id | limit 50"}]`,
  ].join('\n');
}

/**
 * Build the one-time ingestion message that asks Claude to read and remember
 * all uploaded documents for the current conversation session.
 */
export function buildKBIngestionMessage(replacements?: Record<string, string>): string {
  if (documents.length === 0) return '';

  const parts = documents.map(
    (doc) => `### ${doc.name}\n${applyReplacements(doc.content, replacements)}`
  );

  return [
    `I'm providing you with ${documents.length} reference document${documents.length === 1 ? '' : 's'} to use as context for our conversation. Please read and remember the content for all future questions in this session.`,
    ``,
    ...parts,
    ``,
    `Please confirm you've read these documents and briefly summarise what each one covers.`,
  ].join('\n');
}

/* ─── Placeholder detection & replacement ─── */

export interface PlaceholderInfo {
  token: string;        // e.g. "[TENANT_ID]"
  friendlyName: string; // e.g. "Tenant ID"
  occurrences: number;  // how many times it appears across all docs
}

export interface DiscoveryPlaceholder {
  text: string;     // e.g. "*(Add as discovered)*"
  docName: string;  // which file it's in
  section: string;  // table section heading (the ### above it)
}

/**
 * Scan all loaded KB documents and return unique placeholders found.
 * Detects patterns like [TENANT_ID], [CLIENT_NAME], [DATE], etc.
 */
export function detectPlaceholders(): PlaceholderInfo[] {
  const counts = new Map<string, number>();
  const pattern = /\[([A-Z][A-Za-z_ ]{1,30})\]/g;

  for (const doc of documents) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(doc.content)) !== null) {
      const inner = match[1].trim();
      if (IGNORED_TOKENS.has(inner)) continue;
      // Must have at least 2 chars and look like a placeholder (mostly uppercase)
      if (inner.length < 2) continue;
      const upperRatio = (inner.replace(/[^A-Z]/g, '').length) / inner.replace(/[ _]/g, '').length;
      if (upperRatio < 0.6) continue;
      const token = `[${inner}]`;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([token, occurrences]) => ({
    token,
    friendlyName: token
      .slice(1, -1)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bId\b/, 'ID')
      .replace(/\bUrl\b/, 'URL'),
    occurrences,
  }));
}

/**
 * Detect *(Add as discovered)* style template rows in KB docs.
 * These are table rows the AI should populate with real data from MCP queries.
 */
export function detectDiscoveryPlaceholders(): DiscoveryPlaceholder[] {
  const results: DiscoveryPlaceholder[] = [];
  const pattern = /\|\s*\*\(([^)]+)\)\*\s*\|/g;

  for (const doc of documents) {
    const lines = doc.content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      // Track current section heading
      const headingMatch = line.match(/^#{1,4}\s+(.+)/);
      if (headingMatch) {
        currentSection = headingMatch[1].replace(/[🏢🖥️📦📱🌐📊🔍📈⚡🔧💰📋🔗⚠️✅]/gu, '').trim();
      }
      // Check for template row
      const rowMatch = pattern.exec(line);
      if (rowMatch) {
        results.push({
          text: rowMatch[1].trim(),
          docName: doc.name,
          section: currentSection,
        });
      }
      pattern.lastIndex = 0; // reset for next line
    }
  }

  return results;
}

/**
 * Apply placeholder replacements to a document content string.
 */
function applyReplacements(content: string, replacements?: Record<string, string>): string {
  if (!replacements) return content;
  let result = content;
  for (const [token, value] of Object.entries(replacements)) {
    if (value.trim()) {
      result = result.split(token).join(value);
    }
  }
  return result;
}

/**
 * Persist placeholder values so users don't have to re-enter them.
 */
export async function savePlaceholderValues(values: Record<string, string>): Promise<void> {
  await stateClient.setAppState({
    key: KB_PLACEHOLDERS_KEY,
    body: { value: JSON.stringify(values) },
  });
}

/**
 * Load persisted placeholder values.
 */
export async function loadPlaceholderValues(): Promise<Record<string, string>> {
  try {
    const state = await stateClient.getAppState({ key: KB_PLACEHOLDERS_KEY });
    return JSON.parse(state.value);
  } catch {
    return {};
  }
}

/**
 * Save which discovery tasks have been completed (by key).
 */
export async function saveDiscoveryStatus(completedKeys: string[]): Promise<void> {
  await stateClient.setAppState({
    key: KB_DISCOVERY_STATUS_KEY,
    body: { value: JSON.stringify(completedKeys) },
  });
}

/**
 * Load previously completed discovery task keys.
 */
export async function loadDiscoveryStatus(): Promise<string[]> {
  try {
    const state = await stateClient.getAppState({ key: KB_DISCOVERY_STATUS_KEY });
    return JSON.parse(state.value);
  } catch {
    return [];
  }
}
