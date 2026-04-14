/**
 * AUTO-GENERATED — do not edit manually.
 * Generated from 14 .md file(s) in ui/app/kb/
 * Run: node scripts/generate-kb-defaults.mjs
 */

export const AI_Prompt = `# Dynatrace AI Assistant Instructions

> **Environment:** [TENANT_ID]  
> **Client:** [CLIENT_NAME]  
> **IMPORTANT:** Always read \`MCP_Query_Optimization_Guide.md\` before making any Dynatrace MCP queries

---

## 🚨 CRITICAL: MCP Query Cost Optimization

Before using ANY Dynatrace MCP tools, follow these rules to minimize Grail budget consumption:

### Query Cost Hierarchy (Use in Order)
1. **FREE:** \`find_entity_by_name\`, \`list_problems\`, \`list_vulnerabilities\`, metrics timeseries
2. **LOW (0-5 GB):** BizEvents with \`event.type\` filter + additional filters + 7d
3. **MEDIUM (10-20 GB):** Logs with loglevel filter + 24h, Spans with entity filter + 24h
4. **HIGH (100+ GB):** Spans 7d, Logs without filters - AVOID unless necessary

### Mandatory Practices
- **Always use \`find_entity_by_name\` FIRST** to get entity IDs (costs 0 GB)
- **Use \`timeseries\` for metrics** instead of \`fetch spans\` (free vs 100+ GB)
- **Start with 24h timeframe**, only extend to 7d after validating query
- **Filter BizEvents by \`event.type\` BEFORE other filters**
- **Use \`summarize\` aggregations** - never fetch raw data for exploration
- **Set \`recordLimit: 10-20\`** for exploration queries

### Known Entity IDs (Cache These)
| Entity Name | Entity ID | Type |
|-------------|-----------|------|
| *(Populate from Entities_Reference.md)* | | |

### High-Volume Events (Add Extra Filters)
| Event Type | Volume | Required Filters |
|------------|--------|------------------|
| *(Populate from BizEvents_Reference.md)* | | |

---

## Standard Task Templates

### Template 1: New Customer Dashboard
You are a Dynatrace Solutions Engineer. Your customer is [CLIENT_NAME] and their website is [WEBSITE_URL].  
You need to research what business KPIs are important to them.
With that research data, you need to create a demonstration Dynatrace Dashboard and injection javascript for business events that will run every hour in a dynatrace workflow.  
The dashboard must be a Gen 3 Dashboard, not a dynatrace classic dashboard. Use the examples in the example directory of my workspace for proper json and javascript syntax.
Change the colours of the dashboard to match the branding colours of the company.

### Template 2: Error Analysis Dashboard
Analyse the application errors and exceptions.
You need to research what errors are occurring and their business impact.
With that research data, you need to create a demonstration Dynatrace Dashboard.
The dashboard must be a Gen 3 Dashboard, not a dynatrace classic dashboard. Use the examples in the example directory of my workspace for proper json and javascript syntax.
Change the colours of the dashboard to match the branding colours of the company.

### Template 3: Service Performance Dashboard
Create a service performance dashboard for [SERVICE_NAME].
Include: request volume, response times, error rates, and trends.
Use brand colours from their website.
Add service dependencies and topology insights.
Focus on SLO-relevant metrics.

### Template 4: Infrastructure Overview Dashboard
Create an infrastructure health dashboard.
Include: host metrics (CPU, memory, disk), container health, Kubernetes status.
Highlight anomalies and capacity concerns.
Use appropriate thresholds for traffic light indicators.

### Template 5: Business Analytics Dashboard
Create a business-aligned analytics dashboard for [USE_CASE].
**IMPORTANT:** Read BizEvents_Reference.md and Entities_Reference.md FIRST before any queries.
Research available BizEvents data:
1. Use cached entity IDs from Entities_Reference.md (avoid find_entity_by_name)
2. Query BizEvents with \`event.type\` filter first
3. Start with 24h timeframe for exploration
Include: key business KPIs, conversion funnels, revenue metrics.
Add trend analysis and comparisons.

### Template 6: Brand/Product Comparison Dashboard
Create a multi-brand or multi-product comparison dashboard.
**IMPORTANT:** Read BizEvents_Reference.md and Entities_Reference.md FIRST before any queries.
Compare: revenue, orders, conversion rates, error rates across brands/products.
Use consistent color coding and visualizations.
Highlight top and bottom performers.
Include sparklines for trend visibility.

---

## Reference Documents & Reading Order

### ALWAYS Read First (Before ANY Queries)
1. **DATA_REFERENCE_INDEX.md** - Central index and quick lookups
2. **Entities_Reference.md** - Cached entity IDs (avoid repeat lookups)
3. **MCP_Query_Optimization_Guide.md** - Cost rules and best practices

### Read Based on Task Type
- **BizEvents analysis:** BizEvents_Reference.md
- **Service performance:** Spans_Reference.md + Metrics_Reference.md
- **Error investigation:** Logs_Reference.md
- **Infrastructure:** Entities_Reference.md

### Use for Examples
- **example/ directory** - Gen 3 Dashboard JSON and JavaScript syntax

---
- \`MCP_Query_Optimization_Guide.md\` - Full query optimization guide with examples
- \`BizEvents_Reference.md\` - All available BizEvent types and fields
- \`Spans_Reference.md\` - Span patterns and service baselines
- \`Logs_Reference.md\` - Log patterns and error signatures
- \`Metrics_Reference.md\` - Available metrics (FREE queries)
- \`Entities_Reference.md\` - Cached entity IDs
- \`example/\` directory - Gen 3 Dashboard JSON and JavaScript syntax examples (if available)

---

## Dashboard Best Practices

### Gen 3 Dashboard Requirements
- Use \`"version": 20\` in JSON
- Apply brand colours from company websites
- Include data source indicators (BizEvents, Spans, Logs, Metrics)
- Use appropriate visualizations for data type

### Standard Dashboard Sections
1. **Header** - Brand logo/name, time selector
2. **KPI Summary Row** - Key business metrics (single values)
3. **Trend Charts** - Primary metrics over time
4. **Breakdown Charts** - By dimension/category
5. **Service Performance** - From spans/metrics
6. **Error Analysis** - From logs/exceptions
7. **Health Indicators** - Traffic lights, thresholds
`;

export const BizEvents_Reference = `# BizEvents Reference Guide

> **Generated:** [DATE]  
> **Environment:** [TENANT_ID]  
> **Data Period:** [ANALYSIS_PERIOD]  
> **Total Events Scanned:** [COUNT]  
> **Total Event Types:** [COUNT]

---

## 📊 Volume Overview

### Ingestion Source Breakdown (Optional)
| Source | Events/Day | % of Total | Notes |
|--------|------------|------------|-------|
| OneAgent | | | Backend instrumentation |
| API Ingest | | | Custom event ingestion |
| RUM Agent | | | Browser/mobile events |

### High-Volume Event Types
| Event Type | Count/Day | Primary Use | Filters Required |
|------------|-----------|-------------|------------------|
| *(Add high-volume events as discovered)* | | | |

---

## 🛒 Sample BizEvent: [Example Event Type]

**Event Type:** \`your.event.type\`

### Key Fields Available
| Field | Example Value | Description |
|-------|---------------|-------------|
| \`field1\` | "value" | Description |
| \`field2\` | 123 | Description |
| \`trace_id\` | "abc123..." | Distributed trace correlation |
| \`responseCode\` | 200 | HTTP response code |

**Note:** [Any important field notes or nested data structures]

### Sample Query
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| fields timestamp, field1, field2
| limit 50
\`\`\`

---

## Quick Reference: Event Types by Category

### 📊 Category 1: [CATEGORY_NAME]
| Event Type | Count (Period) | Description |
|------------|----------------|-------------|
| *(Add as discovered)* | | |

**Example Query:**
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| limit 50
\`\`\`

---

### 📊 Category 2: [CATEGORY_NAME]
| Event Type | Count (Period) | Description |
|------------|----------------|-------------|
| *(Add as discovered)* | | |

---

## 🔍 Event Type Discovery Query

Run this to discover all event types:
\`\`\`dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
| limit 50
\`\`\`

---

## 📊 Event Fields Reference

### Common Fields (All Events)
| Field | Type | Description |
|-------|------|-------------|
| \`event.type\` | string | Event type identifier |
| \`timestamp\` | datetime | Event timestamp |
| \`event.provider\` | string | Source system |

### Custom Fields by Event Type

#### [event.type.1]
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| *(Add as discovered)* | | | |

---

## 📈 Efficient Query Patterns

### Event Type Summary (Start Here)
\`\`\`dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
\`\`\`

### Hourly Volume Analysis
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| summarize count = count(), by:{bin(timestamp, 1h)}
| sort timestamp asc
\`\`\`

### Specific Event Analysis
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| fields timestamp, field1, field2, field3
| limit 50
\`\`\`

### Failure Analysis
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| filter result != "success" or responseCode != 200
| summarize count = count(), by:{result}
\`\`\`

### Multi-Dimensional Analysis
\`\`\`dql
fetch bizevents, from:now()-7d
| filter event.type == "your.event.type"
| summarize count = count(), by:{dimension1, dimension2}
| sort count desc
\`\`\`

### Trace Correlation
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| filter trace_id == "YOUR_TRACE_ID"
| fields timestamp, responseCode, field1
\`\`\`

---

## ⚠️ High-Volume Event Types

| Event Type | Volume | Recommendation |
|------------|--------|----------------|
| *(Add high-volume events)* | | ⚠️ Add filters |

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - Event Discovery
- **Source:** BizEvents summary query
- **Finding:** Discovered 25 event types
- **Data:** Top events: event.type.1 (500K), event.type.2 (250K)
-->

---

## 🔄 How to Update This File

When you discover new event types:
1. Add to appropriate category section
2. Include: Event Type, Count, Description
3. Document important fields
4. Add to Update Log with source query
5. Flag high-volume events with warnings
`;

