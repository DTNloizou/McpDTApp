const STORAGE_KEY = 'mcp_dt_app_config';

export type AgentType = 'claude';
export type AIMode = 'dynatrace-assist' | 'external-mcp';

export interface AgentConfig {
  type: AgentType;
  apiKey: string;
}

export const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
  { value: 'claude', label: 'Claude (Anthropic)' },
];

export const AI_MODE_OPTIONS: { value: AIMode; label: string; emoji: string; description: string }[] = [
  { value: 'dynatrace-assist', label: 'Dynatrace Assist', emoji: '🤖', description: 'Built-in Davis CoPilot — no external servers or API keys needed' },
  { value: 'external-mcp', label: 'External MCP + Claude', emoji: '🔌', description: 'Connect to a remote MCP server with Anthropic Claude' },
];

export interface McpConfig {
  aiMode: AIMode;
  serverUrl: string;
  apiKey: string;
  agent: AgentConfig;
  claudeEnabled: boolean;
  claudeApiKey: string;
}

const DEFAULT_CONFIG: McpConfig = {
  aiMode: 'dynatrace-assist',
  serverUrl: '',
  apiKey: '',
  agent: { type: 'claude', apiKey: '' },
  claudeEnabled: false,
  claudeApiKey: '',
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
      const cfg = { ...DEFAULT_CONFIG, ...parsed, agent: { ...DEFAULT_CONFIG.agent, ...parsed.agent }, aiMode: parsed.aiMode || DEFAULT_CONFIG.aiMode, claudeEnabled: parsed.claudeEnabled ?? DEFAULT_CONFIG.claudeEnabled, claudeApiKey: parsed.claudeApiKey ?? DEFAULT_CONFIG.claudeApiKey };
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
