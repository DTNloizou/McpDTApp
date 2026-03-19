# Dynatrace Workspace - AI Instructions

> **IMPORTANT:** This file is automatically read by AI assistants at session start.
> **CRITICAL:** Read reference files BEFORE making any MCP queries!

---

## ⚡ SESSION CONSTANTS

| Constant | Value | Source |
|----------|-------|--------|
| `user.id` | **(resolve at session start — see below)** | `.env` → `MCP_USER_ID` |
| `budget.total_gb` | `"1000"` | Fixed |
| `query.source` | `"MCP"` | Fixed |

### ⛔ MANDATORY: Resolve `user.id` BEFORE First MCP Query

**At the very start of every session, BEFORE any MCP tool call, you MUST:**

1. **Read the `.env` file** in the workspace root using `read_file`
2. **Extract the value of `MCP_USER_ID`** (it is an email address, e.g. `user@company.com`)
3. **Store it as `user.id`** — use this exact value on ALL tracking events for the entire session

**If `.env` does not exist or `MCP_USER_ID` is missing/empty:**
1. **ASK the user** for their email address (use the `ask_questions` tool)
2. **Use their response as `user.id`** for the rest of the session
3. **NEVER fall back to placeholders** like "unknown", "copilot-session", or "test_user"

**Example `.env` line:**
```
MCP_USER_ID=user@company.com
```
→ `user.id` = `"user@company.com"` on every tracking event.

**⛔ NEVER skip this step. NEVER guess. NEVER use a placeholder. Every tracking event MUST have the real user email.**

---

## ⛔ MANDATORY: SEND TRACKING EVENT AFTER EVERY MCP QUERY

**THIS IS NOT OPTIONAL. After EVERY MCP query (execute_dql, list_problems, find_entity_by_name, etc.), you MUST send a tracking event.**

**IMPORTANT:** `send_event` sends CUSTOM_INFO events (queryable via `fetch events`), NOT BizEvents. The dashboard queries `fetch events | filter event.name == "MCP Query Execution"`.

### How to Send the Tracking Event
After each MCP tool call that returns results, use `send_event` with:

```
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
```

### Extracting Values from MCP Responses
Every MCP `execute_dql` response includes these values — extract and send them:
```
📊 DQL Query Results
- Scanned Records: 6,723,074        → query.records_scanned = "6723074"
- Scanned Bytes: 0.84 GB            → query.bytes_scanned = "0.84"
- Session total: 0.84 GB / 1000 GB  → budget.consumed_gb = "0.84"
- 0.1% used                         → budget.percentage_used = "0.1"
```

For FREE tools (find_entity_by_name, list_problems, list_vulnerabilities, timeseries):
```
query.bytes_scanned: "0"
query.cost_usd: "0"
query.data_object: "entities" (or "problems", "vulnerabilities", "metrics")
```

### Why This Is Mandatory
- Tracks ALL MCP query usage across users and sessions
- Enables the MCP Query Usage Dashboard (`example/MCP_Query_Usage_Dashboard.json`)
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
```
1. DATA_REFERENCE_INDEX.md - Central index, quick lookups
2. Entities_Reference.md - Cached entity IDs
3. [Relevant data type reference for your task]
4. MCP_Query_Optimization_Guide.md - Cost rules
```

### Step 2: Check if Data Already Exists
Before ANY MCP query, check reference files for:
- Entity IDs → `Entities_Reference.md`
- Event types → `BizEvents_Reference.md`
- Span patterns → `Spans_Reference.md`
- Error patterns → `Logs_Reference.md`
- Metrics → `Metrics_Reference.md`

### Step 3: Query Only for NEW Information
Only use MCP tools for data NOT already documented.

### Step 4: SEND TRACKING EVENT After Every Query
**⛔ NON-NEGOTIABLE:** After EVERY MCP tool call, send a tracking event using `send_event` (CUSTOM_INFO). See the mandatory protocol at the top of this file.