export const CLAUDE = `# Dynatrace Workspace - AI Instructions

> **IMPORTANT:** This file is automatically read by AI assistants at session start.
> **CRITICAL:** Read reference files BEFORE making any MCP queries!

---

## ⚡ SESSION CONSTANTS

| Constant | Value | Source |
|----------|-------|--------|
| \`user.id\` | **(resolve at session start — see below)** | \`.env\` → \`MCP_USER_ID\` |
| \`budget.total_gb\` | \`"1000"\` | Fixed |
| \`query.source\` | \`"MCP"\` | Fixed |

### ⛔ MANDATORY: Resolve \`user.id\` BEFORE First MCP Query

**At the very start of every session, BEFORE any MCP tool call, you MUST:**

1. **Read the \`.env\` file** in the workspace root using \`read_file\`
2. **Extract the value of \`MCP_USER_ID\`** (it is an email address, e.g. \`user@company.com\`)
3. **Store it as \`user.id\`** — use this exact value on ALL tracking events for the entire session

**If \`.env\` does not exist or \`MCP_USER_ID\` is missing/empty:**
1. **ASK the user** for their email address (use the \`ask_questions\` tool)
2. **Use their response as \`user.id\`** for the rest of the session
3. **NEVER fall back to placeholders** like "unknown", "copilot-session", or "test_user"

**Example \`.env\` line:**
\`\`\`
MCP_USER_ID=user@company.com
\`\`\`
→ \`user.id\` = \`"user@company.com"\` on every tracking event.

**⛔ NEVER skip this step. NEVER guess. NEVER use a placeholder. Every tracking event MUST have the real user email.**

---

## ⛔ MANDATORY: SEND TRACKING EVENT AFTER EVERY MCP QUERY

**THIS IS NOT OPTIONAL. After EVERY MCP query (execute_dql, list_problems, find_entity_by_name, etc.), you MUST send a tracking event.**

**IMPORTANT:** \`send_event\` sends CUSTOM_INFO events (queryable via \`fetch events\`), NOT BizEvents. The dashboard queries \`fetch events | filter event.name == "MCP Query Execution"\`.

### How to Send the Tracking Event
After each MCP tool call that returns results, use \`send_event\` with:

\`\`\`
Tool: mcp_dynatrace-mcp_send_event
eventType: CUSTOM_INFO
title: "MCP Query Execution"
properties:
  event.type: "mcp.query.execution"
  query.dql: "<the DQL query or tool name used>"
  query.bytes_scanned: "<GB scanned from response, e.g. 0.84>"
  query.records_scanned: "<records scanned from response>"
  query.records_returned: "<number of records returned>"
  query.source: "MCP"
  query.tool: "<tool name, e.g. execute_dql, list_problems, find_entity_by_name>"
  query.success: "<true or false>"
  query.data_object: "<primary data object: logs, spans, bizevents, metrics, entities, problems>"
  user.id: "<value from .env MCP_USER_ID>"
  budget.total_gb: "1000"
  budget.consumed_gb: "<session total from response>"
  budget.percentage_used: "<percentage from response>"
  query.cost_usd: "<bytes_scanned * 0.05>"
\`\`\`

### Extracting Values from MCP Responses
Every MCP \`execute_dql\` response includes these values — extract and send them:
\`\`\`
📊 DQL Query Results
- Scanned Records: 6,723,074        → query.records_scanned = "6723074"
- Scanned Bytes: 0.84 GB            → query.bytes_scanned = "0.84"
- Session total: 0.84 GB / 1000 GB  → budget.consumed_gb = "0.84"
- 0.1% used                         → budget.percentage_used = "0.1"
\`\`\`

For FREE tools (find_entity_by_name, list_problems, list_vulnerabilities, timeseries):
\`\`\`
query.bytes_scanned: "0"
query.cost_usd: "0"
query.data_object: "entities" (or "problems", "vulnerabilities", "metrics")
\`\`\`

### Why This Is Mandatory
- Tracks ALL MCP query usage across users and sessions
- Enables the MCP Query Usage Dashboard (\`example/MCP_Query_Usage_Dashboard.json\`)
- Provides cost visibility and budget monitoring
- Identifies expensive queries for optimization
- **Without this, there is NO visibility into MCP usage or costs**

### If send_event Fails
- Log the failure but DO NOT stop the current task
- Continue with the user's request
- Note: This should not block workflow — it's fire-and-forget telemetry

---

## ⛔ MANDATORY: UPDATE DOCS AFTER EVERY MCP QUERY

**THIS IS NOT OPTIONAL. After EVERY MCP query that returns new data, you MUST:**
1. Send the tracking event (see above)
2. Update the relevant reference file IMMEDIATELY (before continuing)
3. Do not wait until the end of the task
4. Do not wait for the user to ask

**If you skip this step, all learnings are lost and the next session wastes budget re-discovering the same data.**

### Why Updates Get Missed (And How to Prevent)
| Reason Updates Get Skipped | Prevention |
|---------------------------|------------|
| Focused on answering user question | Set mental checkpoint: "Answer + Update + Event" |
| Multiple queries in quick succession | Batch update after each query group |
| Query returned "expected" data | Still document - confirms patterns |
| Ran out of context/forgot | This instruction file exists to remind you |
| User asked follow-up quickly | Pause briefly to document before responding |

### Minimum Documentation Per Session
At the END of every session, verify you have documented:
- [ ] Any new entity IDs discovered
- [ ] Any new span patterns or volumes
- [ ] Any new error patterns in logs
- [ ] Any performance baselines (latency, error rates)
- [ ] Any new event types or fields
- [ ] ALL MCP queries were tracked via send_event (CUSTOM_INFO events)

---

## 🚀 SESSION STARTUP PROTOCOL

### Step 1: Read These Files FIRST (No Queries Yet!)
\`\`\`
1. DATA_REFERENCE_INDEX.md - Central index, quick lookups
2. Entities_Reference.md - Cached entity IDs
3. [Relevant data type reference for your task]
4. MCP_Query_Optimization_Guide.md - Cost rules
\`\`\`

### Step 2: Check if Data Already Exists
Before ANY MCP query, check reference files for:
- Entity IDs → \`Entities_Reference.md\`
- Event types → \`BizEvents_Reference.md\`
- Span patterns → \`Spans_Reference.md\`
- Error patterns → \`Logs_Reference.md\`
- Metrics → \`Metrics_Reference.md\`

### Step 3: Query Only for NEW Information
Only use MCP tools for data NOT already documented.

### Step 4: SEND TRACKING EVENT After Every Query
**⛔ NON-NEGOTIABLE:** After EVERY MCP tool call, send a tracking event using \`send_event\` (CUSTOM_INFO). See the mandatory protocol at the top of this file.

### Step 5: UPDATE Reference Files IMMEDIATELY After Queries
**⛔ NON-NEGOTIABLE:** After discovering new data, update the relevant reference file BEFORE continuing with other tasks!

---

## 🔄 SELF-UPDATING PROTOCOL (MANDATORY)

**After EVERY MCP query, IMMEDIATELY update:**

| When You Discover | Update This File | Priority |
|-------------------|------------------|----------|
| New entity ID | \`Entities_Reference.md\` | ⛔ NOW |
| New span pattern or field availability | \`Spans_Reference.md\` | ⛔ NOW |
| New event type | \`BizEvents_Reference.md\` | ⛔ NOW |
| New error pattern | \`Logs_Reference.md\` | ⛔ NOW |
| New metric | \`Metrics_Reference.md\` | ⛔ NOW |
| Query cost insight | \`MCP_Query_Optimization_Guide.md\` | ⛔ NOW |

### What MUST Be Documented:
- Entity IDs discovered via \`find_entity_by_name\`
- Span names and which fields are available on each
- Field availability differences (e.g., \`server.address\` only on HTTP endpoint spans)
- Volume/count baselines
- Performance baselines (avg duration, p95, etc.)
- Failure patterns and error codes

### Mandatory Rules
\`\`\`
✅ DO: Send a tracking event after EVERY MCP query (see top of this file)
✅ DO: Read reference files before querying
✅ DO: Use cached entity IDs from Entities_Reference.md
✅ DO: Use timeseries for service metrics (FREE)
✅ DO: Filter BizEvents by event.type FIRST
✅ DO: Start with 24h timeframe, extend only if needed
✅ DO: Use summarize/aggregations, not raw data
✅ DO: Update reference files after discovering new data

❌ DON'T: Skip sending the usage tracking event — it's mandatory
❌ DON'T: Query 7d spans without entity filter (costs 100+ GB)
❌ DON'T: Search logs without loglevel filter
❌ DON'T: Fetch raw data with limit 1000
❌ DON'T: Repeat entity lookups - use cached IDs
❌ DON'T: Query for data already in reference files
\`\`\`

---

## 📦 Cached Entity IDs (Build This List)

### Services
| Service Name | Entity ID | Notes |
|--------------|-----------|-------|
| *(Add as discovered via find_entity_by_name)* | | |

**Rule:** Once an entity ID is documented here, NEVER query for it again! Reuse it!

---

## Quick Reference: Query Cost Rules

### FREE Queries (Use First)
\`\`\`
find_entity_by_name, list_problems, list_vulnerabilities, timeseries metrics
\`\`\`

### LOW Cost (0-5 GB)
\`\`\`dql
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"  // ALWAYS filter event.type first
| filter customField == "value"
| summarize count()
\`\`\`

### HIGH Cost (100+ GB) - AVOID
\`\`\`dql
// DON'T DO THIS - costs 100+ GB
fetch spans, from:now()-7d
| summarize count()
\`\`\`

### CORRECT Pattern
\`\`\`dql
// DO THIS - use metrics (FREE)
timeseries { requests = sum(dt.service.request.count) }, 
from:now()-7d, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
\`\`\`

---

## 📚 Reference Files Index

| File | Purpose |
|------|---------|
| \`DATA_REFERENCE_INDEX.md\` | **START HERE** - Central index |
| \`Entities_Reference.md\` | Cached entity IDs |
| \`BizEvents_Reference.md\` | Event types |
| \`Spans_Reference.md\` | Span/trace patterns |
| \`Logs_Reference.md\` | Log and error patterns |
| \`Metrics_Reference.md\` | Free metric queries |
| \`MCP_Query_Optimization_Guide.md\` | Full cost guide |
| \`mcp_query_tracking_schema.md\` | MCP telemetry event schema |
| \`AI_Prompt.md\` | Task templates |
| \`example/MCP_Query_Usage_Dashboard.json\` | MCP usage tracking dashboard |

---

## 🎯 Common Analysis Patterns

### Pattern 1: Service Performance Analysis
1. Read \`Entities_Reference.md\` for service ID (or find_entity_by_name)
2. Use FREE metrics for request counts, response times, error rates
3. Only dive into spans if metrics show anomaly
4. Document findings in \`Spans_Reference.md\`

### Pattern 2: Error Investigation  
1. Check \`Logs_Reference.md\` for known error patterns
2. Query logs with loglevel filter (10-15 GB for 24h)
3. Identify top error services
4. Document new patterns in \`Logs_Reference.md\`

### Pattern 3: Business Event Analysis
1. Check \`BizEvents_Reference.md\` for known event types
2. Start with event.type summary query
3. Filter by specific event.type + dimensions
4. Document new event types in \`BizEvents_Reference.md\`

### Pattern 4: New Dashboard Creation
1. Read ALL reference files for available data
2. Use cached entity IDs (no lookups needed)
3. Prefer FREE metrics over spans
4. Use BizEvents for business KPIs
5. Follow Gen 3 dashboard format (example/ directory)

---

## Environment
- **Dynatrace Tenant:** [TENANT_ID]
- **Customer:** [CLIENT_NAME]

---

## � Dynatrace Semantic Dictionary
> Reference for all data objects, fields, and relationships:
> **https://docs.dynatrace.com/docs/shortlink/semantic-dictionary**
>
> Use this to look up valid field names, data object types (e.g. \`user.events\`, \`user.sessions\`), and model conventions before writing DQL queries.

## ⚠️ Permission Error Handling
When a DQL query returns \`NOT_AUTHORIZED_FOR_TABLE\` or similar permission errors:
1. **Do NOT retry** — the scope is missing from the token
2. **Log it immediately** in \`scope_increase.md\` with the exact error, failed query, and required scope
3. **Work around it** using alternative data sources if possible
4. **Inform the user** that a scope increase is needed

---

## �💡 Remember

**The goal is to build institutional knowledge that persists across sessions.**
**Every query is an opportunity to learn and document.**
**Future sessions should be faster and cheaper than current ones!**
`;

