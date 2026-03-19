/**
 * Knowledge base for uploaded .md documents.
 * Persisted via the Dynatrace App State API so documents survive page reloads.
 * An in-memory cache avoids repeated API calls within the same session.
 */

import { stateClient } from '@dynatrace-sdk/client-state';
import { functions } from '@dynatrace-sdk/app-utils';

const KB_PREFIX = 'kb-doc-';
const KB_MANIFEST_KEY = 'kb-manifest';
const KB_PLACEHOLDERS_KEY = 'kb-placeholders';
const KB_DISCOVERY_STATUS_KEY = 'kb-discovery-status';
const KB_FILEIDS_KEY = 'kb-file-ids';

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
  fileId?: string;  // Anthropic Files API file_id (if uploaded)
}

export type FileSyncStatus = 'synced' | 'pending' | 'modified' | 'uploading' | 'error';

// In-memory cache — synced with state API
let documents: KBDocument[] = [];
let loaded = false;

// file_id mapping: docName → anthropic file_id
let fileIdMap: Record<string, string> = {};
// content hash at upload time: docName → hash string
let uploadedHashMap: Record<string, string> = {};
let fileIdsLoaded = false;

/** Simple content hash for change detection. */
function contentHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return `${content.length}:${h}`;
}

/**
 * Load all KB documents from the Dynatrace state store into memory.
 * Call once on app init; subsequent calls return the cache.
 */