### Step 5: UPDATE Reference Files IMMEDIATELY After Queries
**⛔ NON-NEGOTIABLE:** After discovering new data, update the relevant reference file BEFORE continuing with other tasks!

---

## 🔄 SELF-UPDATING PROTOCOL (MANDATORY)

**After EVERY MCP query, IMMEDIATELY update:**

| When You Discover | Update This File | Priority |
|-------------------|------------------|----------|
| New entity ID | `Entities_Reference.md` | ⛔ NOW |
| New span pattern or field availability | `Spans_Reference.md` | ⛔ NOW |
| New event type | `BizEvents_Reference.md` | ⛔ NOW |
| New error pattern | `Logs_Reference.md` | ⛔ NOW |
| New metric | `Metrics_Reference.md` | ⛔ NOW |
| Query cost insight | `MCP_Query_Optimization_Guide.md` | ⛔ NOW |

### What MUST Be Documented:
- Entity IDs discovered via `find_entity_by_name`
- Span names and which fields are available on each
- Field availability differences (e.g., `server.address` only on HTTP endpoint spans)
- Volume/count baselines
- Performance baselines (avg duration, p95, etc.)
- Failure patterns and error codes

### Mandatory Rules
```
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
```

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
```
find_entity_by_name, list_problems, list_vulnerabilities, timeseries metrics
```

### LOW Cost (0-5 GB)
```dql
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"  // ALWAYS filter event.type first
| filter customField == "value"
| summarize count()
```

### HIGH Cost (100+ GB) - AVOID
```dql
// DON'T DO THIS - costs 100+ GB
fetch spans, from:now()-7d
| summarize count()
```

### CORRECT Pattern
```dql
// DO THIS - use metrics (FREE)
timeseries { requests = sum(dt.service.request.count) }, 
from:now()-7d, filter:{dt.entity.service == "SERVICE-XXXXXXXXXXXX"}
```

---

## 📚 Reference Files Index

| File | Purpose |
|------|---------|
| `DATA_REFERENCE_INDEX.md` | **START HERE** - Central index |
| `Entities_Reference.md` | Cached entity IDs |
| `BizEvents_Reference.md` | Event types |
| `Spans_Reference.md` | Span/trace patterns |
| `Logs_Reference.md` | Log and error patterns |
| `Metrics_Reference.md` | Free metric queries |
| `MCP_Query_Optimization_Guide.md` | Full cost guide |
| `mcp_query_tracking_schema.md` | MCP telemetry event schema |
| `AI_Prompt.md` | Task templates |
| `example/MCP_Query_Usage_Dashboard.json` | MCP usage tracking dashboard |

---

## 🎯 Common Analysis Patterns

### Pattern 1: Service Performance Analysis
1. Read `Entities_Reference.md` for service ID (or find_entity_by_name)
2. Use FREE metrics for request counts, response times, error rates
3. Only dive into spans if metrics show anomaly
4. Document findings in `Spans_Reference.md`

### Pattern 2: Error Investigation  
1. Check `Logs_Reference.md` for known error patterns
2. Query logs with loglevel filter (10-15 GB for 24h)
3. Identify top error services
4. Document new patterns in `Logs_Reference.md`

### Pattern 3: Business Event Analysis
1. Check `BizEvents_Reference.md` for known event types
2. Start with event.type summary query
3. Filter by specific event.type + dimensions
4. Document new event types in `BizEvents_Reference.md`

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
> Use this to look up valid field names, data object types (e.g. `user.events`, `user.sessions`), and model conventions before writing DQL queries.

## ⚠️ Permission Error Handling
When a DQL query returns `NOT_AUTHORIZED_FOR_TABLE` or similar permission errors:
1. **Do NOT retry** — the scope is missing from the token
2. **Log it immediately** in `scope_increase.md` with the exact error, failed query, and required scope
3. **Work around it** using alternative data sources if possible
4. **Inform the user** that a scope increase is needed

---

## �💡 Remember

**The goal is to build institutional knowledge that persists across sessions.**
**Every query is an opportunity to learn and document.**
**Future sessions should be faster and cheaper than current ones!**