export const DATA_REFERENCE_INDEX = `# Dynatrace Data Reference Index

> **Purpose:** Central index for all data type references. AI assistants should read this file and relevant references BEFORE making MCP queries.
> **Last Updated:** [DATE]
> **Client:** [CLIENT_NAME]
> **Environment:** [TENANT_ID]

---

## 📚 Reference Files

| File | Data Type | Purpose |
|------|-----------|---------|
| [BizEvents_Reference.md](BizEvents_Reference.md) | BizEvents | Event types, fields, volumes, example queries |
| [Spans_Reference.md](Spans_Reference.md) | Spans/Traces | Service entities, span names, latency patterns |
| [Logs_Reference.md](Logs_Reference.md) | Logs | Log sources, levels, common error patterns |
| [Metrics_Reference.md](Metrics_Reference.md) | Metrics | Available metrics, timeseries patterns |
| [Entities_Reference.md](Entities_Reference.md) | Entities | Cached entity IDs, topology, relationships |
| [MCP_Query_Optimization_Guide.md](MCP_Query_Optimization_Guide.md) | Optimization | Query cost rules, best practices |
| [mcp_query_tracking_schema.md](mcp_query_tracking_schema.md) | Telemetry | MCP query tracking event schema |
| [example/MCP_Query_Usage_Dashboard.json](example/MCP_Query_Usage_Dashboard.json) | Dashboard | MCP usage monitoring dashboard |

### ⚠️ Special Data Scopes

#### user.sessions (Gen3 Session-Level Analytics)
| Scope | Purpose | Key Fields | Cost |
|-------|---------|------------|------|
| \`user.sessions\` | Session duration, bounce rate, engagement, errors, device, ISP, geo | \`duration\`, \`user_interaction_count\`, \`request_count\`, \`navigation_count\`, \`error.count\`, \`error.exception_count\`, \`error.http_4xx_count\`, \`error.http_5xx_count\`, \`end_reason\`, \`device.type\`, \`os.name\`, \`browser.name\`, \`browser.version\`, \`device.screen.width\`, \`device.screen.height\`, \`browser.window.width\`, \`browser.window.height\`, \`client.isp\`, \`geo.country.iso_code\`, \`frontend.name\`, \`dt.rum.application.entities\`, \`characteristics.is_invalid\`, \`characteristics.has_replay\`, \`device.is_rooted\` | ~1-2 GB per 7d |

**Scope required:** \`storage:user.sessions:read\` (Gen3 dot-notation — NOT \`user-sessions\` with hyphen)

**Filter:** \`in(dt.rum.application.entities, "APPLICATION-xxx")\` or \`frontend.name == "App Name"\`

**Much cheaper than user.events for session-level analysis!**

#### user.events (RUM Events)
| Scope | Purpose | Key Fields | Cost |
|-------|---------|------------|------|
| \`user.events\` | JavaScript errors, RUM exceptions, navigation events, user interactions | \`error.id\`, \`error.type\`, \`error.message\`, \`dt.rum.application.id\`, \`dt.rum.application.entity\`, \`os.name\`, \`browser.user_agent\`, \`device.screen.width\`, \`device.screen.height\`, \`page.source.url.full\`, \`navigation.type\`, \`client.isp\`, \`characteristics.classifier\` | 5-30 GB per 7d |

**Note:** \`user.events\` provides event-level detail (clicks, errors, navigations) while \`user.sessions\` provides aggregated session metrics.

#### Standard Data Objects
| Scope | Purpose | Key Fields |
|-------|---------|------------|
| \`bizevents\` | Business events | \`event.type\`, custom fields |
| \`spans\` | Distributed traces | \`span.name\`, \`duration\`, \`dt.entity.service\` |
| \`logs\` | Log messages | \`content\`, \`loglevel\`, \`log.source\` |

---

## 🔄 Self-Updating Protocol

### When to Update Reference Files
AI assistants MUST update relevant reference files when:
1. **New entity discovered** → Add to \`Entities_Reference.md\`
2. **New event type found** → Add to \`BizEvents_Reference.md\`
3. **New span/service discovered** → Add to \`Spans_Reference.md\`
4. **Query cost insight gained** → Add to \`MCP_Query_Optimization_Guide.md\`
5. **New error pattern identified** → Add to \`Logs_Reference.md\`

### Update Format
\`\`\`markdown
## [DATE] Update
- **Source:** [Query or analysis that discovered this]
- **Finding:** [What was learned]
- **Data:** [Specific values, IDs, patterns]
\`\`\`

---

## 🚀 AI Session Startup Protocol

### Step 1: Read Reference Files (NO QUERIES YET)
\`\`\`
1. Read this index file
2. Read Entities_Reference.md (for cached entity IDs)
3. Read relevant data type reference for your task
4. Read MCP_Query_Optimization_Guide.md
\`\`\`

### Step 2: Check if Information Already Exists
Before making ANY MCP query, check:
- Is the entity ID already in \`Entities_Reference.md\`?
- Is the event type documented in \`BizEvents_Reference.md\`?
- Is this query pattern in \`MCP_Query_Optimization_Guide.md\`?

### Step 3: Query Only for New Information
Only make MCP queries for data NOT already in reference files.

### Step 4: Update Reference Files
After gaining new insights, update the relevant reference file.

---

## 📊 Quick Lookups

### Entity IDs (Cached)
| Entity Name | Entity ID | Type | Last Verified |
|-------------|-----------|------|---------------|
| *(Add entities as discovered)* | | | |

### High-Volume Event Types
| Event Type | Volume | Required Filters |
|------------|--------|------------------|
| *(Add high-volume events as discovered)* | | |

### Query Cost Quick Reference
| Data Type | 24h Cost | 7d Cost | Recommendation |
|-----------|----------|---------|----------------|
| Metrics timeseries | 0 GB | 0 GB | ✅ Always prefer |
| BizEvents (filtered) | 0.5 GB | 2 GB | ✅ Good |
| user.events (exceptions) | 1-5 GB | 5-15 GB | ✅ Good for JS errors |
| Logs (loglevel filter) | 10 GB | 50 GB | ⚠️ Use 24h |
| Spans (entity filter) | 16 GB | 125 GB | ⚠️ Use 24h or metrics |
| Spans (unfiltered) | 50 GB | 300+ GB | ❌ Never |

---

## 📊 MCP Query Tracking

### ⛔ MANDATORY: After Every MCP Query
AI assistants MUST send a tracking event after EVERY MCP query using \`send_event\`:
- **eventType:** \`CUSTOM_INFO\`
- **title:** \`MCP Query Execution\`
- **user.id:** Value from \`.env\` MCP_USER_ID

See [mcp_query_tracking_schema.md](mcp_query_tracking_schema.md) for full event schema.

### Dashboard
Import \`example/MCP_Query_Usage_Dashboard.json\` to monitor:
- Total queries and data scanned
- Cost tracking and budget usage
- Top users by consumption
- Most expensive queries

---

## 🔧 Environment Info
- **Dynatrace Tenant:** [TENANT_ID]
- **Customer:** [CLIENT_NAME]
- **Industry:** [INDUSTRY]
- **Key Services/Applications:** [LIST KEY SERVICES]
`;

