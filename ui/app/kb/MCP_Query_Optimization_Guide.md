# MCP Query Optimization Guide

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
```
Use: mcp_dynatrace-mcp_find_entity_by_name
Before querying spans/logs, find the entity ID first.
This costs 0 GB and gives you the correct filter.
```

**Example:** Instead of filtering by name in spans, get the entity ID first:
- ✅ `find_entity_by_name("My Service")` → Returns `SERVICE-XXXXXXXXXXXX`
- ✅ Then filter: `dt.entity.service == "SERVICE-XXXXXXXXXXXX"`

### 2. Use Metrics Over Spans When Possible (FREE vs HIGH COST)
```dql
// ✅ LOW COST - Uses pre-aggregated metrics (0 GB)
timeseries {
  requests = sum(dt.service.request.count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}

// ❌ HIGH COST - Scans raw span data (100+ GB for 7d)
fetch spans, from:now()-7d
| filter dt.entity.service == "SERVICE-ID"
| summarize count()
```

### 3. Reduce Timeframes for Exploratory Queries
```dql
// ✅ Start with 24h for exploration (15-20 GB)
fetch spans, from:now()-24h
| filter dt.entity.service == "SERVICE-ID"
| summarize count(), by:{span.name}

// ❌ Don't start with 7d (100+ GB)
fetch spans, from:now()-7d  // Only use after validating query
```

### 4. Filter BizEvents by event.type First
```dql
// ✅ EFFICIENT - Filter early (0.5 GB)
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| filter customField == "value"
| summarize count()

// ❌ INEFFICIENT - No event.type filter scans everything
fetch bizevents, from:now()-7d
| filter customField == "value"
| summarize count()
```

### 5. Use Aggregations, Not Raw Data
```dql
// ✅ Returns summary (small response, few tokens)
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{loglevel}

// ❌ Returns raw logs (large response, many tokens)
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| limit 1000
```

---

## 🎯 Query Patterns for Common Use Cases

### Entity Discovery (FREE)
```dql
// Find service by name
Use: find_entity_by_name("service-name")

// Explore topology
smartscapeNodes "SERVICE"
| filter matchesPhrase(displayName, "service-name")
```

### Service Health (FREE)
```dql
timeseries {
  requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}
```

### BizEvents Summary (LOW COST)
```dql
fetch bizevents, from:now()-7d
| summarize count = count(), by:{event.type}
| sort count desc
| limit 20
```

### Error Analysis (MEDIUM COST)
```dql
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| summarize count = count(), by:{loglevel}
```

---

## 📉 Token Cost Reduction Strategies

### 1. Use `recordLimit` Parameter
```javascript
// Set lower limits for exploration
mcp_dynatrace-mcp_execute_dql({
  dqlStatement: "fetch bizevents...",
  recordLimit: 10  // Default is 100, reduce for exploration
})
```

### 2. Select Only Needed Fields
```dql
// ✅ Returns only needed fields
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| fields timestamp, amount, result
| limit 20

// ❌ Returns all fields (many columns per record)
fetch bizevents, from:now()-7d
| filter event.type == "com.example.payment"
| limit 20
```

### 3. Use Semantic Dictionary for Field Discovery
```dql
// Find available fields before querying (0 cost)
fetch dt.semantic_dictionary.models
| filter data_object == "logs"
```

### 4. Batch Related Questions
Instead of making 5 separate queries, combine into one:
```dql
// ✅ Single query with multiple aggregations
fetch bizevents, from:now()-7d
| summarize 
    eventType1 = countIf(event.type == "type1"),
    eventType2 = countIf(event.type == "type2"),
    eventType3 = countIf(event.type == "type3")
```

---

## 🔄 Query Workflow for New Analysis

### Step 1: Read Reference Files FIRST (NO QUERIES!)
```
1. Check Entities_Reference.md for cached entity IDs
2. Check BizEvents_Reference.md for known event types
3. Check Spans_Reference.md for span patterns
4. Check Logs_Reference.md for error patterns
```

### Step 2: Entity Discovery (0 cost - if needed)
```
1. Use find_entity_by_name to get entity IDs
2. Use smartscapeNodes to understand topology
3. ⚠️ UPDATE Entities_Reference.md with new IDs!
```

### Step 3: Metric Overview (0 cost)
```
1. Query available metrics with metric.series
2. Use timeseries for trend data
3. ⚠️ UPDATE Metrics_Reference.md with baselines!
```

### Step 4: BizEvents Summary (low cost)
```
1. Start with event.type summary
2. Add filters incrementally
3. Use 24h timeframe initially
4. ⚠️ UPDATE BizEvents_Reference.md with new types!
```

### Step 5: Spans/Logs Deep Dive (do last, high cost)
```
1. Only if metrics don't answer the question
2. Always filter by entity ID
3. Use shortest timeframe needed
4. Aggregate, don't fetch raw data
5. ⚠️ UPDATE Spans_Reference.md or Logs_Reference.md!
```

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
```dql
// ❌ COST: 300+ GB
fetch spans, from:now()-7d
| summarize count()
```

**Solution:** Always filter by entity and use metrics instead:
```dql
// ✅ COST: 0 GB
timeseries { requests = sum(dt.service.request.count) },
from:now()-7d, interval:1d
```

### ❌ Mistake #2: Repeating Entity Lookups
```dql
// ❌ Multiple queries for same entity (inefficient)
find_entity_by_name("My Service")  // Query 1
find_entity_by_name("My Service")  // Query 2
```

**Solution:** Cache entity IDs in Entities_Reference.md and reuse them!

### ❌ Mistake #3: Not Filtering BizEvents by event.type
```dql
// ❌ Scans ALL events
fetch bizevents, from:now()-7d
| filter customField == "value"
```

**Solution:** Filter by event.type FIRST:
```dql
// ✅ Scans only specific event type
fetch bizevents, from:now()-7d
| filter event.type == "specific.event.type"
| filter customField == "value"
```

### ❌ Mistake #4: Fetching Raw Logs Without loglevel Filter
```dql
// ❌ COST: 85 GB
fetch logs, from:now()-24h
| filter contains(content, "error")
```

**Solution:** Always filter by loglevel first:
```dql
// ✅ COST: 10 GB
fetch logs, from:now()-24h
| filter loglevel == "ERROR"
| filter contains(content, "keyword")
```

### ❌ Mistake #5: Using Spans When Metrics Exist
```dql
// ❌ COST: 125 GB
fetch spans, from:now()-7d
| filter dt.entity.service == "SERVICE-ID"
| summarize count()
```

**Solution:** Use free metrics:
```dql
// ✅ COST: 0 GB
timeseries { requests = sum(dt.service.request.count) },
from:now()-7d, interval:1d, filter:{dt.entity.service == "SERVICE-ID"}
```

---

## 🎓 Learning from Sessions

As you use this workspace, document patterns:
1. What queries cost most?
2. What alternative approaches work better?
3. What entity IDs get reused frequently?
4. What event types have highest volume?

Update the reference files after EVERY session to build institutional knowledge!
