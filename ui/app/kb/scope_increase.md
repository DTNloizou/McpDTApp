# Dynatrace Token Scope Increase Requests

> **Purpose:** Track permission/scope gaps encountered during MCP queries so they can be fixed by an admin.
> **Environment:** [TENANT_ID]
> **Last Updated:** [DATE]

---

## How to Fix
1. Go to **Dynatrace > Settings > Access Tokens**
2. Find the Platform Token used by MCP (`DT_PLATFORM_TOKEN` in `.env`)
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
| `bizevents` | ✅ Works | Business events |
| `logs` | ✅ Works | Log ingestion and querying |
| `spans` | ✅ Works | Distributed traces |
| `events` | ✅ Works | Custom events (CUSTOM_INFO, etc.) |
| `metrics` (timeseries) | ✅ Works | Metric queries (FREE) |
| `dt.entity.service` | ✅ Works | Service entities |
| `dt.entity.host` | ✅ Works | Host entities |
| `user.events` | ⚠️ Test if needed | User actions, interactions, errors, JS exceptions (scope: `storage:user.events:read`) |
| `user.sessions` | ⚠️ Test if needed | User sessions Gen 3 (scope: `storage:user.sessions:read` — note: dot-notation, NOT hyphen!) |

---

## 📝 Template for New Issues

When a new permission error is encountered, add an entry using this template:

```markdown
### N. `<table_name>` — <Short Description>
- **Date Discovered:** <date>
- **Error:** `<exact error message>`
- **DQL That Failed:**
  ```dql
  <the query>
  ```
- **Impact:** <what analysis is blocked>
- **Required Scope:** `<scope name>`
- **Status:** 🔴 OPEN
```

Once resolved, move the entry from "Missing Permissions" to "Resolved Permissions" and update the status to ✅ RESOLVED.

---

## 🔍 Common Scope Issues

### Gen3 vs Gen2 Scope Names
**IMPORTANT:** Gen3 Grail uses **dot-notation**, NOT hyphens:
- ✅ Correct: `storage:user.sessions:read`
- ❌ Wrong: `storage:user-sessions:read`

### Scope Discovery
If you encounter a permission error:
1. **Copy the exact error message** (usually includes table name)
2. **Check Dynatrace Semantic Dictionary** for the data object: https://docs.dynatrace.com/docs/shortlink/semantic-dictionary
3. **Infer the scope pattern**: `storage:<table_name>:read`
4. **Add the scope** to your Platform Token
5. **Document it here** for future reference

### Common Table-to-Scope Mappings
| Table | Required Scope |
|-------|----------------|
| `bizevents` | `storage:bizevents:read` |
| `logs` | `storage:logs:read` |
| `spans` | `storage:spans:read` |
| `events` | `storage:events:read` |
| `metrics` | `storage:metrics:read` |
| `entities` | `storage:entities:read` |
| `user.events` | `storage:user.events:read` |
| `user.sessions` | `storage:user.sessions:read` |
| `dt.security.vulnerabilities` | `storage:security.vulnerabilities:read` |
| `dt.davis.problems` | `storage:problems:read` |
