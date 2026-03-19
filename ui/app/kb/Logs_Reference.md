# Logs Reference

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
| 🔴 #1 | [service-name] | `SERVICE-XXXXXXXXXXXX` | [count] | [description] |
| 🔴 #2 | [service-name] | `SERVICE-XXXXXXXXXXXX` | [count] | [description] |
| 🟠 #3 | [service-name] | `SERVICE-XXXXXXXXXXXX` | [count] | [description] |

**Trend Analysis:**
- [Service name] errors: [trend description]
- [Notable pattern or change]

---

## �🚨 Common Error Patterns

### 1. [Error Pattern Name]
**Frequency:** [Common/Occasional/Rare]  
**Log Level:** ERROR  
**Pattern:**
```
[Example log message pattern]
```
**Cause:** [Root cause description]  
**Impact:** [Low/Medium/High] - [Impact description]

### 2. [Error Pattern Name]
**Frequency:** [Common/Occasional/Rare]  
**Log Level:** ERROR  
**Pattern:**
```
[Example log message pattern]
```
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

```dql
fetch user.events, from:now()-24h
| filter error.type == "csp" or error.reason == "csp"
| summarize count = count(), by:{csp.blocked_uri.domain, csp.effective_directive, csp.disposition}
| sort count desc
```

**Key CSP Fields:**
- `csp.blocked_uri.domain` - What was blocked
- `csp.effective_directive` - Which CSP directive (connect-src, script-src-elem, img-src, etc.)
- `csp.disposition` - "report" (logged only) or "enforce" (actually blocked)
- `csp.document_uri.domain` - Where the violation occurred
- `csp.source_file.full` - Script/resource that triggered the violation

### JavaScript Errors
```dql
fetch user.events, from:now()-24h
| filter error.type == "javascript"
| summarize count = count(), sessions = countDistinct(dt.rum.session.id), by:{error.message, error.id}
| sort count desc
| limit 20
```

---

## 📊 Efficient Log Queries

### ✅ Aggregation Query (Low Cost)
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR" or loglevel == "WARN"
| summarize count = count(), by:{loglevel}
```

### ✅ Error Pattern Detection
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| parse content, "LD 'exception' LD:exceptionType ':' LD:message"
| summarize count = count(), by:{exceptionType}
| sort count desc
| limit 10
```

### ✅ Service-Specific Errors (Entity Filter)
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR" and dt.entity.service == "SERVICE-XXXX"
| summarize count = count(), by:{content}
| sort count desc
| limit 20
```

### ⚠️ Recent Errors (Use limit)
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| fields timestamp, content
| sort timestamp desc
| limit 10
```

### ❌ Avoid: Full-text search without filters
```dql
// This is expensive!
fetch logs, from:now()-24h
| filter matchesPhrase(content, "error")
```

---

## 🔧 Available Log Fields

| Field | Type | Example |
|-------|------|---------|
| `timestamp` | datetime | 2026-01-29T11:07:50.436Z |
| `content` | string | Log message text |
| `loglevel` | string | ERROR, WARN, INFO, DEBUG, NONE |
| `log.source` | string | "Container Output", "journald" |
| `dt.entity.process_group` | entity ID | Process group entity |
| `dt.entity.host` | entity ID | Host entity |
| `trace_id` | string | Distributed trace correlation |
| `span_id` | string | Span correlation |

---

## 🎯 Log Query Patterns by Use Case

### Top Error Services (Start Here - Most Important)
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{dt.entity.service}
| sort count desc
| limit 10
```

### Error Trends Over Time
```dql
fetch logs, from:now()-7d
| filter loglevel == "ERROR"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count(), by:{bin(timestamp, 1h)}
| sort timestamp asc
```

### Error Investigation
```dql
fetch logs, from:now()-1h
| filter loglevel == "ERROR"
| filter matchesPhrase(content, "keyword")
| fields timestamp, content
| limit 20
```

### Service-Specific Logs
```dql
fetch logs, from:now()-24h
| filter dt.entity.process_group == "PROCESS_GROUP-XXXX"
| filter loglevel == "ERROR"
| summarize count = count(), by:{bin(timestamp, 1h)}
```

### Exception Analysis
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| filter matchesPhrase(content, "Exception")
| parse content, "'Exception:' LD:exceptionMessage"
| summarize count = count(), by:{exceptionMessage}
| sort count desc
```

### Warning Analysis
```dql
fetch logs, from:now()-24h
| filter loglevel == "WARN"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| summarize count = count()
```

### Multi-Service Error Comparison
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{dt.entity.service, loglevel}
| sort count desc
```

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
