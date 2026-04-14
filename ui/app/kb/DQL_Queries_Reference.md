# DQL Queries Reference

Verified, copy-paste-ready DQL queries for all major Grail data sources.
Every query in this file has been tested against a live Dynatrace environment and returned valid results.

---

## Data Sources

| Source | `fetch` keyword | Timestamp field | Cost |
|--------|----------------|-----------------|------|
| Logs | `logs` | `timestamp` | Medium-High |
| Spans / Traces | `spans` | `start_time` (NOT `timestamp`) | High |
| Business Events | `bizevents` | `timestamp` | Medium |
| Events (Davis + Fleet) | `events` | `timestamp` | Low |
| Davis Problems | `dt.davis.problems` | `timestamp` | Low |
| Metrics (timeseries) | Use `timeseries` command | N/A | Free |
| Entities | `dt.entity.<type>` | N/A (no time field) | Free |

### CRITICAL: Spans use `start_time`, NOT `timestamp`

Spans have `start_time` and `end_time`. The `timestamp` field is **null** on spans.
If you use `bin(timestamp, 15m)` on spans, every row goes into a null bucket.

**Wrong:**
```dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{time = bin(timestamp, 15m)}
```

**Correct:**
```dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{time = bin(start_time, 15m)}
```

Logs and bizevents use `timestamp` normally.

---

### CRITICAL: Never output raw entity IDs

Entity IDs like `SERVICE-B4F9C95D2BCCED72` or `HOST-24B49251EA1EE742` are meaningless to users.
When grouping by or displaying `dt.entity.service`, `dt.entity.host`, or any entity field, **always** use `entityName()` to resolve to the human-readable name.

**Wrong:**
```
| summarize cnt = count(), by:{dt.entity.service}
```
Outputs: `SERVICE-B4F9C95D2BCCED72 | 1504`

**Correct — inline with fieldsAdd:**
```
| summarize cnt = count(), by:{dt.entity.service}
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields serviceName, cnt
```

**Correct — inline in by:{}:**
```
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
```
Outputs: `banking-transaction-service | 1504`

`entityName()` works for any entity type:
- `entityName(dt.entity.service)` → service name
- `entityName(dt.entity.host)` → host name
- `entityName(dt.entity.process_group_instance)` → process group name

---

## Entity Queries (FREE — no data cost)

### List all services
```dql
fetch dt.entity.service
| fields id, entity.name, lifetime, tags
| sort entity.name asc
```

### List all hosts
```dql
fetch dt.entity.host
| fields id, entity.name, lifetime, tags, ipAddress
```

### List all process group instances
```dql
fetch dt.entity.process_group_instance
| fields id, entity.name, lifetime
| sort entity.name asc
| limit 20
```

### Filter entities with in()
Use `in()` function with curly braces — NOT `IN` keyword, NOT parentheses, NOT square brackets.
```dql
fetch dt.entity.service
| filter in(entity.name, {"retail-checkout-service", "retail-payment-service"})
| fields id, entity.name
```

### Service call relationships (topology)
```dql
fetch dt.entity.service
| fields id, entity.name, calls[dt.entity.service]
```

---

## Span / Trace Queries

### Top endpoints by volume
```dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), by:{span.name}
| sort cnt desc
| limit 10
```

### Error rate by endpoint
```dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), errors = countIf(http.response.status_code >= 400), by:{span.name}
| fieldsAdd errorRate = round(toDouble(errors) * 100.0 / toDouble(cnt), decimals:1)
| sort errors desc
| limit 10
```

### Response time percentiles by endpoint
Duration is in **nanoseconds**. Divide by 1,000,000 to get milliseconds.
```dql
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
```

### Error rate over time (time-bucketed)
```dql
fetch spans, from:now()-2h
| filter span.kind == "server"
| summarize cnt = count(), errors = countIf(http.response.status_code >= 400),
    by:{time = bin(start_time, 15m)}
| fieldsAdd errorRate = round(toDouble(errors) * 100.0 / toDouble(cnt), decimals:1)
| sort time asc
```

### Filter spans by service name
```dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| fieldsAdd serviceName = entityName(dt.entity.service)
| filter serviceName == "banking-transaction-service"
| summarize cnt = count(), avgDuration = avg(duration), by:{span.name, serviceName}
| sort cnt desc
```

### Filter spans containing a keyword
Use `contains()` function — NOT the `contains` operator.
```dql
fetch spans, from:now()-1h
| filter span.kind == "server" AND contains(span.name, "bank-payment")
| summarize cnt = count(), avgDuration = avg(duration),
    errors = countIf(http.response.status_code >= 400),
    by:{span.name}
| sort cnt desc
```

