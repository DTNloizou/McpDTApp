/**
 * Auto-populate KB reference documents using direct DQL queries.
 * No Claude/AI needed — runs deterministic DQL against the Dynatrace SDK
 * and formats results into markdown tables to replace template rows.
 */

import { executeDql } from './mcp-client';
import { addKBDocument, getKBDocuments } from './knowledge-base';

/* ─── Types ─── */

export interface PopulateProgress {
  phase: string;
  detail: string;
  pct: number;        // 0-100
  errors: string[];
}

export type ProgressCallback = (progress: PopulateProgress) => void;

interface DqlRecord {
  [key: string]: unknown;
}

/* ─── Helpers ─── */

function parseRecords(dqlResult: Awaited<ReturnType<typeof executeDql>>): DqlRecord[] {
  if (dqlResult.status !== 'success') return [];
  const text = dqlResult.result?.content?.[0]?.text;
  if (!text || text === 'No records returned') return [];
  try {
    return JSON.parse(text) as DqlRecord[];
  } catch {
    return [];
  }
}

function fmtCount(n: unknown): string {
  const num = Number(n);
  if (isNaN(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function escPipe(s: unknown): string {
  return String(s ?? '').replace(/\|/g, '\\|').trim() || '—';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ─── Section replacers ─── */

/**
 * In a markdown document, find a section by heading text and replace
 * template table rows (those matching *(...)* ) with real data rows.
 * Also fills empty cells in static rows (like the Ingestion Source table).
 */
function replaceSection(
  content: string,
  sectionHeading: string,
  dataRows: string[],
): string {
  const lines = content.split('\n');
  const templatePattern = /\|\s*\*\([^)]+\)\*\s*\|/;
  let inSection = false;
  let replaced = false;
  const out: string[] = [];

  for (const line of lines) {
    const hm = line.match(/^#{1,4}\s+(.+)/);
    if (hm) {
      const heading = hm[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
      inSection = heading === sectionHeading;
    }
    if (inSection && templatePattern.test(line)) {
      if (!replaced) {
        out.push(...dataRows);
        replaced = true;
      }
      // skip original template line
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Append an entry to the Update Log section.
 */
function appendUpdateLog(content: string, entry: string): string {
  // Insert before the "How to Update" section if it exists, otherwise before the HTML comment
  const marker = '## 🔄 How to Update This File';
  const markerIdx = content.indexOf(marker);
  if (markerIdx > 0) {
    return content.slice(0, markerIdx) + entry + '\n\n' + content.slice(markerIdx);
  }
  // Fallback: append before trailing comment
  const commentIdx = content.indexOf('<!--');
  if (commentIdx > 0) {
    return content.slice(0, commentIdx) + entry + '\n\n' + content.slice(commentIdx);
  }
  return content + '\n\n' + entry;
}

/**
 * Replace header metadata placeholders like [DATE], [COUNT], [ANALYSIS_PERIOD].
 */
function replaceHeaderMeta(content: string, meta: Record<string, string>): string {
  let result = content;
  for (const [key, val] of Object.entries(meta)) {
    // Only replace the first occurrence in the header area (first 15 lines)
    const lines = result.split('\n');
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      if (lines[i].includes(`[${key}]`)) {
        lines[i] = lines[i].replace(`[${key}]`, val);
        break;
      }
    }
    result = lines.join('\n');
  }
  return result;
}

/* ═══════════════════════════════════════════════════
   BizEvents Auto-Populate
   ═══════════════════════════════════════════════════ */

async function populateBizEvents(
  content: string,
  onProgress: ProgressCallback,
): Promise<{ content: string; errors: string[] }> {
  const errors: string[] = [];
  let doc = content;

  // 1. Discover all event types
  onProgress({ phase: 'BizEvents', detail: 'Discovering event types...', pct: 5, errors });
  const eventTypesResult = await executeDql(
    'fetch bizevents, from:now()-7d | summarize count = count(), by:{event.type} | sort count desc | limit 50',
    50,
  );
  const eventTypes = parseRecords(eventTypesResult);
  if (eventTypes.length === 0) {
    errors.push('BizEvents: No event types found (may lack bizevents data)');
    return { content: doc, errors };
  }

  const totalEvents = eventTypes.reduce((s, r) => s + Number(r.count || 0), 0);

  // 2. Replace header metadata
  doc = replaceHeaderMeta(doc, {
    DATE: today(),
    ANALYSIS_PERIOD: 'Last 7 days',
    COUNT: String(eventTypes.length), // replaces first [COUNT] = total types
  });
  // Replace second [COUNT] for total events scanned
  const countMatches = doc.match(/\*\*Total Events Scanned:\*\*\s*\[COUNT\]/);
  if (countMatches) {
    doc = doc.replace('**Total Events Scanned:** [COUNT]', `**Total Events Scanned:** ${fmtCount(totalEvents)}`);
  }

  // 3. Ingestion source breakdown
  onProgress({ phase: 'BizEvents', detail: 'Querying ingestion sources...', pct: 15, errors });
  const sourcesResult = await executeDql(
    'fetch bizevents, from:now()-7d | summarize count = count(), by:{event.provider} | sort count desc | limit 20',
    20,
  );
  const sources = parseRecords(sourcesResult);
  if (sources.length > 0) {
    // Replace the static rows in the Ingestion Source table with real data
    const srcLines = doc.split('\n');
    const newSrcLines: string[] = [];
    let inIngestion = false;
    let pastHeader = false;
    let replaced = false;
    for (const line of srcLines) {
      const hm = line.match(/^#{1,4}\s+(.+)/);
      if (hm) {
        const h = hm[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
        inIngestion = h.includes('Ingestion Source');
        if (!h.includes('Ingestion Source')) pastHeader = false;
      }
      if (inIngestion && line.startsWith('|') && line.includes('---')) {
        pastHeader = true;
        newSrcLines.push(line);
        continue;
      }
      if (inIngestion && pastHeader && line.startsWith('|') && !replaced) {
        // Skip all old data rows, insert new
        // Consume remaining rows of this table
        const tableRows: string[] = [];
        for (const src of sources) {
          const provider = String(src['event.provider'] ?? 'Unknown');
          const cnt = Number(src.count ?? 0);
          const pct = totalEvents > 0 ? ((cnt / totalEvents) * 100).toFixed(1) : '0';
          const perDay = fmtCount(cnt / 7);
          tableRows.push(`| ${escPipe(provider)} | ${perDay} | ${pct}% | Auto-discovered |`);
        }
        newSrcLines.push(...tableRows);
        replaced = true;
        // Skip the rest of the static table rows
        continue;
      }
      // Skip remaining static rows in the ingestion table
      if (inIngestion && pastHeader && replaced && line.startsWith('|')) {
        continue;
      }
      if (inIngestion && pastHeader && replaced && !line.startsWith('|')) {
        inIngestion = false;
        pastHeader = false;
      }
      newSrcLines.push(line);
    }
    doc = newSrcLines.join('\n');
  }

  // 4. High-volume event types (top 10)
  onProgress({ phase: 'BizEvents', detail: 'Formatting event type tables...', pct: 30, errors });
  const highVolume = eventTypes.slice(0, 10);
  const hvRows = highVolume.map((r) => {
    const dailyCount = fmtCount(Number(r.count ?? 0) / 7);
    const evtType = escPipe(r['event.type']);
    const needsFilter = Number(r.count ?? 0) / 7 > 10000 ? '⚠️ Yes' : 'No';
    return `| \`${evtType}\` | ${dailyCount} | Auto-discovered | ${needsFilter} |`;
  });
  doc = replaceSection(doc, 'High-Volume Event Types', hvRows);

  // 5. Category tables — group event types by prefix (first segment before dot or underscore)
  onProgress({ phase: 'BizEvents', detail: 'Categorizing event types...', pct: 40, errors });
  const categories = new Map<string, DqlRecord[]>();
  for (const r of eventTypes) {
    const evtType = String(r['event.type'] ?? '');
    // Take the first meaningful segment as category
    const parts = evtType.split(/[._-]/);
    const cat = parts.length > 1 ? parts[0] : 'other';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(r);
  }

  // Build category sections replacing the template Category 1 / Category 2
  const catSections: string[] = [];
  let catIdx = 0;
  for (const [catName, records] of categories) {
    catIdx++;
    catSections.push(`### 📊 Category ${catIdx}: ${catName}`);
    catSections.push('| Event Type | Count (7d) | Description |');
    catSections.push('|------------|------------|-------------|');
    for (const r of records) {
      catSections.push(`| \`${escPipe(r['event.type'])}\` | ${fmtCount(r.count)} | Auto-discovered |`);
    }
    catSections.push('');
  }

  // Replace the template Category 1 and Category 2 sections
  const catLines = doc.split('\n');
  const catOut: string[] = [];
  let skipCatSection = false;
  let catInserted = false;
  for (let i = 0; i < catLines.length; i++) {
    const line = catLines[i];
    const hm = line.match(/^###\s+📊\s+Category\s+\d+:/);
    if (hm) {
      if (!catInserted) {
        catOut.push(...catSections);
        catInserted = true;
      }
      skipCatSection = true;
      continue;
    }
    if (skipCatSection) {
      // Keep skipping until we hit a new section heading of different type
      if (line.match(/^#{1,3}\s+/) && !line.match(/^###\s+📊\s+Category/)) {
        skipCatSection = false;
        catOut.push(line);
      }
      continue;
    }
    catOut.push(line);
  }
  doc = catOut.join('\n');

  // 6. High-volume warning table
  const warnRows = eventTypes
    .filter((r) => Number(r.count ?? 0) / 7 > 10000)
    .map((r) => `| \`${escPipe(r['event.type'])}\` | ${fmtCount(Number(r.count ?? 0) / 7)}/day | ⚠️ Add filters |`);
  if (warnRows.length > 0) {
    doc = replaceSection(doc, 'High-Volume Event Types', warnRows); // second table with same pattern
  }

  // 7. Discover fields for top 3 event types
  onProgress({ phase: 'BizEvents', detail: 'Discovering fields for top event types...', pct: 50, errors });
  const topTypes = eventTypes.slice(0, 3);
  const fieldSections: string[] = [];
  for (const et of topTypes) {
    const evtType = String(et['event.type'] ?? '');
    const sampleResult = await executeDql(
      `fetch bizevents, from:now()-24h | filter event.type == "${evtType}" | limit 1`,
      1,
    );
    const samples = parseRecords(sampleResult);
    if (samples.length > 0) {
      const record = samples[0];
      fieldSections.push(`#### ${evtType}`);
      fieldSections.push('| Field | Type | Example | Description |');
      fieldSections.push('|-------|------|---------|-------------|');
      for (const [key, val] of Object.entries(record)) {
        if (key.startsWith('__')) continue; // internal fields
        const valType = val === null ? 'null' : typeof val;
        const example = String(val ?? '').slice(0, 50);
        fieldSections.push(`| \`${escPipe(key)}\` | ${valType} | ${escPipe(example)} | Auto-discovered |`);
      }
      fieldSections.push('');
    }
  }

  // Replace the [event.type.1] template section
  if (fieldSections.length > 0) {
    const fieldLines = doc.split('\n');
    const fieldOut: string[] = [];
    let skipFieldTemplate = false;
    let fieldInserted = false;
    for (const line of fieldLines) {
      // Detect the template field section
      if (line.match(/^####\s+\[event\.type\.\d+\]/)) {
        if (!fieldInserted) {
          fieldOut.push(...fieldSections);
          fieldInserted = true;
        }
        skipFieldTemplate = true;
        continue;
      }
      if (skipFieldTemplate) {
        if (line.match(/^#{1,4}\s+/) && !line.match(/^####\s+\[event\.type/)) {
          skipFieldTemplate = false;
          fieldOut.push(line);
        } else if (line === '---') {
          skipFieldTemplate = false;
          fieldOut.push(line);
        }
        continue;
      }
      fieldOut.push(line);
    }
    if (!fieldInserted) {
      // No template marker found — append field sections before "Efficient Query Patterns"
      const effIdx = doc.indexOf('## 📈 Efficient Query Patterns');
      if (effIdx > 0) {
        doc = doc.slice(0, effIdx) + fieldSections.join('\n') + '\n\n' + doc.slice(effIdx);
      }
    } else {
      doc = fieldOut.join('\n');
    }
  }

  // 8. Fill in the sample event section
  onProgress({ phase: 'BizEvents', detail: 'Adding sample event...', pct: 65, errors });
  if (topTypes.length > 0) {
    const topType = String(topTypes[0]['event.type'] ?? 'unknown');
    doc = doc.replace('[Example Event Type]', topType);
    doc = doc.replace('`your.event.type`', `\`${topType}\``);
  }

  // 9. Update log
  const logEntry = [
    `### ${today()} — Auto-Population`,
    `- **Source:** Direct DQL queries (no AI)`,
    `- **Finding:** Discovered ${eventTypes.length} event types`,
    `- **Data:** Top events: ${eventTypes.slice(0, 3).map(r => `${r['event.type']} (${fmtCount(r.count)})`).join(', ')}`,
  ].join('\n');
  doc = appendUpdateLog(doc, logEntry);

  onProgress({ phase: 'BizEvents', detail: 'Done', pct: 70, errors });
  return { content: doc, errors };
}

/* ═══════════════════════════════════════════════════
   Entities Auto-Populate
   ═══════════════════════════════════════════════════ */

async function populateEntities(
  content: string,
  onProgress: ProgressCallback,
): Promise<{ content: string; errors: string[] }> {
  const errors: string[] = [];
  let doc = content;

  const entityQueries: { heading: string; dql: string; columns: (r: DqlRecord) => string }[] = [
    {
      heading: 'Web Services (Frontend Applications)',
      dql: 'fetch dt.entity.application | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Auto-discovered | Application | ${today()} |`,
    },
    {
      heading: 'Backend Services / APIs',
      dql: 'fetch dt.entity.service | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Auto-discovered | ${today()} |`,
    },
    {
      heading: 'Azure Functions / Serverless',
      dql: 'fetch dt.entity.cloud_application | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Auto-discovered | ${today()} |`,
    },
    {
      heading: 'Host Entities',
      dql: 'fetch dt.entity.host | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Auto-discovered | ${today()} |`,
    },
    {
      heading: 'Process Entities',
      dql: 'fetch dt.entity.process_group | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Process Group | ${today()} |`,
    },
    {
      heading: 'Container Entities',
      dql: 'fetch dt.entity.container_group_instance | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | — | ${today()} |`,
    },
    {
      heading: 'RUM Application Entities',
      dql: 'fetch dt.entity.application | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | — | Auto-discovered | ${today()} |`,
    },
    {
      heading: 'Web Applications',
      dql: 'fetch dt.entity.application | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | Web | ${today()} |`,
    },
    {
      heading: 'Clusters',
      dql: 'fetch dt.entity.kubernetes_cluster | fields entity.name, id | limit 50',
      columns: (r) => `| ${escPipe(r['entity.name'])} | \`${escPipe(r.id)}\` | ${today()} |`,
    },
  ];

  let step = 0;
  const totalSteps = entityQueries.length;

  for (const eq of entityQueries) {
    step++;
    const pctBase = 70 + (step / totalSteps) * 15;
    onProgress({ phase: 'Entities', detail: `Querying ${eq.heading}...`, pct: pctBase, errors });

    const result = await executeDql(eq.dql, 50);
    const records = parseRecords(result);

    if (records.length === 0) {
      errors.push(`Entities: No data for ${eq.heading}`);
      continue;
    }

    const rows = records.map(eq.columns);
    doc = replaceSection(doc, eq.heading, rows);
  }

  // Update header metadata
  doc = replaceHeaderMeta(doc, { DATE: today() });

  // Update log
  const logEntry = [
    `### ${today()} — Auto-Population`,
    `- **Source:** Direct DQL queries (no AI)`,
    `- **Finding:** Populated entity tables from environment`,
    `- **Data:** Queried ${entityQueries.length} entity types`,
  ].join('\n');
  doc = appendUpdateLog(doc, logEntry);

  return { content: doc, errors };
}

/* ═══════════════════════════════════════════════════
   Logs Auto-Populate
   ═══════════════════════════════════════════════════ */

async function populateLogs(
  content: string,
  onProgress: ProgressCallback,
): Promise<{ content: string; errors: string[] }> {
  const errors: string[] = [];
  let doc = content;

  // 1. Log level distribution
  onProgress({ phase: 'Logs', detail: 'Querying log level distribution...', pct: 85, errors });
  const levelResult = await executeDql(
    'fetch logs, from:now()-24h | summarize count = count(), by:{loglevel} | sort count desc',
    20,
  );
  const levels = parseRecords(levelResult);
  if (levels.length > 0) {
    const totalLogs = levels.reduce((s, r) => s + Number(r.count ?? 0), 0);
    // Replace the log level table rows — these are static placeholder rows, not template rows
    const levelLines = doc.split('\n');
    const levelOut: string[] = [];
    let inLevelTable = false;
    let pastLevelHeader = false;
    let levelReplaced = false;
    for (const line of levelLines) {
      const hm = line.match(/^#{1,4}\s+(.+)/);
      if (hm) {
        const h = hm[1].replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
        inLevelTable = h.includes('Log Level Distribution');
      }
      if (inLevelTable && line.startsWith('|') && line.includes('---')) {
        pastLevelHeader = true;
        levelOut.push(line);
        continue;
      }
      if (inLevelTable && pastLevelHeader && line.startsWith('|') && !levelReplaced) {
        // Replace with real data
        const colourMap: Record<string, string> = {
          ERROR: '🔴 Red', WARN: '🟠 Orange', INFO: '🟢 Green',
          DEBUG: '🟣 Purple', NONE: '⚪ Grey',
        };
        for (const l of levels) {
          const lv = String(l.loglevel ?? 'UNKNOWN');
          const cnt = Number(l.count ?? 0);
          const pct = totalLogs > 0 ? ((cnt / totalLogs) * 100).toFixed(1) : '0';
          levelOut.push(`| ${lv} | ${fmtCount(cnt)} | ${pct}% | ${colourMap[lv] ?? '⚪ Unknown'} |`);
        }
        levelReplaced = true;
        continue;
      }
      if (inLevelTable && pastLevelHeader && levelReplaced && line.startsWith('|')) continue;
      if (inLevelTable && pastLevelHeader && levelReplaced && !line.startsWith('|')) {
        inLevelTable = false;
        pastLevelHeader = false;
      }
      levelOut.push(line);
    }
    doc = levelOut.join('\n');
    // Remove the "Populate with actual data" note
    doc = doc.replace(/\n\*\(Populate with actual data from your environment\)\*\n?/, '\n');
  } else {
    errors.push('Logs: No log level data returned');
  }

  // 2. Log sources
  onProgress({ phase: 'Logs', detail: 'Querying log sources...', pct: 90, errors });
  const srcResult = await executeDql(
    'fetch logs, from:now()-24h | summarize count = count(), by:{log.source} | sort count desc | limit 20',
    20,
  );
  const logSources = parseRecords(srcResult);
  if (logSources.length > 0) {
    const srcRows = logSources.map((r) =>
      `| ${escPipe(r['log.source'])} | Auto-discovered | ${fmtCount(r.count)} |`
    );
    doc = replaceSection(doc, 'Log Sources', srcRows);
  }

  // Update header metadata
  doc = replaceHeaderMeta(doc, { DATE: today() });

  // Update log
  const logEntry = [
    `### ${today()} — Auto-Population`,
    `- **Source:** Direct DQL queries (no AI)`,
    `- **Finding:** Populated log level distribution and sources`,
    `- **Data:** Found ${levels.length} log levels, ${logSources.length} sources`,
  ].join('\n');
  doc = appendUpdateLog(doc, logEntry);

  return { content: doc, errors };
}

/* ═══════════════════════════════════════════════════
   Metrics Auto-Populate
   ═══════════════════════════════════════════════════ */

async function populateMetrics(
  content: string,
  onProgress: ProgressCallback,
): Promise<{ content: string; errors: string[] }> {
  const errors: string[] = [];
  let doc = content;

  // Custom metrics discovery
  onProgress({ phase: 'Metrics', detail: 'Discovering custom metrics...', pct: 92, errors });
  const metricsResult = await executeDql(
    'fetch dt.metrics | filter not startsWith(metric.key, "dt.") | fields metric.key, metric.displayName, unit | limit 50',
    50,
  );
  const metrics = parseRecords(metricsResult);
  if (metrics.length > 0) {
    const metricRows = metrics.map((r) =>
      `| \`${escPipe(r['metric.key'])}\` | ${escPipe(r['metric.displayName'] || r['metric.key'])} | ${escPipe(r.unit || 'unknown')} |`
    );
    doc = replaceSection(doc, 'Custom Metrics', metricRows);
  } else {
    errors.push('Metrics: No custom metrics found');
  }

  doc = replaceHeaderMeta(doc, { DATE: today() });

  const logEntry = [
    `### ${today()} — Auto-Population`,
    `- **Source:** Direct DQL queries (no AI)`,
    `- **Finding:** Discovered ${metrics.length} custom metrics`,
    `- **Data:** ${metrics.slice(0, 3).map(r => r['metric.key']).join(', ') || 'None'}`,
  ].join('\n');
  doc = appendUpdateLog(doc, logEntry);

  return { content: doc, errors };
}

/* ═══════════════════════════════════════════════════
   Spans Auto-Populate
   ═══════════════════════════════════════════════════ */

async function populateSpans(
  content: string,
  onProgress: ProgressCallback,
): Promise<{ content: string; errors: string[] }> {
  const errors: string[] = [];
  let doc = content;

  // Discover top services by span count (1h to keep cost low)
  onProgress({ phase: 'Spans', detail: 'Discovering span services (1h window)...', pct: 95, errors });
  const svcResult = await executeDql(
    'fetch spans, from:now()-1h | summarize count = count(), by:{dt.entity.service} | sort count desc | limit 10',
    10,
  );
  const services = parseRecords(svcResult);

  if (services.length > 0) {
    // For the top service, get span names
    const topSvc = String(services[0]['dt.entity.service'] ?? '');
    if (topSvc) {
      onProgress({ phase: 'Spans', detail: `Discovering spans for ${topSvc}...`, pct: 97, errors });
      const spanResult = await executeDql(
        `fetch spans, from:now()-1h | filter dt.entity.service == "${topSvc}" | summarize count = count(), errors = countIf(otel.status_code == "ERROR"), avgDuration = avg(duration)/1000000, by:{span.name} | sort count desc | limit 20`,
        20,
      );
      const spans = parseRecords(spanResult);
      if (spans.length > 0) {
        const spanRows = spans.map((r) => {
          const count = fmtCount(r.count);
          const errCount = String(r.errors ?? 0);
          const avgMs = Number(r.avgDuration ?? 0).toFixed(1);
          return `| ${escPipe(r['span.name'])} | ${count} | ${errCount} | ${avgMs}ms | — | Auto-discovered |`;
        });
        doc = replaceSection(doc, 'Span Names & Volumes', spanRows);

        // Fill service name
        doc = doc.replace('[SERVICE_NAME]', topSvc);
        doc = doc.replace('`SERVICE-XXXXXXXXXXXX`', `\`${topSvc}\``);
      }
    }
  } else {
    errors.push('Spans: No span data found in last 1h');
  }

  doc = replaceHeaderMeta(doc, { DATE: today() });

  const logEntry = [
    `### ${today()} — Auto-Population`,
    `- **Source:** Direct DQL queries (no AI, 1h window)`,
    `- **Finding:** Discovered ${services.length} services with spans`,
    `- **Data:** Top: ${services.slice(0, 3).map(r => r['dt.entity.service']).join(', ') || 'None'}`,
  ].join('\n');
  doc = appendUpdateLog(doc, logEntry);

  return { content: doc, errors };
}

/* ═══════════════════════════════════════════════════
   Main Orchestrator
   ═══════════════════════════════════════════════════ */

export interface PopulateResult {
  updated: string[];   // doc names that were updated
  errors: string[];    // all errors encountered
}

/**
 * Auto-populate all KB reference documents using direct DQL.
 * Only updates documents that exist in the KB store (uploaded versions).
 * Returns list of updated doc names and any errors.
 */
export async function autoPopulateKB(
  onProgress: ProgressCallback,
): Promise<PopulateResult> {
  const docs = getKBDocuments();
  const updated: string[] = [];
  const allErrors: string[] = [];

  const populators: {
    filename: string;
    fn: (content: string, cb: ProgressCallback) => Promise<{ content: string; errors: string[] }>;
  }[] = [
    { filename: 'BizEvents_Reference.md', fn: populateBizEvents },
    { filename: 'Entities_Reference.md', fn: populateEntities },
    { filename: 'Logs_Reference.md', fn: populateLogs },
    { filename: 'Metrics_Reference.md', fn: populateMetrics },
    { filename: 'Spans_Reference.md', fn: populateSpans },
  ];

  for (const p of populators) {
    const doc = docs.find((d) => d.name === p.filename);
    if (!doc) {
      onProgress({ phase: p.filename, detail: 'Skipped (not in KB)', pct: 0, errors: allErrors });
      continue;
    }

    try {
      const { content, errors } = await p.fn(doc.content, onProgress);
      allErrors.push(...errors);

      if (content !== doc.content) {
        await addKBDocument(p.filename, content);
        updated.push(p.filename);
      }
    } catch (err: unknown) {
      allErrors.push(`${p.filename}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  onProgress({ phase: 'Complete', detail: `Updated ${updated.length} documents`, pct: 100, errors: allErrors });
  return { updated, errors: allErrors };
}
