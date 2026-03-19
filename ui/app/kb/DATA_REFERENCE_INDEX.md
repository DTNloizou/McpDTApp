# Dynatrace Data Reference Index

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
| `user.sessions` | Session duration, bounce rate, engagement, errors, device, ISP, geo | `duration`, `user_interaction_count`, `request_count`, `navigation_count`, `error.count`, `error.exception_count`, `error.http_4xx_count`, `error.http_5xx_count`, `end_reason`, `device.type`, `os.name`, `browser.name`, `browser.version`, `device.screen.width`, `device.screen.height`, `browser.window.width`, `browser.window.height`, `client.isp`, `geo.country.iso_code`, `frontend.name`, `dt.rum.application.entities`, `characteristics.is_invalid`, `characteristics.has_replay`, `device.is_rooted` | ~1-2 GB per 7d |

**Scope required:** `storage:user.sessions:read` (Gen3 dot-notation — NOT `user-sessions` with hyphen)

**Filter:** `in(dt.rum.application.entities, "APPLICATION-xxx")` or `frontend.name == "App Name"`

**Much cheaper than user.events for session-level analysis!**

#### user.events (RUM Events)
| Scope | Purpose | Key Fields | Cost |
|-------|---------|------------|------|
| `user.events` | JavaScript errors, RUM exceptions, navigation events, user interactions | `error.id`, `error.type`, `error.message`, `dt.rum.application.id`, `dt.rum.application.entity`, `os.name`, `browser.user_agent`, `device.screen.width`, `device.screen.height`, `page.source.url.full`, `navigation.type`, `client.isp`, `characteristics.classifier` | 5-30 GB per 7d |

**Note:** `user.events` provides event-level detail (clicks, errors, navigations) while `user.sessions` provides aggregated session metrics.

#### Standard Data Objects
| Scope | Purpose | Key Fields |
|-------|---------|------------|
| `bizevents` | Business events | `event.type`, custom fields |
| `spans` | Distributed traces | `span.name`, `duration`, `dt.entity.service` |
| `logs` | Log messages | `content`, `loglevel`, `log.source` |

---

## 🔄 Self-Updating Protocol

### When to Update Reference Files
AI assistants MUST update relevant reference files when:
1. **New entity discovered** → Add to `Entities_Reference.md`
2. **New event type found** → Add to `BizEvents_Reference.md`
3. **New span/service discovered** → Add to `Spans_Reference.md`
4. **Query cost insight gained** → Add to `MCP_Query_Optimization_Guide.md`
5. **New error pattern identified** → Add to `Logs_Reference.md`

### Update Format
```markdown
## [DATE] Update
- **Source:** [Query or analysis that discovered this]
- **Finding:** [What was learned]
- **Data:** [Specific values, IDs, patterns]
```

---

## 🚀 AI Session Startup Protocol

### Step 1: Read Reference Files (NO QUERIES YET)
```
1. Read this index file
2. Read Entities_Reference.md (for cached entity IDs)
3. Read relevant data type reference for your task
4. Read MCP_Query_Optimization_Guide.md
```

### Step 2: Check if Information Already Exists
Before making ANY MCP query, check:
- Is the entity ID already in `Entities_Reference.md`?
- Is the event type documented in `BizEvents_Reference.md`?
- Is this query pattern in `MCP_Query_Optimization_Guide.md`?

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
AI assistants MUST send a tracking event after EVERY MCP query using `send_event`:
- **eventType:** `CUSTOM_INFO`
- **title:** `MCP Query Execution`
- **user.id:** Value from `.env` MCP_USER_ID

See [mcp_query_tracking_schema.md](mcp_query_tracking_schema.md) for full event schema.

### Dashboard
Import `example/MCP_Query_Usage_Dashboard.json` to monitor:
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
