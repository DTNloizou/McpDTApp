# Dynatrace App Development Reference

## Architecture

A Dynatrace App runs on **AppEngine** and has two layers:

| Layer | Tech | Location |
|-------|------|----------|
| Frontend (UI) | React + TypeScript | `ui/` |
| Backend (App Functions) | TypeScript (serverless) | `api/` |

The app runs inside an **iframe** managed by the **AppShell**, which handles platform communication, routing, security, and error boundaries.

## App Structure (v1.x)

```
my-app/
├── ui/                        # Frontend React SPA
│   ├── app/
│   │   ├── App.tsx            # Main component with routing
│   │   └── pages/             # Page components
│   ├── main.tsx               # Entry point
│   └── tsconfig.json          # TypeScript config for UI
├── api/                       # Backend serverless functions
│   └── *.function.ts          # Each file = API endpoint at /api/<name>
├── documents/                 # Optional documents
├── app.config.json            # App manifest (id, name, scopes, environmentUrl)
├── package.json
└── tsconfig.json              # Root TypeScript config (optional)
```

## app.config.json (Manifest)

Defines app identity, permissions, and target environment:

```json
{
  "environmentUrl": "https://<tenant>.apps.dynatrace.com/",
  "app": {
    "name": "My App",
    "version": "0.0.0",
    "description": "App description",
    "id": "my.app.id",
    "scopes": [
      { "name": "storage:logs:read", "comment": "Read logs from Grail" },
      { "name": "storage:buckets:read", "comment": "Read Grail buckets" },
      { "name": "storage:metrics:read", "comment": "Read metrics" },
      { "name": "storage:entities:read", "comment": "Read entities" }
    ]
  }
}
```

## App Toolkit CLI

The `dt-app` CLI manages the full lifecycle:

| Command | Purpose |
|---------|---------|
| `npx dt-app@latest create` | Scaffold a new app from a template |
| `npx dt-app dev` | Start local dev server (proxies API calls to tenant) |
| `npx dt-app build` | Production build |
| `npx dt-app deploy` | Build and deploy to Dynatrace tenant |
| `npx dt-app function create <name>` | Create an app function in `api/` |
| `npx dt-app action create` | Create a custom workflow action |
| `npx dt-app update` | Update SDK packages and toolkit |
| `npx dt-app analyze` | Check config, security, bundle stats |
| `npx dt-app uninstall` | Uninstall app from environment |

## Key SDKs & Packages

| Package | Purpose |
|---------|---------|
| `@dynatrace/strato-components` | Strato Design System (stable components) |
| `@dynatrace/strato-components-preview` | Strato preview components (DataTable, AppHeader, TitleBar) |
| `@dynatrace-sdk/react-hooks` | React hooks: `useDql`, `useAppFunction` |
| `@dynatrace-sdk/client-query` | DQL query client for Grail |
| `@dynatrace-sdk/client-document` | Document service client |
| `@dynatrace-sdk/client-state` | Key-value state storage |
| `@dynatrace-sdk/client-app-settings-v2` | App settings management |
| `@dynatrace-sdk/client-classic-environment-v2` | Classic Environment API v2 |
| `@dynatrace-sdk/client-automation` | Workflows and automation |
| `@dynatrace-sdk/navigation` | Navigation and intents between apps |
| `@dynatrace-sdk/units` | Unit conversion and formatting |
| `@dynatrace-sdk/app-environment` | App/environment info |
| `@dynatrace-sdk/adhoc-utils` | Call app functions from Notebooks/Workflows |

## App Functions (Backend)

- Every `.function.ts` file in `api/` is auto-deployed as a serverless endpoint
- Exposed at `/api/<filename>` (without the `.function.ts` suffix)
- Runs in the **Dynatrace JavaScript Runtime** (not Node.js — limited Web APIs)
- Supported file imports: `.js`, `.ts`, `.json`, `.txt` only
- No file system access

```typescript
// api/hello-world.function.ts
export default async function (payload: unknown) {
  return 'Hello World';
}
```

Consume from UI:
```typescript
import { useAppFunction } from '@dynatrace-sdk/react-hooks';

const response = useAppFunction<string>({
  name: 'hello-world',
  responseType: 'text',
});
```

## Querying Data with DQL

Use `useDql` hook from `@dynatrace-sdk/react-hooks`:

```typescript
import { useDql } from '@dynatrace-sdk/react-hooks';

const result = useDql({
  query: `fetch dt.entity.host | fields entity.name, host.cpuUsage`,
});
```

Required scopes in `app.config.json`:
- `storage:logs:read` — logs
- `storage:metrics:read` — metrics
- `storage:entities:read` — entities
- `storage:buckets:read` — Grail buckets
- `storage:spans:read` — traces/spans

## UI Patterns

### App with routing
```typescript
import { Page, AppHeader } from '@dynatrace/strato-components-preview/layouts';
import { Route, Routes, Link } from 'react-router-dom';

export const App = () => (
  <Page>
    <Page.Header>
      <AppHeader>
        <AppHeader.NavItems>
          <AppHeader.AppNavLink as={Link} to="/" />
        </AppHeader.NavItems>
      </AppHeader>
    </Page.Header>
    <Page.Main>
      <Routes>
        <Route path="/" element={<MyPage />} />
      </Routes>
    </Page.Main>
  </Page>
);
```

### Data table
```typescript
import { DataTable, convertToColumns } from '@dynatrace/strato-components-preview/tables';

{result.data && (
  <DataTable
    data={result.data.records}
    columns={convertToColumns(result.data.types)}
    fullWidth
  />
)}
```

## Development Workflow

1. **Create**: `npx dt-app@latest create --environment-url https://<tenant>.apps.dynatrace.com`
2. **Develop**: `npx dt-app dev` (hot reload, proxied to real tenant data)
3. **Deploy**: `npx dt-app deploy`

### Local Dev Ports
- `3000-3005` — dev server
- `30000` — app function execution
- `5343` — SSO authentication

### Prerequisites
- Node.js 24
- Access to `https://dt-cdn.net/` and `https://registry.npmjs.org/`
- Access to target Dynatrace environment

## Platform Services Available

- **Grail** — unified data lakehouse (logs, metrics, spans, entities, events, bizevents)
- **DQL** — Dynatrace Query Language for querying Grail
- **Documents** — create/manage documents and shares
- **State** — key-value storage per app
- **App Settings** — structured settings management
- **Automation** — workflows and triggers
- **Intents** — cross-app communication and navigation
- **EdgeConnect** — proxy to on-prem systems
- **Davis AI** — predictive and causal analysis
- **Hub** — catalog of apps, extensions, technologies

## Useful Links

- Developer portal: https://developer.dynatrace.com/
- Strato Design System: https://developer.dynatrace.com/design/about-strato-design-system/
- SDK reference: https://developer.dynatrace.com/develop/sdks/
- App functions guide: https://developer.dynatrace.com/develop/guides/app-functions/
- Platform services: https://developer.dynatrace.com/develop/platform-services/
- Tutorial: https://developer.dynatrace.com/quickstart/tutorial/
