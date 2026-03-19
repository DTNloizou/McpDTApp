# Dynatrace UI Design Reference

Captured from AppShell template and Distributed Tracing UI (March 2026).

---

## Colour Palette

### Backgrounds
| Context | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Page background | `#f4f4f7` | `#1b1c2e` |
| Content cards / panels | `#ffffff` | `#2c2d3f` (inferred) |

### Text
| Context | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Primary text | `#2c2d4d` | `#f0f0f5` |
| Secondary / muted | `#6b6b80` (approx) | `#a0a0b0` (approx) |

### Status Colours (from screenshot)
| Status | Colour | Usage |
|--------|--------|-------|
| Ok / Success | Green `#00a86b` (approx) | Status badges, success indicators |
| Error / Failure | Red `#e32017` (approx) | Error badges, failed spans |
| Warning | Orange `#ff9500` (approx) | Warning states |
| Info / Primary | Blue `#0098d4` (approx) | Links, selected filters, active tabs |
| Neutral / Muted | Grey `#a0a5a9` | Inactive elements, secondary info |

---

## Theme Support

- Dynatrace supports **light** and **dark** themes
- Theme is stored in `localStorage` as `currentTheme`
- Falls back to `prefers-color-scheme` media query
- CSS class `theme_light` or `theme_dark` applied to `<html>`
- Apps must respect theme via Strato Design System tokens (automatic if using Strato components)

---

## Page Layout Structure

From the screenshot, every Dynatrace page follows this layout:

```
┌──────────────────────────────────────────────────────────────┐
│  Left Dock (sidebar)  │  Main Content Area                   │
│                       │                                      │
│  ┌─────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Dynatrace logo  │  │  │ Top bar: Filter chips / pills  │  │
│  │ Search (Ctrl+K) │  │  ├────────────────────────────────┤  │
│  │ Assist (Ctrl+I) │  │  │ Title + Tab navigation         │  │
│  │ Apps            │  │  ├────────────────────────────────┤  │
│  │ ─────────────── │  │  │ Chart / Visualization area     │  │
│  │ Dashboards      │  │  │ (timeseries, histogram, etc.)  │  │
│  │ Problems        │  │  ├────────────────────────────────┤  │
│  │ Notebooks       │  │  │ Data table with sortable cols  │  │
│  │ Vulnerabilities │  │  │ + search + column toggles      │  │
│  │ Exp. Vitals     │  │  │                                │  │
│  │ Services        │  │  └────────────────────────────────┘  │
│  │ Kubernetes      │  │                                      │
│  │ Clouds          │  │  Optional: Left facet/filter panel   │
│  │ Infra & Ops     │  │  sits between dock and main content  │
│  │ Logs            │  │                                      │
│  │ Dist. Tracing   │  │                                      │
│  │ ─────────────── │  │                                      │
│  │ Collapse        │  │                                      │
│  │ Support         │  │                                      │
│  │ App Insights    │  │                                      │
│  └─────────────────┘  │                                      │
└──────────────────────────────────────────────────────────────┘
```

### Key Zones
1. **Left Dock** — Icon + label navigation, collapsible, persists across all apps
2. **Filter Panel** (optional) — Faceted filters (checkboxes, search suggestions, min/max inputs)
3. **Top Bar** — Filter chips/pills showing active filters, time range selector, refresh button
4. **Content Header** — Page title + tab navigation (e.g., Spans | Timeseries | Histogram)
5. **Visualization Area** — Charts (timeseries, histogram, etc.) with legend
6. **Data Table** — Sortable columns, search bar, column visibility toggle, row actions

---

## Component Patterns (from screenshot)

### Filter Chips / Pills (Top Bar)
- Rounded pill-shaped badges showing active filters
- Format: `"Field" = VALUE AND Field = VALUE`
- Include a clear (×) button
- Placed in a horizontal scrollable toolbar

### Faceted Filter Panel (Left Side)
- Collapsible sections with headers: **Duration**, **Service**, **Endpoint**, **Request status**, **Span status**, **Span kind**
- Each section has a kebab menu (⋮) for options
- Filter types:
  - **Text search**: "Search suggestions" input
  - **Checkboxes**: with labels and status icons (✅ for selected, green ✓ for Ok, red ✕ for Error)
  - **Range inputs**: Min / Max fields (e.g., Duration: `0ns` to `1000s`)

### Tab Navigation
- Horizontal tabs directly under the page title
- Icon + label per tab: `📊 Spans`, `📈 Timeseries`, `📉 Histogram`
- Active tab has underline/accent indicator

