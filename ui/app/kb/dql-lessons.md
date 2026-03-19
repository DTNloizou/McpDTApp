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

### Group-by uses curly braces
**Wrong:** `summarize count() by fieldName`
**Correct:** `summarize count(), by:{fieldName}`

---

### round() uses named parameter
**Wrong:** `round(value, 2)`
**Correct:** `round(value, decimals:2)`