### Find 5xx errors with matchesValue wildcard
```dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| fieldsAdd statusStr = toString(http.response.status_code)
| filter matchesValue(statusStr, "5*")
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields start_time, span.name, http.response.status_code, duration, serviceName
| sort start_time desc
| limit 10
```

### Service health with conditional labels
```dql
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
```

### P95 response time excluding health checks
Use `NOT` before a function call.
```dql
fetch spans, from:now()-1h
| filter span.kind == "server" AND NOT contains(span.name, "health")
| summarize cnt = count(), p95Duration = percentile(duration, 95), by:{span.name}
| fieldsAdd p95Ms = round(toDouble(p95Duration) / 1000000.0, decimals:2)
| sort p95Ms desc
| limit 10
```

### Throughput per service
```dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| summarize cnt = count(), avgDuration = avg(duration),
    by:{serviceName = entityName(dt.entity.service)}
| fieldsAdd avgResponseMs = round(toDouble(avgDuration) / 1000000.0, decimals:1)
| fields serviceName, cnt, avgResponseMs
| sort cnt desc
```

### Distinct endpoints per service
```dql
fetch spans, from:now()-1h
| filter span.kind == "server"
| summarize cnt = count(), endpoints = collectDistinct(span.name),
    by:{serviceName = entityName(dt.entity.service)}
| fields serviceName, cnt, endpoints
| sort cnt desc
```

---

## Log Queries

### Log volume by level
```dql
fetch logs, from:now()-2h
| summarize cnt = count(), by:{loglevel}
| sort cnt desc
```

### Error logs over time
```dql
fetch logs, from:now()-2h
| filter loglevel == "ERROR"
| summarize cnt = count(), by:{time = bin(timestamp, 15m)}
| sort time asc
```

### Recent error logs with content
```dql
fetch logs, from:now()-1h
| filter loglevel == "ERROR"
| fieldsAdd hostName = entityName(dt.entity.host)
| fields timestamp, content, loglevel, log.source, hostName
| sort timestamp desc
| limit 10
```

### Search logs with matchesPhrase
For exact phrase matching in log content (more efficient than `contains` for long text).
```dql
fetch logs, from:now()-2h
| filter matchesPhrase(content, "SettlementDiscrepancyError")
| summarize cnt = count(), by:{log.source}
| sort cnt desc
```

### Search logs with contains
```dql
fetch logs, from:now()-2h
| filter contains(content, "error") OR contains(content, "Error")
| fields timestamp, content, loglevel, log.source
| sort timestamp desc
| limit 10
```

### Log volume by host
```dql
fetch logs, from:now()-2h
| summarize cnt = count(), by:{hostName = entityName(dt.entity.host)}
| sort cnt desc
| limit 10
```

---

## Business Events Queries

### Event types overview
```dql
fetch bizevents, from:now()-24h
| summarize cnt = count(), by:{event.type}
| sort cnt desc
```

### Discover bizevent fields (always do this first)
Bizevent schemas vary by `event.type`. Always fetch one record to see available fields.
```dql
fetch bizevents, from:now()-1h
| filter event.type == "bank-payment.transactions"
| limit 1
```

### Transaction summary by customer
```dql
fetch bizevents, from:now()-24h
| filter event.type == "bank-payment.transactions"
| summarize transactions = count(),
    discrepancies = countIf(settlementStatus == "DISCREPANCY"),
    totalInstructed = sum(instructedAmountGBP),
    totalSettled = sum(settledAmountGBP),
    by:{orderingCustomerName}
| fieldsAdd discrepancyRate = round(toDouble(discrepancies) * 100.0 / toDouble(transactions), decimals:1)
| sort transactions desc
```

### Transaction volume and loss over time
```dql
fetch bizevents, from:now()-24h
| filter event.type == "bank-payment.transactions"
| summarize transactions = count(),
    avgAmount = avg(instructedAmountGBP),
    totalLoss = sum(differenceGBP),
    by:{time = bin(timestamp, 1h), settlementStatus}
| sort time desc
| limit 20
```

### Payment flow events (credit/debit/transfer)
```dql
fetch bizevents, from:now()-24h
| filter in(event.type, {"bank-payment.credit", "bank-payment.debit", "bank-payment.transfer-request"})
| summarize cnt = count(), by:{event.type, status}
| sort cnt desc
```

---

## Events Queries (Davis + Fleet)