### Data Table
- **Column headers**: Sortable (click to sort, arrow indicator ↓↑)
- **Columns visible**: Start time, Span name, Service, Duration, Span status, Span kind, Process group, Kubernetes worker, Kubernetes namespace
- **Hidden columns indicator**: `"197 columns hidden"` with toggle button
- **Row count badge**: `"2 spans"` shown near search
- **View toggles**: List view, compact view, detail view icons
- **Group by**: Dropdown for grouping rows
- **Search spans**: Text input to filter table rows
- **Status badges**: Inline coloured pills (`Ok` in green)
- **Span kind labels**: Plain text (`internal`, `server`)
- **Timestamps**: Format `18 Mar, 16:48:20.177` (day Mon, HH:MM:SS.ms)
- **Duration**: Displayed as `403.68 µs` (with appropriate unit: ns, µs, ms, s)
- **Row actions**: Kebab menu (⋮) per row

### Timeseries Chart
- Y-axis: metric value (e.g., span count)
- X-axis: time (HH:MM format)
- Secondary Y-axis (right): duration scale (e.g., µs)
- Legend items:
  - `Failed spans` (with distinct marker)
  - `Successful spans` (different colour)
  - `Average` (line)
  - `50th percentile` (line)
  - `90th percentile` (line)
- Clean grid lines, minimal style, no heavy borders

### Settings / Info Icons
- ℹ️ Info icon and ⚙️ Settings gear icon next to chart header
- Collapse chevron (∨) to collapse chart section

---

## Typography & Spacing

- **Font family**: System / Arial / sans-serif
- **Font size**: 14px base
- **Section headers**: Bold, slightly larger, with collapsible chevron
- **Spacing**: Consistent 8px / 16px / 24px grid
- **Card padding**: ~16px internal padding
- **Gap between sections**: ~16px

---

## Navigation Conventions

### Left Dock Items (from screenshot)
| Icon | Label | Purpose |
|------|-------|---------|
| 🔍 | Search | Global search (Ctrl+K) |
| 🤖 | Assist | AI assistant (Ctrl+I) |
| ⊞ | Apps | App launcher |
| — | Dashboards | Dashboard list |
| — | Problems | Active problems |
| — | Notebooks | DQL notebooks |
| — | Vulnerabilities | Security vulns |
| — | Experience Vitals | User experience |
| — | Services | Service list |
| — | Kubernetes | K8s monitoring |
| — | Clouds | Cloud providers |
| — | Infrastructure & Operations | Infra overview |
| — | Logs | Log viewer |
| — | Distributed Tracing | Traces/spans |
| — | Collapse | Toggle dock |
| — | Support | Help & support |
| — | App Insights | App performance |

---

## Strato Component Mapping

When building our app, map the observed UI patterns to Strato components:

| UI Pattern | Strato Component |
|------------|-----------------|
| Page wrapper | `<Page>`, `<Page.Header>`, `<Page.Main>` |
| App navigation | `<AppHeader>`, `<AppHeader.NavItems>`, `<AppHeader.AppNavLink>` |
| Title bar | `<TitleBar>`, `<TitleBar.Title>` |
| Layout / spacing | `<Flex>`, `<Surface>` |
| Data tables | `<DataTable>`, `convertToColumns()` |
| Charts | Strato chart components (timeseries, histogram) |
| Tabs | Tab components from Strato |
| Filter inputs | Form components (TextInput, Select, Checkbox) |
| Status badges | Badge / indicator components |

---

## AppShell Integration Notes

- App runs inside an `<iframe>` within the AppShell
- AppShell provides: dock, "Open with" dialog, error views, routing sync
- The `<div id="root">` is the React mount point
- Theme class is applied to `<html>` element before React mounts
- RUM agent (Real User Monitoring) is injected via `ruxitagentjs` script
- PWA manifest available at `/platform/pwa/manifest.json`
- SVG logo uses the Dynatrace "D" mark (path-based, 24×24 viewBox)

---

## Design Principles (Observed)

1. **Data density** — Show as much relevant data as possible without clutter
2. **Faceted filtering** — Left panel filters + top bar chips for active filters
3. **Progressive disclosure** — Collapsible sections, hidden columns, expandable rows
4. **Consistent status colours** — Green = ok, Red = error, across all views
5. **Table-first** — Data tables are the primary data display mechanism
6. **Chart + Table** — Visualizations always paired with a detail table below
7. **Time-aware** — Time range selector always visible, timestamps precise to ms
8. **Searchable** — Every list/table has a search input
9. **Sortable columns** — All table columns support sorting
10. **Responsive column management** — Show/hide columns, count of hidden columns displayed
