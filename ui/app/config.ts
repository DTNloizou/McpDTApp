const STORAGE_KEY = 'mcp_dt_app_config';

export type AgentType = 'claude';

export interface AgentConfig {
  type: AgentType;
  apiKey: string;
}

export const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
  { value: 'claude', label: 'Claude (Anthropic)' },
];

export interface McpConfig {
  serverUrl: string;
  apiKey: string;
  agent: AgentConfig;
}

const DEFAULT_CONFIG: McpConfig = {
  serverUrl: '',
  apiKey: '',
  agent: { type: 'claude', apiKey: '' },
};

// In-memory config store — primary source of truth
// (localStorage may be blocked in cross-origin iframes like Dynatrace AppShell)
let inMemoryConfig: McpConfig | null = null;

export function loadConfig(): McpConfig {
  if (inMemoryConfig) {
    return { ...inMemoryConfig, agent: { ...inMemoryConfig.agent } };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const cfg = { ...DEFAULT_CONFIG, ...parsed, agent: { ...DEFAULT_CONFIG.agent, ...parsed.agent } };
      inMemoryConfig = cfg;
      return { ...cfg, agent: { ...cfg.agent } };
    }
  } catch {
    // localStorage not available (cross-origin iframe) or parse error
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: McpConfig): void {
  inMemoryConfig = { ...config, agent: { ...config.agent } };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage not available — config lives in memory only
  }
}