export const DQL_Queries_Reference = `# DQL Queries Reference

Verified, copy-paste-ready DQL queries for all major Grail data sources.
Every query in this file has been tested against a live Dynatrace environment and returned valid results.

---

## Data Sources

| Source | \`fetch\` keyword | Timestamp field | Cost |
|--------|----------------|-----------------|------|
| Logs | \`logs\` | \`timestamp\` | Medium-High |
| Spans / Traces | \`spans\` | \`start_time\` (NOT \`timestamp\`) | High |
| Business Events | \`bizevents\` | \`timestamp\` | Medium |
| Events (Davis + Fleet) | \`events\` | \`timestamp\` | Low |
| Davis Problems | \`dt.davis.problems\` | \`timestamp\` | Low |
| Metrics (timeseries) | Use \`timeseries\` command | N/A | Free |
| Entities | \`dt.entity.<type>\` | N/A (no time field) | Free |

### CRITICAL: Spans use \`start_time\`, NOT \`timestamp\`

Spans have \`start_time\` and \`end_time\`. The \`timestamp\` field is **null** on spans.
If you use \`bin(timestamp, 15m)\` on spans, every row goes into a null bucket.

**Wrong:**
\`\`\`dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{time = bin(timestamp, 15m)}
\`\`\`

**Correct:**
\`\`\`dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{time = bin(start_time, 15m)}
\`\`\`

Logs and bizevents use \`timestamp\` normally.

---

### CRITICAL: Never output raw entity IDs

Entity IDs like \`SERVICE-B4F9C95D2BCCED72\` or \`HOST-24B49251EA1EE742\` are meaningless to users.
When grouping by or displaying \`dt.entity.service\`, \`dt.entity.host\`, or any entity field, **always** use \`entityName()\` to resolve to the human-readable name.

**Wrong:**
\`\`\`
| summarize cnt = count(), by:{dt.entity.service}
\`\`\`
Outputs: \`SERVICE-B4F9C95D2BCCED72 | 1504\`

**Correct — inline with fieldsAdd:**
\`\`\`
| summarize cnt = count(), by:{dt.entity.service}
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields serviceName, cnt
\`\`\`

**Correct — inline in by:{}:**
\`\`\`
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
\`\`\`
Outputs: \`banking-transaction-service | 1504\`

\`entityName()\` works for any entity type:
- \`entityName(dt.entity.service)\` → service name
- \`entityName(dt.entity.host)\` → host name
- \`entityName(dt.entity.process_group_instance)\` → process group name

---

## Entity Queries (FREE — no data cost)

### List all services
\`\`\`dql
fetch dt.entity.service
| fields id, entity.name, lifetime, tags
| sort entity.name asc
\`\`\`

### List all hosts
\`\`\`dql
fetch dt.entity.host
| fields id, entity.name, lifetime, tags, ipAddress
\`\`\`

### List all process group instances
\`\`\`dql
fetch dt.entity.process_group_instance
| fields id, entity.name, lifetime
| sort entity.name asc
| limit 20
\`\`\`

### Filter entities with in()
Use \`in()\` function with curly braces — NOT \`IN\` keyword, NOT parentheses, NOT square brackets.
\`\`\`dql
fetch dt.entity.service
| filter in(entity.name, {"retail-checkout-service", "retail-payment-service"})
| fields id, entity.name
\`\`\`

### Service call relationships (topology)
\`\`\`dql
fetch dt.entity.service
| fields id, entity.name, calls[dt.entity.service]
\`\`\`

---

## Span / Trace Queries

### Top endpoints by volume
\`\`\`dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), by:{span.name}
| sort cnt desc
| limit 10
\`\`\`

### Error rate by endpoint
\`\`\`dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), errors = countIf(http.response.status_code >= 400), by:{span.name}
| fieldsAdd errorRate = round(toDouble(errors) * 100.0 / toDouble(cnt), decimals:1)
| sort errors desc
| limit 10
\`\`\`

### Response time percentiles by endpoint
Duration is in **nanoseconds**. Divide by 1,000,000 to get milliseconds.
\`\`\`dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(),
    avgDuration = avg(duration),
    p50 = percentile(duration, 50),
    p95 = percentile(duration, 95),
    p99 = percentile(duration, 99),
    by:{span.name}
| sort avgDuration desc
| limit 10
\`\`\`

### Error rate over time (time-bucketed)
\`\`\`dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), errors = countIf(http.response.status_code >= 400),
    by:{time = bin(start_time, 15m)}
| fieldsAdd errorRate = round(toDouble(errors) * 100.0 / toDouble(cnt), decimals:1)
| sort time asc
\`\`\`

### Filter spans by service name
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| fieldsAdd serviceName = entityName(dt.entity.service)
| filter serviceName == "banking-transaction-service"
| summarize cnt = count(), avgDuration = avg(duration), by:{span.name, serviceName}
| sort cnt desc
\`\`\`

### Filter spans containing a keyword
Use \`contains()\` function — NOT the \`contains\` operator.
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server" AND contains(span.name, "bank-payment")
| summarize cnt = count(), avgDuration = avg(duration),
    errors = countIf(http.response.status_code >= 400),
    by:{span.name}
| sort cnt desc
\`\`\`

### Find 5xx errors with matchesValue wildcard
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| fieldsAdd statusStr = toString(http.response.status_code)
| filter matchesValue(statusStr, "5*")
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields start_time, span.name, http.response.status_code, duration, serviceName
| sort start_time desc
| limit 10
\`\`\`

### Service health with conditional labels
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| summarize cnt = count(), errors = countIf(http.response.status_code >= 400),
    by:{serviceName = entityName(dt.entity.service)}
| fieldsAdd errorRate = round(toDouble(errors) * 100.0 / toDouble(cnt), decimals:1)
| fieldsAdd health = if(errorRate >= 50.0, "CRITICAL",
    else:if(errorRate > 0.0, "WARNING",
    else:"HEALTHY"))
| fields serviceName, cnt, errors, errorRate, health
| sort errorRate desc
\`\`\`

### P95 response time excluding health checks
Use \`NOT\` before a function call.
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server" AND NOT contains(span.name, "health")
| summarize cnt = count(), p95Duration = percentile(duration, 95), by:{span.name}
| fieldsAdd p95Ms = round(toDouble(p95Duration) / 1000000.0, decimals:2)
| sort p95Ms desc
| limit 10
\`\`\`

### Throughput per service
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| summarize cnt = count(), avgDuration = avg(duration),
    by:{serviceName = entityName(dt.entity.service)}
| fieldsAdd avgResponseMs = round(toDouble(avgDuration) / 1000000.0, decimals:1)
| fields serviceName, cnt, avgResponseMs
| sort cnt desc
\`\`\`

### Distinct endpoints per service
\`\`\`dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| summarize cnt = count(), endpoints = collectDistinct(span.name),
    by:{serviceName = entityName(dt.entity.service)}
| fields serviceName, cnt, endpoints
| sort cnt desc
\`\`\`

---

## Log Queries

### Log volume by level
\`\`\`dql
fetch logs, from:now()-2h
| summarize cnt = count(), by:{loglevel}
| sort cnt desc
\`\`\`

### Error logs over time
\`\`\`dql
fetch logs, from:now()-2h
| filter loglevel == "ERROR"
| summarize cnt = count(), by:{time = bin(timestamp, 15m)}
| sort time asc
\`\`\`

### Recent error logs with content
\`\`\`dql
fetch logs, from:now()-1h
| filter loglevel == "ERROR"
| fieldsAdd hostName = entityName(dt.entity.host)
| fields timestamp, content, loglevel, log.source, hostName
| sort timestamp desc
| limit 10
\`\`\`

### Search logs with matchesPhrase
For exact phrase matching in log content (more efficient than \`contains\` for long text).
\`\`\`dql
fetch logs, from:now()-2h
| filter matchesPhrase(content, "SettlementDiscrepancyError")
| summarize cnt = count(), by:{log.source}
| sort cnt desc
\`\`\`

### Search logs with contains
\`\`\`dql
fetch logs, from:now()-2h
| filter contains(content, "error") OR contains(content, "Error")
| fields timestamp, content, loglevel, log.source
| sort timestamp desc
| limit 10
\`\`\`

### Log volume by host
\`\`\`dql
fetch logs, from:now()-2h
| summarize cnt = count(), by:{hostName = entityName(dt.entity.host)}
| sort cnt desc
| limit 10
\`\`\`

---

## Business Events Queries

### Event types overview
\`\`\`dql
fetch bizevents, from:now()-24h
| summarize cnt = count(), by:{event.type}
| sort cnt desc
\`\`\`

### Discover bizevent fields (always do this first)
Bizevent schemas vary by \`event.type\`. Always fetch one record to see available fields.
\`\`\`dql
fetch bizevents, from:now()-1h
| filter event.type == "bank-payment.transactions"
| limit 1
\`\`\`

### Transaction summary by customer
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "bank-payment.transactions"
| summarize transactions = count(),
    discrepancies = countIf(settlementStatus == "DISCREPANCY"),
    totalInstructed = sum(instructedAmountGBP),
    totalSettled = sum(settledAmountGBP),
    by:{orderingCustomerName}
| fieldsAdd discrepancyRate = round(toDouble(discrepancies) * 100.0 / toDouble(transactions), decimals:1)
| sort transactions desc
\`\`\`

### Transaction volume and loss over time
\`\`\`dql
fetch bizevents, from:now()-24h
| filter event.type == "bank-payment.transactions"
| summarize transactions = count(),
    avgAmount = avg(instructedAmountGBP),
    totalLoss = sum(differenceGBP),
    by:{time = bin(timestamp, 1h), settlementStatus}
| sort time desc
| limit 20
\`\`\`

### Payment flow events (credit/debit/transfer)
\`\`\`dql
fetch bizevents, from:now()-24h
| filter in(event.type, {"bank-payment.credit", "bank-payment.debit", "bank-payment.transfer-request"})
| summarize cnt = count(), by:{event.type, status}
| sort cnt desc
\`\`\`

---

## Events Queries (Davis + Fleet)

### Event kinds overview
\`\`\`dql
fetch events, from:now()-24h
| summarize cnt = count(), by:{event.kind}
| sort cnt desc
\`\`\`

### Davis events (problems, restarts)
\`\`\`dql
fetch events, from:now()-24h
| filter event.kind == "DAVIS_EVENT"
| fieldsAdd hostName = entityName(dt.entity.host),
    serviceName = entityName(dt.entity.service)
| fields timestamp, event.name, event.type, event.status, hostName, serviceName
| sort timestamp desc
| limit 10
\`\`\`

---

## Davis Problems

### Recent problems
\`\`\`dql
fetch dt.davis.problems, from:now()-7d
| fields display_id, event.name, event.status, event.category,
    event.start, event.end, event.description,
    affected_entity_ids, affected_entity_names,
    root_cause_entity_id, root_cause_entity_name
| sort timestamp desc
| limit 10
\`\`\`

### Open problems only
\`\`\`dql
fetch dt.davis.problems, from:now()-7d
| filter event.status == "ACTIVE"
| fields display_id, event.name, event.category,
    event.start, affected_entity_names, root_cause_entity_name
| sort timestamp desc
\`\`\`

---

## Metric Queries (FREE — no data cost)

### CPU usage over time
\`\`\`dql
timeseries avg_cpu = avg(dt.host.cpu.usage), from:now()-2h, by:{dt.entity.host}
\`\`\`

### Memory usage over time
\`\`\`dql
timeseries mem = avg(dt.host.memory.usage), from:now()-2h, by:{dt.entity.host}
\`\`\`

### Disk usage
\`\`\`dql
timeseries disk = avg(dt.host.disk.usage), from:now()-2h, by:{dt.entity.host}
\`\`\`

### Network traffic
\`\`\`dql
timeseries bytesin = sum(dt.host.network.nic.traffic.in), from:now()-2h, by:{dt.entity.host}
\`\`\`

---

## Syntax Reference — Common Pitfalls

### sort cannot use aggregation functions
**Wrong:** \`| summarize cnt = count() | sort count() desc\`
**Correct:** \`| summarize cnt = count() | sort cnt desc\`

### \`by:{}\` needs curly braces AND a comma before it
**Wrong:** \`summarize count() by fieldName\`
**Wrong:** \`summarize cnt = count() by:{field}\`
**Correct:** \`summarize cnt = count(), by:{field}\`

### bin() must be aliased
**Wrong:** \`by:{bin(timestamp, 1h)}\`
**Correct:** \`by:{time = bin(timestamp, 1h)}\`

### contains() is a function
**Wrong:** \`field contains "value"\`
**Correct:** \`contains(field, "value")\`

### in() uses curly braces for value lists
**Wrong:** \`filter field IN ("a", "b")\`
**Wrong:** \`filter in(field, ["a", "b"])\`
**Correct:** \`filter in(field, {"a", "b"})\`

### round() uses named decimals parameter
**Wrong:** \`round(value, 2)\`
**Correct:** \`round(value, decimals:2)\`

### countIf is camelCase
**Wrong:** \`count_if()\`, \`COUNT_IF()\`
**Correct:** \`countIf(condition)\`

### fieldsAdd not compute
**Wrong:** \`| compute newField = expression\`
**Correct:** \`| fieldsAdd newField = expression\`

### if/else syntax
Use nested \`if()\` with \`else:\` named parameter:
\`\`\`dql
if(condition1, "value1", else:if(condition2, "value2", else:"default"))
\`\`\`

### Duration is in nanoseconds
Span \`duration\` field is in nanoseconds. Divide by 1,000,000 for milliseconds:
\`\`\`dql
fieldsAdd durationMs = round(toDouble(duration) / 1000000.0, decimals:2)
\`\`\`

### entityName() to resolve entity IDs
Use \`entityName()\` to convert entity IDs to human-readable names. Works inline:
\`\`\`dql
| fieldsAdd serviceName = entityName(dt.entity.service)
\`\`\`
Or directly in \`by:{}\`:
\`\`\`dql
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
\`\`\`

### lookup syntax (for advanced joins)
Use \`lookup\` when you need to join additional entity fields beyond the name:
\`\`\`dql
| lookup [fetch dt.entity.service | fields id, entity.name, tags],
    sourceField:dt.entity.service, lookupField:id, prefix:"svc."
\`\`\`
After lookup, access joined fields with the prefix: \`svc.entity.name\`, \`svc.tags\`.

### matchesValue for wildcard patterns
\`\`\`dql
| filter matchesValue(toString(http.response.status_code), "5*")
\`\`\`

### matchesPhrase for exact log phrase search
More efficient than \`contains()\` for searching in log content:
\`\`\`dql
| filter matchesPhrase(content, "exact error phrase")
\`\`\`

### Always discover before filtering
Never guess field values. Run a discovery query first:
\`\`\`dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{span.name} | sort cnt desc | limit 20
\`\`\`
Then filter on actual values from the results.
`;