### Event kinds overview
```dql
fetch events, from:now()-24h
| summarize cnt = count(), by:{event.kind}
| sort cnt desc
```

### Davis events (problems, restarts)
```dql
fetch events, from:now()-24h
| filter event.kind == "DAVIS_EVENT"
| fieldsAdd hostName = entityName(dt.entity.host),
    serviceName = entityName(dt.entity.service)
| fields timestamp, event.name, event.type, event.status, hostName, serviceName
| sort timestamp desc
| limit 10
```

---

## Davis Problems

### Recent problems
```dql
fetch dt.davis.problems, from:now()-7d
| fields display_id, event.name, event.status, event.category,
    event.start, event.end, event.description,
    affected_entity_ids, affected_entity_names,
    root_cause_entity_id, root_cause_entity_name
| sort timestamp desc
| limit 10
```

### Open problems only
```dql
fetch dt.davis.problems, from:now()-7d
| filter event.status == "ACTIVE"
| fields display_id, event.name, event.category,
    event.start, affected_entity_names, root_cause_entity_name
| sort timestamp desc
```

---

## Metric Queries (FREE — no data cost)

### CPU usage over time
```dql
timeseries avg_cpu = avg(dt.host.cpu.usage), from:now()-2h, by:{dt.entity.host}
```

### Memory usage over time
```dql
timeseries mem = avg(dt.host.memory.usage), from:now()-2h, by:{dt.entity.host}
```

### Disk usage
```dql
timeseries disk = avg(dt.host.disk.usage), from:now()-2h, by:{dt.entity.host}
```

### Network traffic
```dql
timeseries bytesin = sum(dt.host.network.nic.traffic.in), from:now()-2h, by:{dt.entity.host}
```

---

## Syntax Reference — Common Pitfalls

### sort cannot use aggregation functions
**Wrong:** `| summarize cnt = count() | sort count() desc`
**Correct:** `| summarize cnt = count() | sort cnt desc`

### `by:{}` needs curly braces AND a comma before it
**Wrong:** `summarize count() by fieldName`
**Wrong:** `summarize cnt = count() by:{field}`
**Correct:** `summarize cnt = count(), by:{field}`

### bin() must be aliased
**Wrong:** `by:{bin(timestamp, 1h)}`
**Correct:** `by:{time = bin(timestamp, 1h)}`

### contains() is a function
**Wrong:** `field contains "value"`
**Correct:** `contains(field, "value")`

### in() uses curly braces for value lists
**Wrong:** `filter field IN ("a", "b")`
**Wrong:** `filter in(field, ["a", "b"])`
**Correct:** `filter in(field, {"a", "b"})`

### round() uses named decimals parameter
**Wrong:** `round(value, 2)`
**Correct:** `round(value, decimals:2)`

### countIf is camelCase
**Wrong:** `count_if()`, `COUNT_IF()`
**Correct:** `countIf(condition)`

### fieldsAdd not compute
**Wrong:** `| compute newField = expression`
**Correct:** `| fieldsAdd newField = expression`

### if/else syntax
Use nested `if()` with `else:` named parameter:
```dql
if(condition1, "value1", else:if(condition2, "value2", else:"default"))
```

### Duration is in nanoseconds
Span `duration` field is in nanoseconds. Divide by 1,000,000 for milliseconds:
```dql
fieldsAdd durationMs = round(toDouble(duration) / 1000000.0, decimals:2)
```

### entityName() to resolve entity IDs
Use `entityName()` to convert entity IDs to human-readable names. Works inline:
```dql
| fieldsAdd serviceName = entityName(dt.entity.service)
```
Or directly in `by:{}`:
```dql
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
```

### lookup syntax (for advanced joins)
Use `lookup` when you need to join additional entity fields beyond the name:
```dql
| lookup [fetch dt.entity.service | fields id, entity.name, tags],
    sourceField:dt.entity.service, lookupField:id, prefix:"svc."
```
After lookup, access joined fields with the prefix: `svc.entity.name`, `svc.tags`.

### matchesValue for wildcard patterns
```dql
| filter matchesValue(toString(http.response.status_code), "5*")
```

### matchesPhrase for exact log phrase search
More efficient than `contains()` for searching in log content:
```dql
| filter matchesPhrase(content, "exact error phrase")
```

### Always discover before filtering
Never guess field values. Run a discovery query first:
```dql
fetch spans, from:now()-1h | summarize cnt = count(), by:{span.name} | sort cnt desc | limit 20
```
Then filter on actual values from the results.