export async function loadKBDocuments(): Promise<KBDocument[]> {
  if (loaded) return [...documents];

  // Load file_id mapping
  if (!fileIdsLoaded) {
    try {
      const state = await stateClient.getAppState({ key: KB_FILEIDS_KEY });
      const parsed = JSON.parse(state.value);
      // Support both old format (flat map) and new format ({ids, hashes})
      if (parsed && typeof parsed === 'object' && parsed.ids) {
        fileIdMap = parsed.ids;
        uploadedHashMap = parsed.hashes || {};
      } else {
        fileIdMap = parsed;
        uploadedHashMap = {};
      }
    } catch {
      fileIdMap = {};
      uploadedHashMap = {};
    }
    fileIdsLoaded = true;
  }

  try {
    const manifest = await stateClient.getAppState({ key: KB_MANIFEST_KEY });
    const names: string[] = JSON.parse(manifest.value);
    const docs: KBDocument[] = [];

    for (const name of names) {
      try {
        const state = await stateClient.getAppState({ key: KB_PREFIX + name });
        const doc: KBDocument = JSON.parse(state.value);
        // Attach file_id from mapping if available
        if (fileIdMap[name]) doc.fileId = fileIdMap[name];
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

  // Remove existing doc with same name from cache, preserving fileId if set
  const existing = documents.find((d) => d.name === name);
  documents = documents.filter((d) => d.name !== name);
  const doc: KBDocument = { name, content, addedAt: Date.now() };
  // Preserve file_id from previous upload (or from fileIdMap)
  if (existing?.fileId) doc.fileId = existing.fileId;
  else if (fileIdMap[name]) doc.fileId = fileIdMap[name];
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

  // Clean up Anthropic file_id mapping
  if (fileIdMap[name]) {
    delete fileIdMap[name];
    await saveFileIdMap();
  }

  try {
    await stateClient.deleteAppState({ key: KB_PREFIX + name });
  } catch {
    // already gone
  }
  await saveManifest();
}

/* ─── Anthropic Files API integration ─── */

async function saveFileIdMap(): Promise<void> {
  await stateClient.setAppState({
    key: KB_FILEIDS_KEY,
    body: { value: JSON.stringify({ ids: fileIdMap, hashes: uploadedHashMap }) },
  });
}

/**
 * Upload a KB document to Anthropic's Files API.
 * Returns the file_id on success, or throws on failure.
 */
export async function uploadDocToAnthropic(
  docName: string,
  content: string,
  anthropicApiKey: string
): Promise<string> {
  const res = await functions.call('anthropic-files', {
    data: {
      action: 'upload',
      anthropicApiKey,
      filename: docName,
      content,
    },
  });

  const result = (await res.json()) as { ok?: boolean; data?: { id?: string }; error?: string };

  if (result.error) throw new Error(result.error);
  if (!result.ok || !result.data?.id) {
    throw new Error(`Upload failed: ${JSON.stringify(result.data)}`);
  }

  const fileId = result.data.id;

  // Update in-memory doc + mapping + hash
  const doc = documents.find((d) => d.name === docName);
  if (doc) doc.fileId = fileId;
  fileIdMap[docName] = fileId;
  uploadedHashMap[docName] = contentHash(content);
  await saveFileIdMap();

  return fileId;
}

/**
 * Delete a KB document's file from Anthropic's Files API.
 */
export async function deleteDocFromAnthropic(
  docName: string,
  anthropicApiKey: string
): Promise<void> {
  const fileId = fileIdMap[docName];
  if (!fileId) return; // nothing to delete

  await functions.call('anthropic-files', {
    data: {
      action: 'delete',
      anthropicApiKey,
      fileId,
    },
  });

  // Clean up mapping
  const doc = documents.find((d) => d.name === docName);
  if (doc) doc.fileId = undefined;
  delete fileIdMap[docName];
  delete uploadedHashMap[docName];
  await saveFileIdMap();
}

/**
 * Sync all KB documents to Anthropic: upload any that don't have a file_id yet.
 * Returns a summary of results per document.
 */
export async function syncAllDocsToAnthropic(
  anthropicApiKey: string,
  replacements?: Record<string, string>
): Promise<{ name: string; status: 'synced' | 'uploaded' | 'error'; error?: string }[]> {
  if (!loaded) await loadKBDocuments();

  const results: { name: string; status: 'synced' | 'uploaded' | 'error'; error?: string }[] = [];

  for (const doc of documents) {
    if (doc.fileId) {
      // Check if content has changed since upload
      const currentHash = contentHash(applyReplacements(doc.content, replacements));
      if (uploadedHashMap[doc.name] && uploadedHashMap[doc.name] === currentHash) {
        results.push({ name: doc.name, status: 'synced' });
        continue;
      }
      // Content changed — delete old file and re-upload
      try {
        await deleteDocFromAnthropic(doc.name, anthropicApiKey);
      } catch { /* best-effort delete of old */ }
    }

    try {
      const content = applyReplacements(doc.content, replacements);
      await uploadDocToAnthropic(doc.name, content, anthropicApiKey);
      results.push({ name: doc.name, status: 'uploaded' });
    } catch (err: unknown) {
      results.push({
        name: doc.name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Get the sync status of a KB document.
 */
export function getDocSyncStatus(docName: string): FileSyncStatus {
  if (!fileIdMap[docName]) return 'pending';
  // Check if content has changed since upload
  const doc = documents.find((d) => d.name === docName);
  if (doc && uploadedHashMap[docName]) {
    const currentHash = contentHash(doc.content);
    if (currentHash !== uploadedHashMap[docName]) return 'modified';
  }
  return 'synced';
}

/**
 * Get all file_ids for documents that have been uploaded to Anthropic.
 * Returns an array suitable for including as document references in chat.
 */
export function getDocumentFileRefs(): { file_id: string; title: string }[] {
  return documents
    .filter((d) => d.fileId)
    .map((d) => ({ file_id: d.fileId!, title: d.name }));
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
 * Replace *(Add as discovered)* template rows in a document with actual data rows.
 * `dataRows` should be pipe-delimited markdown table rows (without the template marker).
 * The section is matched via the task key (docName::sectionName).
 * `replacements` are applied to resolve placeholders before matching (and saved back).
 * Returns a debug status string for diagnostics.
 */
export async function replaceTemplateRows(
  taskKey: string,
  dataRows: string[],
  replacements?: Record<string, string>,
): Promise<string> {
  // Key format: "docName::sectionName" — split on first :: only
  const sepIdx = taskKey.indexOf('::');
  if (sepIdx < 0) return `SKIP: no :: in key "${taskKey}"`;
  const docName = taskKey.slice(0, sepIdx);
  const section = taskKey.slice(sepIdx + 2);
  const doc = documents.find((d) => d.name === docName);
  if (!doc) return `SKIP: doc "${docName}" not found (have: ${documents.map(d => d.name).join(', ')})`;

  // Apply placeholder replacements so section headings match the resolved task keys
  const resolvedContent = applyReplacements(doc.content, replacements);

  const templatePattern = /\|\s*\*\([^)]+\)\*\s*\|/;
  const lines = resolvedContent.split('\n');
  let currentSection = '';
  let anyReplaced = false;
  const sectionsFound: string[] = [];
  let templateLinesInSection = 0;

  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
      sectionsFound.push(currentSection);
    }

    // Replace every template row in the matching section
    if (currentSection === section && templatePattern.test(line)) {
      templateLinesInSection++;
      // Only insert data rows on the first template match; skip subsequent ones
      if (!anyReplaced) {
        for (const row of dataRows) {
          newLines.push(row);
        }
        anyReplaced = true;
      }
      continue; // skip the original template line
    }

    newLines.push(line);
  }

  if (anyReplaced) {
    const newContent = newLines.join('\n');
    // Save the resolved content (placeholders replaced + template rows filled)
    await addKBDocument(docName, newContent);
    return `OK: replaced ${templateLinesInSection} template row(s) with ${dataRows.length} data row(s) in section "${section}"`;
  }
  return `NO_MATCH: section="${section}" not matched. Sections found: [${sectionsFound.join(' | ')}]. Template lines in matching section: ${templateLinesInSection}`;
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
        currentSection = headingMatch[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
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

        // Skip sections with unresolved [placeholder] values
        const unresolvedPattern = /\[[a-zA-Z][a-zA-Z0-9_.]+\]/;
        if (unresolvedPattern.test(currentSection) || unresolvedPattern.test(headerRow)) continue;

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
    `CRITICAL DQL SYNTAX RULES — follow these exactly or queries will fail:`,
    ``,
    `## Entity queries`,
    `Entity types are ALWAYS lowercase after dt.entity. :`,
    `  fetch dt.entity.host | fields entity.name, id | limit 50`,
    `  fetch dt.entity.service | fields entity.name, id | limit 50`,
    `  fetch dt.entity.process_group | fields entity.name, id | limit 50`,
    `  fetch dt.entity.process_group_instance | fields entity.name, id | limit 50`,
    `  fetch dt.entity.application | fields entity.name, id | limit 50`,
    `  fetch dt.entity.custom_device | fields entity.name, id | limit 50`,
    `  fetch dt.entity.cloud_application | fields entity.name, id | limit 50`,
    `  fetch dt.entity.synthetic_test | fields entity.name, id | limit 50`,
    `  fetch dt.entity.http_check | fields entity.name, id | limit 50`,
    `  fetch dt.entity.kubernetes_cluster | fields entity.name, id | limit 50`,
    `  fetch dt.entity.kubernetes_node | fields entity.name, id | limit 50`,
    `  fetch dt.entity.container_group_instance | fields entity.name, id | limit 50`,
    ``,
    `VALID entity fields: entity.name, id, entity.detected_name, lifetime, tags, managementZones`,
    `INVALID fields that DO NOT EXIST: entity.type, technology, service.type, application.type, `,
    `  entity.technology, entity.service_type, entity.web_application_id, entity.category, `,
    `  entity.cloud_type, entity.host_group — NEVER use these.`,
    `To filter entities, use: | filter contains(entity.name, "keyword") or | filter isNotNull(tags)`,
    `For "Web Applications" or "RUM": use fetch dt.entity.application`,
    `For "Mobile Applications": use fetch dt.entity.custom_device | filter contains(entity.name, "mobile")`,
    `For backend/API services: use fetch dt.entity.service`,
    `For serverless/functions: use fetch dt.entity.cloud_application`,
    `For pods/containers: use fetch dt.entity.container_group_instance`,
    ``,
    `## BizEvents`,
    `  fetch bizevents, from:now()-7d`,
    `  | summarize count = count(), by:{event.type}`,
    `  | sort count desc`,
    `  | limit 50`,
    `Valid bizevents fields: event.type, event.provider, event.kind, timestamp, event.category`,
    ``,
    `## Metrics (discovery)`,
    `  fetch dt.metrics | fields metric.key, metric.displayName, unit | limit 50`,
    `For actual metric data use: timeseries avg(metric.key), from:now()-1h`,
    ``,
    `## Logs`,
    `  fetch logs, from:now()-24h | summarize count = count(), by:{log.source, status} | sort count desc | limit 30`,
    ``,
    `## Spans`,
    `  fetch spans, from:now()-1h | summarize count = count(), by:{span.name} | sort count desc | limit 30`,
    ``,
    `## IMPORTANT`,
    `- If a column name in the table looks like a placeholder (e.g. [event.type.1]), skip that table entirely — return a dummy dql: "fetch bizevents, from:now()-1d | limit 0" for it.`,
    `- NEVER invent field names. Only use the exact field names listed above.`,
    `- ALWAYS use lowercase entity types: dt.entity.service NOT dt.entity.SERVICE`,
    `- Keep queries lightweight with limit 50`,
    `- For summarize, use the syntax: summarize count = count(), by:{field1, field2}`,
    ``,
    `Example: [{"key":"Entities_Reference.md::Web Services","dql":"fetch dt.entity.service | fields entity.name, id | limit 50"}]`,
  ].join('\n');
}

/**
 * Build the one-time ingestion message that asks Claude to read and remember
 * all uploaded documents for the current conversation session.
 *
 * If documents have been synced to Anthropic (have file_ids), the message
 * tells Claude the files are attached as document blocks. Otherwise falls
 * back to embedding the full text inline.
 */
export function buildKBIngestionMessage(replacements?: Record<string, string>): string {
  if (documents.length === 0) return '';

  const synced = documents.filter((d) => d.fileId);
  const unsynced = documents.filter((d) => !d.fileId);

  const parts: string[] = [];

  // For synced docs: they'll be attached as document content blocks by the caller,
  // so we just mention them by name here.
  if (synced.length > 0) {
    parts.push(
      `The following ${synced.length} document${synced.length === 1 ? ' is' : 's are'} attached as file references:`,
      ...synced.map((d) => `- ${d.name}`),
      ''
    );
  }

  // For unsynced docs: embed full text inline (current behaviour)
  if (unsynced.length > 0) {
    parts.push(
      ...unsynced.map(
        (doc) => `### ${doc.name}\n${applyReplacements(doc.content, replacements)}`
      ),
      ''
    );
  }

  parts.push(
    `Please read and remember all ${documents.length} document${documents.length === 1 ? '' : 's'} for this session. Briefly summarise what each one covers.`
  );

  return parts.join('\n');
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
        currentSection = headingMatch[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
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
export function applyReplacements(content: string, replacements?: Record<string, string>): string {
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