export const Entities_Reference = `# Entities Reference

> **Purpose:** Cached entity IDs and topology to avoid repeated \`find_entity_by_name\` lookups
> **Last Updated:** [DATE]
> **Update Rule:** Add new entities whenever discovered via MCP queries

---

## 🏢 Service Entities

### Web Services (Frontend Applications)
| Service Name | Entity ID | Description | Type | Last Verified |
|--------------|-----------|-------------|------|---------------|
| *(Add as discovered)* | | | | |

### Backend Services / APIs
| Service | Entity ID | Description | Last Verified |
|---------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

### Azure Functions / Serverless
| Service | Entity ID | Description | Last Verified |
|---------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

**Note:** When discovering services, document error volumes and key characteristics alongside entity IDs.

---

## 🖥️ Host Entities

| Host Name | Entity ID | Description | Last Verified |
|-----------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

---

## 🖥️ Process Entities

| Process Name | Entity ID | Type | Last Verified |
|--------------|-----------|------|---------------|
| *(Add as discovered)* | | | |

---

## 📦 Container Entities

| Container Name | Entity ID | Pod/Host | Last Verified |
|----------------|-----------|----------|---------------|
| *(Add as discovered)* | | | |

---

## 📱 RUM Application Entities

| Application Name | Entity ID | Frontend ID | Description | Last Verified |
|-----------------|-----------|-------------|-------------|---------------|
| *(Add as discovered)* | | | | |

**Note:** RUM applications track real user monitoring data (sessions, page views, errors, performance)

### Key RUM Queries
\`\`\`dql
// Session analysis (requires scope: user.sessions)
fetch user.sessions, from:now()-7d
| filter in(dt.rum.application.entities, "APPLICATION-XXX")
| summarize sessions = count(), avg_duration = avg(duration), errors = sum(error.count)

// JavaScript errors
fetch user.events, from:now()-24h
| filter dt.rum.application.entity == "APPLICATION-XXX" and error.type == "javascript"
| summarize count = count(), sessions = countDistinct(dt.rum.session.id), by:{error.message}
\`\`\`

---

## ☸️ Kubernetes Entities

### Clusters
| Cluster Name | Entity ID | Last Verified |
|--------------|-----------|---------------|
| *(Add as discovered)* | | |

### Namespaces
| Namespace | Entity ID | Cluster | Last Verified |
|-----------|-----------|---------|---------------|
| *(Add as discovered)* | | | |

### Pods
| Pod Name | Entity ID | Namespace | Last Verified |
|----------|-----------|-----------|---------------|
| *(Add as discovered)* | | | |

---

## 🌐 Application Entities (RUM/Frontend)

### Web Applications
| Application Name | Entity ID | Type | Last Verified |
|------------------|-----------|------|---------------|
| *(Add as discovered)* | | | |

### Mobile Applications
| Application Name | Entity ID | Platform | Last Verified |
|------------------|-----------|----------|---------------|
| *(Add as discovered)* | | | |

---

## 🔗 Entity Relationships

### Topology Map
\`\`\`
SERVICE-XXXX (Primary Service)
    └── PROCESS-XXXX (Process)
        └── HOST-XXXX (Host)
            └── CLOUD_APPLICATION-XXXX (K8s Workload)
\`\`\`

*(Update this diagram as you discover topology)*

---

## 🔍 DQL Filters for Entities

### Service Filter
\`\`\`dql
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
\`\`\`

### Host Filter
\`\`\`dql
| filter dt.entity.host == "HOST-XXXXXXXXXXXX"
\`\`\`

### Process Filter
\`\`\`dql
| filter dt.entity.process_group == "PROCESS_GROUP-XXXXXXXXXXXX"
\`\`\`

### Multiple Entity Filter
\`\`\`dql
| filter dt.entity.service in ("SERVICE-ID1", "SERVICE-ID2", "SERVICE-ID3")
\`\`\`

---

## 🔄 Entity Discovery Queries

### Find Service by Name
Use MCP tool: \`find_entity_by_name("service-name")\`

### List All Services in Smartscape
\`\`\`dql
smartscapeNodes "SERVICE"
| fields entity.name, dt.entity.service
| limit 50
\`\`\`

### Find Related Entities
\`\`\`dql
smartscapeNodes "SERVICE"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| expand to:dt.entity.process_group, direction:both
\`\`\`

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entries:

### [DATE] - Service Discovery
- **Source:** find_entity_by_name query
- **Finding:** Discovered 15 backend services
- **Data:** Added SERVICE-IDs for API services

### [DATE] - Host Mapping
- **Source:** Smartscape topology query
- **Finding:** Mapped hosts to Kubernetes pods
- **Data:** Added HOST-IDs for production cluster
-->

---

## 🔄 How to Update This File

When you discover new entities:
1. Use \`find_entity_by_name\` first (FREE query)
2. Add entity to appropriate section with full details
3. Document any error volumes or performance characteristics
4. Add to Update Log with source query
5. Use entity IDs in subsequent queries (avoid repeat lookups)

### Host Filter
\`\`\`dql
| filter dt.entity.host == "HOST-XXXXXXXXXXXX"
\`\`\`

### Application Filter (RUM)
\`\`\`dql
| filter dt.rum.application.entity == "APPLICATION-XXXXXXXXXXXX"
\`\`\`

### Kubernetes Cluster Filter
\`\`\`dql
| filter dt.entity.kubernetes_cluster == "KUBERNETES_CLUSTER-XXXXXXXXXXXX"
\`\`\`

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - [Entity Name]
- **Source:** \`find_entity_by_name("[name]")\`
- **Finding:** Discovered [X] entities for [service/application]
- **Data:** Primary entity is \`SERVICE-XXXX\` ([description])
-->

---

## 🔄 How to Update This File

When you discover a new entity via MCP:
1. Add it to the appropriate section above
2. Include: Entity Name, Entity ID, Type, Last Verified date
3. Add to Update Log with source query
4. Update relationships if topology is clarified

### Example Update Entry
\`\`\`markdown
### [DATE] - My Service
- **Source:** \`find_entity_by_name("My Service")\`
- **Finding:** Discovered 5 entities for My Service
- **Data:** Primary service is \`SERVICE-XXXXXXXXXXXX\` (my-service.example.com:8080)
\`\`\`
`;

export const Logs_Reference = `# Logs Reference

> **Purpose:** Document log patterns and common errors to avoid expensive repeat queries
> **Last Updated:** [DATE]
> **Cost Warning:** Log queries can be expensive (10-85 GB for 24h). Always filter by loglevel first.

---

## ⚠️ Query Cost Warning

| Query Pattern | 24h Cost | 7d Cost | Recommendation |
|--------------|----------|---------|----------------|
| Keyword search (no loglevel filter) | 85 GB | 300+ GB | 🔴 Always add loglevel filter |
| With loglevel filter | 10-15 GB | 50-70 GB | ⚠️ Acceptable for 24h |
| Aggregation only | 5-10 GB | 20-40 GB | ✅ Preferred |
| Entity-filtered logs | 3-8 GB | 15-30 GB | ✅ Best practice |

---

## 📊 Log Level Distribution

| Log Level | Count (24h) | % of Total | Colour Code |
|-----------|-------------|------------|-------------|
| ERROR | | | 🔴 Red |
| WARN | | | 🟠 Orange |
| INFO | | | 🟢 Green |
| DEBUG | | | 🟣 Purple |
| NONE | | | ⚪ Grey |

*(Populate with actual data from your environment)*

**Key Insight:** Focus on ERROR and WARN for issues.

---

## � Top Error Services (Track Over Time)

### [DATE]
| Rank | Service | Entity ID | Error Count (24h) | Error Type |
|------|---------|-----------|------------------|------------|
| 🔴 #1 | [service-name] | \`SERVICE-XXXXXXXXXXXX\` | [count] | [description] |
| 🔴 #2 | [service-name] | \`SERVICE-XXXXXXXXXXXX\` | [count] | [description] |
| 🟠 #3 | [service-name] | \`SERVICE-XXXXXXXXXXXX\` | [count] | [description] |

**Trend Analysis:**
- [Service name] errors: [trend description]
- [Notable pattern or change]

---

## �🚨 Common Error Patterns

### 1. [Error Pattern Name]
**Frequency:** [Common/Occasional/Rare]  
**Log Level:** ERROR  
**Pattern:**
\`\`\`
[Example log message pattern]
\`\`\`
**Cause:** [Root cause description]  
**Impact:** [Low/Medium/High] - [Impact description]

### 2. [Error Pattern Name]
**Frequency:** [Common/Occasional/Rare]  
**Log Level:** ERROR  
**Pattern:**
\`\`\`
[Example log message pattern]
\`\`\`
**Cause:** [Root cause description]  
**Impact:** [Low/Medium/High] - [Impact description]

---

## 🔍 Log Sources

| Source | Description | Volume |
|--------|-------------|--------|
| *(Add as discovered)* | | |

---

## � Frontend/RUM Error Analysis

### CSP (Content Security Policy) Violations
If your application uses RUM and has CSP policies, track violations:

\`\`\`dql
fetch user.events, from:now()-24h
| filter error.type == "csp" or error.reason == "csp"
| summarize count = count(), by:{csp.blocked_uri.domain, csp.effective_directive, csp.disposition}
| sort count desc
\`\`\`

**Key CSP Fields:**
- \`csp.blocked_uri.domain\` - What was blocked
- \`csp.effective_directive\` - Which CSP directive (connect-src, script-src-elem, img-src, etc.)
- \`csp.disposition\` - "report" (logged only) or "enforce" (actually blocked)
- \`csp.document_uri.domain\` - Where the violation occurred
- \`csp.source_file.full\` - Script/resource that triggered the violation

### JavaScript Errors
\`\`\`dql
fetch user.events, from:now()-24h
| filter error.type == "javascript"
| summarize count = count(), sessions = countDistinct(dt.rum.session.id), by:{error.message, error.id}
| sort count desc
| limit 20
\`\`\`

---

## 📊 Efficient Log Queries

### ✅ Aggregation Query (Low Cost)
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR" or loglevel == "WARN"
| summarize count = count(), by:{loglevel}
\`\`\`

### ✅ Error Pattern Detection
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| parse content, "LD 'exception' LD:exceptionType ':' LD:message"
| summarize count = count(), by:{exceptionType}
| sort count desc
| limit 10
\`\`\`

### ✅ Service-Specific Errors (Entity Filter)
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR" and dt.entity.service == "SERVICE-XXXX"
| summarize count = count(), by:{content}
| sort count desc
| limit 20
\`\`\`

### ⚠️ Recent Errors (Use limit)
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| fields timestamp, content
| sort timestamp desc
| limit 10
\`\`\`

### ❌ Avoid: Full-text search without filters
\`\`\`dql
// This is expensive!
fetch logs, from:now()-24h
| filter matchesPhrase(content, "error")
\`\`\`

---

## 🔧 Available Log Fields

| Field | Type | Example |
|-------|------|---------|
| \`timestamp\` | datetime | 2026-01-29T11:07:50.436Z |
| \`content\` | string | Log message text |
| \`loglevel\` | string | ERROR, WARN, INFO, DEBUG, NONE |
| \`log.source\` | string | "Container Output", "journald" |
| \`dt.entity.process_group\` | entity ID | Process group entity |
| \`dt.entity.host\` | entity ID | Host entity |
| \`trace_id\` | string | Distributed trace correlation |
| \`span_id\` | string | Span correlation |

---

## 🎯 Log Query Patterns by Use Case

### Top Error Services (Start Here - Most Important)
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{dt.entity.service}
| sort count desc
| limit 10
\`\`\`

### Error Trends Over Time
\`\`\`dql
fetch logs, from:now()-7d
| filter loglevel == "ERROR"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count(), by:{bin(timestamp, 1h)}
| sort timestamp asc
\`\`\`

### Error Investigation
\`\`\`dql
fetch logs, from:now()-1h
| filter loglevel == "ERROR"
| filter matchesPhrase(content, "keyword")
| fields timestamp, content
| limit 20
\`\`\`

### Service-Specific Logs
\`\`\`dql
fetch logs, from:now()-24h
| filter dt.entity.process_group == "PROCESS_GROUP-XXXX"
| filter loglevel == "ERROR"
| summarize count = count(), by:{bin(timestamp, 1h)}
\`\`\`

### Exception Analysis
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| filter matchesPhrase(content, "Exception")
| parse content, "'Exception:' LD:exceptionMessage"
| summarize count = count(), by:{exceptionMessage}
| sort count desc
\`\`\`

### Warning Analysis
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "WARN"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count()
\`\`\`

### Multi-Service Error Comparison
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{dt.entity.service, loglevel}
| sort count desc
\`\`\`

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - Error Pattern Discovery
- **Source:** Log analysis query
- **Finding:** Identified 5 common error patterns
- **Data:** Top errors: NullPointerException (150), TimeoutException (75)
-->

---

## 🔄 How to Update This File

When you discover log patterns:
1. Document error patterns with examples
2. Record log sources and volumes
3. Update log level distribution
4. Add efficient query patterns
5. Add to Update Log with source query
`;

