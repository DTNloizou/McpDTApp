# DQL Lessons Learned

This document is automatically updated when the app discovers DQL syntax issues.
Claude and Davis use this to avoid repeating the same mistakes.

---

### contains() is a function, not an operator
**Wrong:** `service.name contains "payment"`
**Correct:** `contains(service.name, "payment")`

---

### bin() must be aliased in by:{}
**Wrong:** `summarize count(), by:{bin(timestamp, 1h)}`
**Correct:** `summarize count(), by:{time = bin(timestamp, 1h)}`
**Why:** Without an alias, the field has no name and `sort timestamp` breaks.
After aliasing, use `sort time` not `sort timestamp`.

---

### Multiplication needs explicit * operator
**Wrong:** `(toDouble(countIf(x)) / toDouble(count())) 100`
**Correct:** `(toDouble(countIf(x)) / toDouble(count())) * 100`

---

### Group-by uses curly braces AND comma separator
**Wrong:** `summarize count() by fieldName`
**Wrong:** `summarize count(), avgErrors = avg(error.count) by:{field}`
**Correct:** `summarize count(), by:{fieldName}`
**Correct:** `summarize sessions = count(), avgErrors = avg(error.count), by:{field}`
**Why:** There MUST be a comma before `by:` — it is a separate parameter, not a continuation.

---

### countIf is camelCase, not count_if
**Wrong:** `countIf` alternatives: `count_if()`, `COUNT_IF()`
**Correct:** `countIf(condition)` — e.g. `countIf(error.count > 0)`

---

### fieldsAdd not compute
**Wrong:** `| compute newField = expression`
**Correct:** `| fieldsAdd newField = expression`

---

### sort must use alias, not aggregation function
**Wrong:** `| summarize cnt = count() | sort count() desc`
**Correct:** `| summarize cnt = count() | sort cnt desc`
**Why:** After summarize, the field is named by its alias. `count()` doesn't exist as a field name.

---

### round() uses named parameter
**Wrong:** `round(value, 2)`
**Correct:** `round(value, decimals:2)`

---

### Never output raw entity IDs — always resolve to names
**Wrong:** `| summarize cnt = count(), by:{dt.entity.service}` → outputs `SERVICE-B4F9C95D2BCCED72`
**Correct:** Use `entityName()` to resolve IDs inline:
```
| summarize cnt = count(), by:{serviceName = entityName(dt.entity.service)}
```
Or with `fieldsAdd`:
```
| fieldsAdd serviceName = entityName(dt.entity.service)
| fields serviceName, cnt
```
**Why:** Entity IDs like `SERVICE-XXXX` or `HOST-XXXX` are meaningless to users. `entityName()` works for any entity type: `entityName(dt.entity.host)`, `entityName(dt.entity.process_group_instance)`, etc.

---

### Entity fields contain IDs, not names — use entityName() in filters
**Wrong:** `| filter dt.entity.service == "banking-account-service"` → matches nothing (field holds `SERVICE-B4F9C95D2BCCED72`)
**Correct:** Use `entityName()` to filter by human-readable name:
```
| filter entityName(dt.entity.service) == "banking-account-service"
```
Multiple services:
```
| filter entityName(dt.entity.service) == "service-a" OR entityName(dt.entity.service) == "service-b"
```
**Also works for hosts:**
```
| filter entityName(dt.entity.host) == "my-hostname"
```
**Why:** `dt.entity.service`, `dt.entity.host`, etc. always contain entity IDs (e.g. `SERVICE-XXXX`, `HOST-XXXX`), never human-readable names. To filter by name, wrap with `entityName()`. To filter by known ID, use the ID directly: `dt.entity.service == "SERVICE-B4F9C95D2BCCED72"`.

---

### Never guess filter values — discover first
**Wrong:** `fetch spans | filter contains(span.name, "settlement")` — guessing that a business concept appears as a span name
**Correct workflow:**
1. Discover what exists: `fetch spans, from:now()-7d | summarize cnt=count(), by:{span.name} | sort cnt desc | limit 20`
2. Use an actual value from results: `fetch spans | filter span.name == "POST /api/payments"`
**Why:** Bizevents use domain terms (e.g. "settlement"), but spans use HTTP/service names (e.g. "POST /api/v1/process"). Never assume a business term from one data source appears as a field value in another. Always run a discovery query first to find real values, then filter on those.
