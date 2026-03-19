# BizEvents Reference Guide

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

**Event Type:** `your.event.type`

### Key Fields Available
| Field | Example Value | Description |
|-------|---------------|-------------|
| `field1` | "value" | Description |
| `field2` | 123 | Description |
| `trace_id` | "abc123..." | Distributed trace correlation |
| `responseCode` | 200 | HTTP response code |

**Note:** [Any important field notes or nested data structures]

### Sample Query
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| fields timestamp, field1, field2
| limit 50
```

---

## Quick Reference: Event Types by Category

### 📊 Category 1: [CATEGORY_NAME]
| Event Type | Count (Period) | Description |
|------------|----------------|-------------|
| *(Add as discovered)* | | |

**Example Query:**
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| limit 50
```

---

### 📊 Category 2: [CATEGORY_NAME]
| Event Type | Count (Period) | Description |
|------------|----------------|-------------|
| *(Add as discovered)* | | |

---

## 🔍 Event Type Discovery Query

Run this to discover all event types:
```dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
| limit 50
```

---

## 📊 Event Fields Reference

### Common Fields (All Events)
| Field | Type | Description |
|-------|------|-------------|
| `event.type` | string | Event type identifier |
| `timestamp` | datetime | Event timestamp |
| `event.provider` | string | Source system |

### Custom Fields by Event Type

#### [event.type.1]
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| *(Add as discovered)* | | | |

---

## 📈 Efficient Query Patterns

### Event Type Summary (Start Here)
```dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
```

### Hourly Volume Analysis
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| summarize count = count(), by:{bin(timestamp, 1h)}
| sort timestamp asc
```

### Specific Event Analysis
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| fields timestamp, field1, field2, field3
| limit 50
```

### Failure Analysis
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| filter result != "success" or responseCode != 200
| summarize count = count(), by:{result}
```

### Multi-Dimensional Analysis
```dql
fetch bizevents, from:now()-7d
| filter event.type == "your.event.type"
| summarize count = count(), by:{dimension1, dimension2}
| sort count desc
```

### Trace Correlation
```dql
fetch bizevents, from:now()-24h
| filter event.type == "your.event.type"
| filter trace_id == "YOUR_TRACE_ID"
| fields timestamp, responseCode, field1
```

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