export const MCP_Query_Optimization_Guide = `# MCP Query Optimization Guide

> **Created:** [DATE]  
> **Environment:** [TENANT_ID]  
> **Purpose:** Reduce Grail budget consumption and token costs when using Dynatrace MCP tools

---

## 📊 Query Cost Reference

| Query Type | Typical Data Scanned | Cost Level |
|------------|---------------------|------------|
| BizEvents (7d, filtered) | 0.5 - 5 GB | 🟢 Low |
| BizEvents (30d, unfiltered) | 10 - 50 GB | 🟡 Medium |
| user.events (24h, exceptions) | 1 - 5 GB | 🟢 Low |
| user.events (7d, exceptions) | 5 - 15 GB | 🟢-🟡 Low-Medium |
| Spans (24h, single service) | 15 - 20 GB | 🟡 Medium |
| Spans (7d, single service) | 100 - 130 GB | 🔴 High |
| Logs (24h, keyword search) | 10 - 85 GB | 🟡-🔴 Medium-High |
| Metrics timeseries | 0 GB | 🟢 Free (pre-aggregated) |
| Entity search (find_entity_by_name) | 0 GB | 🟢 Free |
| Smartscape queries | 0 GB | 🟢 Free |

---

## ✅ Best Practices for Low-Cost Queries

### 1. Always Start with Entity Lookup (FREE)
\`\`\`
Use: mcp_dynatrace-mcp_find_entity_by_name
Before querying spans/logs, find the entity ID first.
This costs 0 GB and gives you the correct filter.
\`\`\`

**Example:** Instead of filtering by name in spans, get the entity ID first:
- ✅ \`find_entity_by_name("My Service")\` → Returns \`SERVICE-XXXXXXXXXXXX\`
- ✅ Then filter: \`dt.entity.service == "SERVICE-XXXXXXXXXXXX"\`

### 2. Use Metrics Over Spans When Possible (FREE vs HIGH COST)
\`\`\`dql
// ✅ LOW COST - Uses pre-aggregated metrics (0 GB)
timeseries {
  requests = sum(dt.service.request.count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}

// ❌ HIGH COST - Scans raw span data (100+ GB for 7d)
fetch spans, from:now()-7d
| filter dt.entity.service == "SERVICE-ID"
| summarize count()
\`\`\`

### 3. Reduce Timeframes for Exploratory Queries
\`\`\`dql
// ✅ Start with 24h for exploration (15-20 GB)
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-ID"
| summarize count(), by:{span.name}

// ❌ Don't start with 7d (100+ GB)
fetch spans, from:now()-7d  // Only use after validating query
\`\`\`

### 4. Filter BizEvents by event.type First
\`\`\`dql
// ✅ EFFICIENT - Filter early (0.5 GB)
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| filter customField == "value"
| summarize count()

// ❌ INEFFICIENT - No event.type filter scans everything
fetch bizevents, from:now()-7d
| filter customField == "value"
| summarize count()
\`\`\`

### 5. Use Aggregations, Not Raw Data
\`\`\`dql
// ✅ Returns summary (small response, few tokens)
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{loglevel}

// ❌ Returns raw logs (large response, many tokens)
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| limit 1000
\`\`\`

---

## 🎯 Query Patterns for Common Use Cases

### Entity Discovery (FREE)
\`\`\`dql
// Find service by name
Use: find_entity_by_name("service-name")

// Explore topology
smartscapeNodes "SERVICE"
| filter matchesPhrase(displayName, "service-name")
\`\`\`

### Service Health (FREE)
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}
\`\`\`

### BizEvents Summary (LOW COST)
\`\`\`dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
| limit 20
\`\`\`

### Error Analysis (MEDIUM COST)
\`\`\`dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{loglevel}
\`\`\`

---

## 📉 Token Cost Reduction Strategies

### 1. Use \`recordLimit\` Parameter
\`\`\`javascript
// Set lower limits for exploration
mcp_dynatrace-mcp_execute_dql({
  dqlStatement: "fetch bizevents...",
  recordLimit: 10  // Default is 100, reduce for exploration
})
\`\`\`

### 2. Select Only Needed Fields
\`\`\`dql
// ✅ Returns only needed fields
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| fields timestamp, amount, result
| limit 20

// ❌ Returns all fields (many columns per record)
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| limit 20
\`\`\`

### 3. Use Semantic Dictionary for Field Discovery
\`\`\`dql
// Find available fields before querying (0 cost)
fetch dt.semantic_dictionary.models
| filter data_object == "logs"
\`\`\`

### 4. Batch Related Questions
Instead of making 5 separate queries, combine into one:
\`\`\`dql
// ✅ Single query with multiple aggregations
fetch bizevents, from:now()-7d
| summarize 
    eventType1 = countIf(event.type == "type1"),
    eventType2 = countIf(event.type == "type2"),
    eventType3 = countIf(event.type == "type3")
\`\`\`

---

## 🔄 Query Workflow for New Analysis

### Step 1: Read Reference Files FIRST (NO QUERIES!)
\`\`\`
1. Check Entities_Reference.md for cached entity IDs
2. Check BizEvents_Reference.md for known event types
3. Check Spans_Reference.md for span patterns
4. Check Logs_Reference.md for error patterns
\`\`\`

### Step 2: Entity Discovery (0 cost - if needed)
\`\`\`
1. Use find_entity_by_name to get entity IDs
2. Use smartscapeNodes to understand topology
3. ⚠️ UPDATE Entities_Reference.md with new IDs!
\`\`\`

### Step 3: Metric Overview (0 cost)
\`\`\`
1. Query available metrics with metric.series
2. Use timeseries for trend data
3. ⚠️ UPDATE Metrics_Reference.md with baselines!
\`\`\`

### Step 4: BizEvents Summary (low cost)
\`\`\`
1. Start with event.type summary
2. Add filters incrementally
3. Use 24h timeframe initially
4. ⚠️ UPDATE BizEvents_Reference.md with new types!
\`\`\`

### Step 5: Spans/Logs Deep Dive (do last, high cost)
\`\`\`
1. Only if metrics don't answer the question
2. Always filter by entity ID
3. Use shortest timeframe needed
4. Aggregate, don't fetch raw data
5. ⚠️ UPDATE Spans_Reference.md or Logs_Reference.md!
\`\`\`

---

## 🏢 Known Entity IDs (Cache Here)

| Entity Name | Entity ID | Description |
|-------------|-----------|-------------|
| *(Add as discovered)* | | |

---

## ⚠️ High-Volume Event Types (Use Carefully)

| Event Type | Typical Volume | Recommendation |
|------------|---------------|----------------|
| *(Add as discovered)* | | |

---

## 📝 Session Cost Log

Track query costs to learn patterns:

### [DATE]
| Query | Data Scanned | Notes |
|-------|-------------|-------|
| *(Log queries and costs here)* | | |

---

## ❌ Common Costly Mistakes (Learn from Experience)

### ❌ Mistake #1: Querying 7d Spans Without Filter
\`\`\`dql
// ❌ COST: 300+ GB
fetch spans, from:now()-7d
| summarize count()
\`\`\`

**Solution:** Always filter by entity and use metrics instead:
\`\`\`dql
// ✅ COST: 0 GB
timeseries { requests = sum(dt.service.request.count) },
from:now()-7d, interval:1d
\`\`\`

### ❌ Mistake #2: Repeating Entity Lookups
\`\`\`dql
// ❌ Multiple queries for same entity (inefficient)
find_entity_by_name("My Service")  // Query 1
find_entity_by_name("My Service")  // Query 2
\`\`\`

**Solution:** Cache entity IDs in Entities_Reference.md and reuse them!

### ❌ Mistake #3: Not Filtering BizEvents by event.type
\`\`\`dql
// ❌ Scans ALL events
fetch bizevents, from:now()-7d
| filter customField == "value"
\`\`\`

**Solution:** Filter by event.type FIRST:
\`\`\`dql
// ✅ Scans only specific event type
fetch bizevents, from:now()-7d
| filter event.type == "specific.event.type"
| filter customField == "value"
\`\`\`

### ❌ Mistake #4: Fetching Raw Logs Without loglevel Filter
\`\`\`dql
// ❌ COST: 85 GB
fetch logs, from:now()-24h
| filter contains(content, "error")
\`\`\`

**Solution:** Always filter by loglevel first:
\`\`\`dql
// ✅ COST: 10 GB
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| filter contains(content, "keyword")
\`\`\`

### ❌ Mistake #5: Using Spans When Metrics Exist
\`\`\`dql
// ❌ COST: 125 GB
fetch spans, from:now()-7d
| filter dt.entity.service == "SERVICE-ID"
| summarize count()
\`\`\`

**Solution:** Use free metrics:
\`\`\`dql
// ✅ COST: 0 GB
timeseries { requests = sum(dt.service.request.count) },
from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}
\`\`\`

---

## 🎓 Learning from Sessions

As you use this workspace, document patterns:
1. What queries cost most?
2. What alternative approaches work better?
3. What entity IDs get reused frequently?
4. What event types have highest volume?

Update the reference files after EVERY session to build institutional knowledge!
`;

export const Metrics_Reference = `# Metrics Reference

> **Purpose:** Document available metrics for FREE queries instead of expensive span/log queries
> **Last Updated:** [DATE]
> **Cost:** Metrics queries are FREE (pre-aggregated data)

---

## ✅ Why Use Metrics?

| Data Source | 7d Query Cost | Use For |
|-------------|--------------|---------|
| Metrics (timeseries) | **0 GB** | Counts, trends, SLOs |
| Spans | 100-125 GB | Deep trace analysis only |
| Logs | 50-85 GB | Error investigation only |

**ALWAYS try metrics first before spans or logs!**

---

## 📊 Service Metrics

### Built-in Service Metrics
| Metric Key | Description | Aggregation |
|------------|-------------|-------------|
| \`dt.service.request.count\` | Total HTTP requests | sum |
| \`dt.service.request.failure_count\` | Failed requests | sum |
| \`dt.service.request.response_time\` | Response time | avg, percentile |

### Custom Metrics
| Metric Key | Description | Source |
|------------|-------------|--------|
| *(Add as discovered)* | | |

---

## 📈 Metric Query Patterns

### Request Count Timeseries
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
\`\`\`

### Request Count with Failures
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, from:now()-7d, interval:6h, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
\`\`\`

### Error Rate Calculation
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
| fieldsAdd errorRate = failures[] / requests[] * 100
\`\`\`

### Multiple Services Comparison
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service in ["SERVICE-XXX", "SERVICE-YYY"]}
\`\`\`

---

## 📊 Host Metrics

| Metric Key | Description | Aggregation |
|------------|-------------|-------------|
| \`dt.host.cpu.usage\` | CPU usage percentage | avg |
| \`dt.host.memory.usage\` | Memory usage percentage | avg |
| \`dt.host.disk.used\` | Disk space used | max |
| \`dt.host.network.bytes.received\` | Network bytes in | sum |
| \`dt.host.network.bytes.sent\` | Network bytes out | sum |

### Host CPU Query
\`\`\`dql
timeseries {
  cpu = avg(dt.host.cpu.usage)
}, from:now()-7d, interval:1h, filter:{dt.entity.host == "HOST-XXXXXXXXXXXX"}
\`\`\`

---

## 🔍 Metric Discovery Queries

### Find Available Metrics for an Entity
\`\`\`dql
fetch metric.series, from:now()-7d
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count(), by:{metric.key}
| sort count desc
| limit 30
\`\`\`

### List All Service Metrics
\`\`\`dql
fetch metric.series, from:now()-24h
| filter startsWith(metric.key, "dt.service.")
| summarize count = count(), by:{metric.key}
| sort count desc
\`\`\`

### List All Host Metrics
\`\`\`dql
fetch metric.series, from:now()-24h
| filter startsWith(metric.key, "dt.host.")
| summarize count = count(), by:{metric.key}
| sort count desc
\`\`\`

---

## 🏢 Metric Dimensions

Metrics can be split by dimensions:

| Dimension | Description | Example |
|-----------|-------------|---------|
| \`dt.entity.service\` | Service entity | SERVICE-XXXX |
| \`dt.entity.host\` | Host entity | HOST-XXXX |
| \`request.name\` | Request/endpoint name | /api/endpoint |
| \`http.status_code\` | HTTP response code | 200, 404, 500 |

### Query with Dimension Split
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count)
}, from:now()-24h, interval:1h, 
filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"},
by:{http.status_code}
\`\`\`

---

## 📊 Dashboard Metric Tiles

### Request Count Tile
\`\`\`json
{
  "title": "🌐 Total Requests (7d)",
  "type": "data",
  "query": "timeseries {\\n  requests = sum(dt.service.request.count)\\n}, from:now()-7d, filter:{dt.entity.service == \\"SERVICE-XXXXXXXXXXXX\\"}\\n| fieldsAdd total = arraySum(requests[])",
  "visualization": "singleValue"
}
\`\`\`

### Request Trend Chart
\`\`\`json
{
  "title": "📈 Request Trend",
  "type": "data",
  "query": "timeseries {\\n  requests = sum(dt.service.request.count)\\n}, from:now()-7d, interval:6h, filter:{dt.entity.service == \\"SERVICE-XXXXXXXXXXXX\\"}",
  "visualization": "areaChart"
}
\`\`\`

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - Metric Discovery
- **Source:** metric.series query for SERVICE-XXXX
- **Finding:** 15 metrics available for service
- **Data:** dt.service.request.count, dt.service.request.failure_count, etc.
-->

---

## 🔄 How to Update This File

When you discover metrics:
1. Add to appropriate section (service, host, custom)
2. Document metric key, description, and recommended aggregation
3. Add sample baselines if useful
4. Add to Update Log with source query
`;

export const Spans_Reference = `# Spans Reference

> **Purpose:** Document span/trace data patterns to avoid expensive repeat queries
> **Last Updated:** [DATE]
> **Cost Warning:** Span queries are EXPENSIVE (16-125 GB). Use metrics timeseries instead when possible.

---

## ⚠️ Query Cost Warning

| Timeframe | Typical Cost | Recommendation |
|-----------|-------------|----------------|
| 24h + entity filter | 16 GB | ⚠️ OK for targeted analysis |
| 7d + entity filter | 125 GB | 🔴 Use metrics instead |
| 7d no filter | 300+ GB | ❌ NEVER DO THIS |

**ALWAYS prefer \`timeseries\` metrics over \`fetch spans\`!**

---

## 🌐 Service Spans

### Service: [SERVICE_NAME]
**Entity ID:** \`SERVICE-XXXXXXXXXXXX\`  
**Purpose:** [Service description]

### Span Names & Volumes
| span.name | Count (24h) | Errors | Avg Duration | P95 Duration | Notes |
|-----------|-------------|--------|--------------|--------------|-------|
| *(Add as discovered)* | | | | | |

### Performance Baselines
| Metric | Value | Threshold |
|--------|-------|-----------|
| Total Requests (24h) | | |
| Avg Response Time | | < X ms (green) |
| P95 Response Time | | < X ms (amber) |
| Error Rate | | < X% (green) |

### Important Notes
- [Any false positive patterns]
- [Key span characteristics]
- [HTTP endpoint patterns if applicable]

---

## 📊 Efficient Span Queries

### ✅ Use This (Metrics - FREE)
\`\`\`dql
timeseries {
  requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
\`\`\`

### ⚠️ Use Sparingly (24h only)
\`\`\`dql
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize 
    requests = count(),
    avgLatencyMs = avg(duration) / 1000000,
    p95LatencyMs = percentile(duration, 95) / 1000000,
    by:{span.name}
\`\`\`

### ❌ Never Do This
\`\`\`dql
// This costs 125+ GB!
fetch spans, from:now()-7d
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count()
\`\`\`

---

## 🔧 Available Span Fields

### Common Fields
| Field | Type | Example |
|-------|------|---------|
| \`span.name\` | string | "GET", "POST", "MethodName" |
| \`duration\` | long (ns) | 117000000 (117ms) |
| \`dt.entity.service\` | entity ID | "SERVICE-XXXXXXXXXXXX" |
| \`span.kind\` | string | "SERVER", "INTERNAL", "CLIENT" |
| \`otel.status_code\` | string | "OK", "ERROR" |
| \`http.method\` | string | "GET", "POST" |
| \`http.status_code\` | int | 200, 404, 500 |
| \`http.url\` | string | "/api/endpoint" |

### Filtering Patterns
\`\`\`dql
// By HTTP method
| filter span.name == "GET" or span.name == "POST"

// By status
| filter otel.status_code == "ERROR"

// By latency (slow requests > 1s)
| filter duration > 1000000000

// By HTTP status code
| filter http.status_code >= 500
\`\`\`

---

## ⚠️ CRITICAL: HTTP vs Internal Spans

**There are often TWO span types for each request - use the correct one!**

| Span Type | span.name Example | Available Fields |
|-----------|-------------------|------------------|
| **HTTP Endpoint** | \`POST /api/resource\` | \`server.address\`, \`http.request.header.*\`, \`url.path\` |
| **Internal Method** | \`ControllerName/method\` | Basic fields only (duration, request.is_failed) |

**Rule:** If you need HTTP headers, user agent, or request attributes, you MUST use the HTTP endpoint span name!

---

## 📊 Span Discovery Queries

### Find All Services (Start Here)
\`\`\`dql
fetch spans, from:now()-1h
| summarize count = count(), by:{dt.entity.service}
| sort count desc
| limit 20
\`\`\`

### Find Span Names for a Service
\`\`\`dql
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count(), by:{span.name}
| sort count desc
| limit 20
\`\`\`

### Analyze Span Performance
\`\`\`dql
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| filter span.name == "your-span-name"
| summarize 
    count = count(),
    avgDuration = avg(duration)/1000000,  // Convert ns to ms
    p95Duration = percentile(duration, 95)/1000000,
    errorCount = countIf(otel.status_code == "ERROR")
\`\`\`

### Find Slow Spans
\`\`\`dql
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| filter duration > 1000000000  // > 1 second
| fields timestamp, span.name, duration
| sort duration desc
| limit 50
\`\`\`

### Find Available Fields for a Span
\`\`\`dql
fetch spans, from:now()-1h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| filter span.name == "your-span-name"
| limit 1
// Then examine the returned fields
\`\`\`

### Error Rate by Span
\`\`\`dql
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize 
    total = count(),
    errors = countIf(otel.status_code == "ERROR"),
    errorRate = errors * 100.0 / total,
    by:{span.name}
| sort errors desc
\`\`\`

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - Service Discovery
- **Source:** Span query for SERVICE-XXXX
- **Finding:** Discovered 15 span names
- **Data:** Top spans: GET (500K), POST (100K), internal.method (50K)
-->

---

## 🔄 How to Update This File

When you discover span patterns:
1. Add service to appropriate section
2. Document span names with volumes and latencies
3. Note which fields are available on which span types
4. Record performance baselines
5. Add to Update Log with source query
`;

export const discovered_findings = `# Discovered Findings

This document is automatically updated with findings from AI analysis.
Each entry records a discovery made during query enrichment or recommendation generation.
`;

export const dql_lessons = `# DQL Lessons Learned

This document is automatically updated when the app discovers DQL syntax issues.
Claude and Davis use this to avoid repeating the same mistakes.

---

### contains() is a function, not an operator
**Wrong:** \`service.name contains "payment"\`
**Correct:** \`contains(service.name, "payment")\`

---

### bin() must be aliased in by:{}
**Wrong:** \`summarize count(), by:{bin(timestamp, 1h)}\`
**Correct:** \`summarize count(), by:{time = bin(timestamp, 1h)}\`
**Why:** Without an alias, the field has no name and \`sort timestamp\` breaks.
After aliasing, use \`sort time\` not \`sort timestamp\`.

---

### Multiplication needs explicit * operator
**Wrong:** \`(toDouble(countIf(x)) / toDouble(count())) 100\`
**Correct:** \`(toDouble(countIf(x)) / toDouble(count())) * 100\`

---

### Group-by uses curly braces AND comma separator
**Wrong:** \`summarize count() by fieldName\`
**Wrong:** \`summarize count(), avgErrors = avg(error.count) by:{field}\`
**Correct:** \`summarize count(), by:{fieldName}\`
**Correct:** \`summarize sessions = count(), avgErrors = avg(error.count), by:{field}\`
**Why:** There MUST be a comma before \`by:\` — it is a separate parameter, not a continuation.

---

### countIf is camelCase, not count_if
**Wrong:** \`countIf\` alternatives: \`count_if()\`, \`COUNT_IF()\`
**Correct:** \`countIf(condition)\` — e.g. \`countIf(error.count > 0)\`

---

### fieldsAdd not compute
**Wrong:** \`| compute newField = expression\`
**Correct:** \`| fieldsAdd newField = expression\`

---

### sort must use alias, not aggregation function
**Wrong:** \`| summarize cnt = count() | sort count() desc\`
**Correct:** \`| summarize cnt = count() | sort cnt desc\`
**Why:** After summarize, the field is named by its alias. \`count()\` doesn't exist as a field name.

---

### round() uses named parameter
**Wrong:** \`round(value, 2)\`
**Correct:** \`round(value, decimals:2)\`

---

### Never output raw entity IDs — always resolve to names
**Wrong:** \`| summarize cnt = count(), by:{dt.entity.service}\` → outputs \`SERVICE-B4F9C95D2BCCED72\`
**Correct:** Use \`entityName()\` to resolve IDs inline:
\`\`\`
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
\`\`\`
Or with \`fieldsAdd\`:
\`\`\`
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields serviceName, cnt
\`\`\`
**Why:** Entity IDs like \`SERVICE-XXXX\` or \`HOST-XXXX\` are meaningless to users. \`entityName()\` works for any entity type: \`entityName(dt.entity.host)\`, \`entityName(dt.entity.process_group_instance)\`, etc.

---

### Never guess filter values — discover first
**Wrong:** \`fetch spans | filter contains(span.name, "settlement")\` — guessing that a business concept appears as a span name
**Correct workflow:**
1. Discover what exists: \`fetch spans, from:now()-7d | summarize cnt=count(), by:{span.name} | sort cnt desc | limit 20\`
2. Use an actual value from results: \`fetch spans | filter span.name == "POST /api/payments"\`
**Why:** Bizevents use domain terms (e.g. "settlement"), but spans use HTTP/service names (e.g. "POST /api/v1/process"). Never assume a business term from one data source appears as a field value in another. Always run a discovery query first to find real values, then filter on those.
`;

export const mcp_query_tracking_schema = `# MCP Query Tracking - Event Schema

## Overview
To track MCP query usage and costs in Dynatrace, \`send_event\` (CUSTOM_INFO) is called after each MCP query execution. These events land in \`fetch events\` (**not** \`fetch bizevents\`).

## Event Schema

### Event Identification
- **event.type:** \`CUSTOM_INFO\` (set by \`send_event\` eventType)
- **event.name:** \`MCP Query Execution\` (set by \`send_event\` title)
- **event.kind:** \`DAVIS_EVENT\` (auto-set by Events API v2)
- **event.provider:** \`EVENTS_REST_API_INGEST\` (auto-set)

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`event.type\` | string | Event type identifier | \`"mcp.query.execution"\` |
| \`query.dql\` | string | DQL query executed (truncate if >1000 chars) | \`"fetch logs, from: now()-24h..."\` |
| \`query.bytes_scanned\` | string | Data scanned in GB | \`"0.84"\` |
| \`query.records_scanned\` | string | Number of records processed | \`"6723074"\` |
| \`query.records_returned\` | string | Number of records returned | \`"100"\` |
| \`user.id\` | string | User executing the query (from MCP_USER_ID env) | \`"user@company.com"\` |
| \`budget.total_gb\` | string | Total budget in GB | \`"1000"\` |
| \`budget.consumed_gb\` | string | Budget consumed so far in session | \`"0.84"\` |
| \`budget.percentage_used\` | string | Percentage of budget used | \`"0.1"\` |
| \`query.source\` | string | Source of query | \`"MCP"\` |
| \`query.tool\` | string | Specific MCP tool used | \`"execute_dql"\` |
| \`query.cost_usd\` | string | Estimated cost in USD (bytes_scanned * 0.05) | \`"0.042"\` |
| \`query.success\` | string | Whether query succeeded | \`"true"\` |
| \`query.data_object\` | string | Primary data object queried | \`"logs"\` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`query.id\` | string | Dynatrace query ID | \`"2d2b3abc-6eec-4cc8-8f6e-cf8f284336b2"\` |
| \`query.timeframe_start\` | string | Query timeframe start | \`"now()-24h"\` |
| \`query.timeframe_end\` | string | Query timeframe end | \`"now()"\` |
| \`query.error\` | string | Error message if query failed | \`"UNKNOWN_DATA_OBJECT"\` |
| \`entity.filter\` | string | Entity filter used | \`"dt.entity.service == \\"SERVICE-123\\""\` |

## Example Event Properties

When calling \`send_event\`, all tracking data goes into the \`properties\` object:

\`\`\`json
{
  "eventType": "CUSTOM_INFO",
  "title": "MCP Query Execution",
  "properties": {
    "event.type": "mcp.query.execution",
    "query.dql": "fetch logs | filter loglevel == \\"ERROR\\" | limit 100",
    "query.bytes_scanned": "0.84",
    "query.records_scanned": "6723074",
    "query.records_returned": "100",
    "user.id": "user@company.com",
    "budget.total_gb": "1000",
    "budget.consumed_gb": "0.84",
    "budget.percentage_used": "0.1",
    "query.source": "MCP",
    "query.tool": "execute_dql",
    "query.cost_usd": "0.042",
    "query.success": "true",
    "query.data_object": "logs"
  }
}
\`\`\`

## Implementation Notes

### Via Copilot / MCP Tool
The \`send_event\` MCP tool is used directly after each query:
1. AI executes an MCP tool (execute_dql, list_problems, etc.)
2. Extracts usage metrics from the response
3. Calls \`send_event\` with eventType \`CUSTOM_INFO\`, title \`MCP Query Execution\`, and all tracking properties
4. Events land in \`fetch events\` (NOT \`fetch bizevents\`)

### Cost Calculation
Assuming $0.05 per GB scanned (adjust based on actual Dynatrace pricing):
\`\`\`
cost_usd = bytes_scanned_gb * 0.05
\`\`\`

### FREE Tools (No Data Scanned)
For these tools, set \`query.bytes_scanned: "0"\` and \`query.cost_usd: "0"\`:
- \`find_entity_by_name\`
- \`list_problems\`
- \`list_vulnerabilities\`
- \`timeseries\` queries

### Important: Events vs BizEvents
| Aspect | send_event (what we use) | BizEvents API |
|--------|--------------------------|---------------|
| **API** | Events API v2 | BizEvents Ingest API |
| **Query with** | \`fetch events\` | \`fetch bizevents\` |
| **event.type** | \`CUSTOM_INFO\` | Custom (e.g. \`mcp.query.execution\`) |
| **Identifier** | \`event.name == "MCP Query Execution"\` | \`event.type == "mcp.query.execution"\` |
| **Auth** | Platform Token (dt0s16) | Classic API Token (dt0c01) |

## Dashboard Queries

Events are queried via \`fetch events\` (NOT \`fetch bizevents\`):

### Total Queries
\`\`\`dql
fetch events
| filter event.type == "CUSTOM_INFO" and event.name == "MCP Query Execution"
| summarize queries = count()
\`\`\`

### Total Data Scanned Over Time
\`\`\`dql
fetch events
| filter event.type == "CUSTOM_INFO" and event.name == "MCP Query Execution"
| makeTimeseries data_scanned_gb = sum(toDouble(query.bytes_scanned)), bins:50
\`\`\`

### Top Users by Consumption
\`\`\`dql
fetch events
| filter event.type == "CUSTOM_INFO" and event.name == "MCP Query Execution"
| summarize total_gb = sum(toDouble(query.bytes_scanned)), queries = count(), by: {user.id}
| sort total_gb desc
\`\`\`

### Most Expensive Queries
\`\`\`dql
fetch events
| filter event.type == "CUSTOM_INFO" and event.name == "MCP Query Execution"
| sort toDouble(query.bytes_scanned) desc
| limit 10
| fields timestamp, user.id, query.dql, query.bytes_scanned, query.cost_usd
\`\`\`

### Budget Tracking
\`\`\`dql
fetch events
| filter event.type == "CUSTOM_INFO" and event.name == "MCP Query Execution"
| sort timestamp desc
| limit 1
| fields budget.consumed_gb, budget.percentage_used
\`\`\`

## See Also
- \`example/MCP_Query_Usage_Dashboard.json\` - Pre-built dashboard for MCP usage monitoring
- \`CLAUDE.md\` - AI instructions including mandatory tracking protocol
`;

export const scope_increase = `# Dynatrace Token Scope Increase Requests

> **Purpose:** Track permission/scope gaps encountered during MCP queries so they can be fixed by an admin.
> **Environment:** [TENANT_ID]
> **Last Updated:** [DATE]

---

## How to Fix
1. Go to **Dynatrace > Settings > Access Tokens**
2. Find the Platform Token used by MCP (\`DT_PLATFORM_TOKEN\` in \`.env\`)
3. Add the missing scopes listed below
4. Save and regenerate if needed

---

## ❌ Missing Permissions

_No open issues yet._

---

## ✅ Resolved Permissions

_Document resolved issues here as they are fixed._

---

## ✅ Working Permissions

| Table / API | Status | Notes |
|-------------|--------|-------|
| \`bizevents\` | ✅ Works | Business events |
| \`logs\` | ✅ Works | Log ingestion and querying |
| \`spans\` | ✅ Works | Distributed traces |
| \`events\` | ✅ Works | Custom events (CUSTOM_INFO, etc.) |
| \`metrics\` (timeseries) | ✅ Works | Metric queries (FREE) |
| \`dt.entity.service\` | ✅ Works | Service entities |
| \`dt.entity.host\` | ✅ Works | Host entities |
| \`user.events\` | ⚠️ Test if needed | User actions, interactions, errors, JS exceptions (scope: \`storage:user.events:read\`) |
| \`user.sessions\` | ⚠️ Test if needed | User sessions Gen 3 (scope: \`storage:user.sessions:read\` — note: dot-notation, NOT hyphen!) |

---

## 📝 Template for New Issues

When a new permission error is encountered, add an entry using this template:

\`\`\`markdown
### N. \`<table_name>\` — <Short Description>
- **Date Discovered:** <date>
- **Error:** \`<exact error message>\`
- **DQL That Failed:**
  \`\`\`dql
  <the query>
  \`\`\`
- **Impact:** <what analysis is blocked>
- **Required Scope:** \`<scope name>\`
- **Status:** 🔴 OPEN
\`\`\`

Once resolved, move the entry from "Missing Permissions" to "Resolved Permissions" and update the status to ✅ RESOLVED.

---

## 🔍 Common Scope Issues

### Gen3 vs Gen2 Scope Names
**IMPORTANT:** Gen3 Grail uses **dot-notation**, NOT hyphens:
- ✅ Correct: \`storage:user.sessions:read\`
- ❌ Wrong: \`storage:user-sessions:read\`

### Scope Discovery
If you encounter a permission error:
1. **Copy the exact error message** (usually includes table name)
2. **Check Dynatrace Semantic Dictionary** for the data object: https://docs.dynatrace.com/docs/shortlink/semantic-dictionary
3. **Infer the scope pattern**: \`storage:<table_name>:read\`
4. **Add the scope** to your Platform Token
5. **Document it here** for future reference

### Common Table-to-Scope Mappings
| Table | Required Scope |
|-------|----------------|
| \`bizevents\` | \`storage:bizevents:read\` |
| \`logs\` | \`storage:logs:read\` |
| \`spans\` | \`storage:spans:read\` |
| \`events\` | \`storage:events:read\` |
| \`metrics\` | \`storage:metrics:read\` |
| \`entities\` | \`storage:entities:read\` |
| \`user.events\` | \`storage:user.events:read\` |
| \`user.sessions\` | \`storage:user.sessions:read\` |
| \`dt.security.vulnerabilities\` | \`storage:security.vulnerabilities:read\` |
| \`dt.davis.problems\` | \`storage:problems:read\` |
`;

/** All default KB documents keyed by filename */
export const DEFAULT_KB_DOCS: Record<string, string> = {
  'AI_Prompt.md': AI_Prompt,
  'BizEvents_Reference.md': BizEvents_Reference,
  'CLAUDE.md': CLAUDE,
  'DATA_REFERENCE_INDEX.md': DATA_REFERENCE_INDEX,
  'DQL_Queries_Reference.md': DQL_Queries_Reference,
  'Entities_Reference.md': Entities_Reference,
  'Logs_Reference.md': Logs_Reference,
  'MCP_Query_Optimization_Guide.md': MCP_Query_Optimization_Guide,
  'Metrics_Reference.md': Metrics_Reference,
  'Spans_Reference.md': Spans_Reference,
  'discovered-findings.md': discovered_findings,
  'dql-lessons.md': dql_lessons,
  'mcp_query_tracking_schema.md': mcp_query_tracking_schema,
  'scope_increase.md': scope_increase,
};
