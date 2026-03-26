const STORAGE_KEY = 'mcp_dt_app_config';

export type AgentType = 'claude';
export type AIMode = 'dynatrace-assist' | 'external-mcp';
export type LLMProvider = 'github-models' | 'anthropic';

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

export const LLM_PROVIDER_OPTIONS: { value: LLMProvider; label: string; emoji: string; description: string }[] = [
  { value: 'github-models', label: 'GitHub Models', emoji: '🐙', description: 'Use your GitHub account — GPT-4o, DeepSeek, Grok & more (no Claude)' },
  { value: 'anthropic', label: 'Anthropic (Claude)', emoji: '🧠', description: 'Direct Anthropic API key — Claude Sonnet, Opus, Haiku' },
];

export interface GitHubModelOption {
  id: string;
  label: string;
  provider: string;
}

export const GITHUB_MODEL_OPTIONS: GitHubModelOption[] = [
  { id: 'openai/gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI' },
  { id: 'openai/gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'OpenAI' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'openai/gpt-5', label: 'GPT-5', provider: 'OpenAI' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'openai/o4-mini', label: 'o4-mini', provider: 'OpenAI' },
  { id: 'openai/o3-mini', label: 'o3-mini', provider: 'OpenAI' },
  { id: 'openai/o3', label: 'o3', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 0528', provider: 'DeepSeek' },
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', provider: 'DeepSeek' },
  { id: 'deepseek/deepseek-v3-0324', label: 'DeepSeek V3', provider: 'DeepSeek' },
  { id: 'xai/grok-3', label: 'Grok 3', provider: 'xAI' },
  { id: 'xai/grok-3-mini', label: 'Grok 3 Mini', provider: 'xAI' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct-fp8', label: 'Llama 4 Maverick', provider: 'Meta' },
  { id: 'meta/meta-llama-3.1-405b-instruct', label: 'Llama 3.1 405B', provider: 'Meta' },
  { id: 'mistral-ai/mistral-medium-2505', label: 'Mistral Medium 3', provider: 'Mistral' },
  { id: 'cohere/cohere-command-a', label: 'Command A', provider: 'Cohere' },
];

export interface McpConfig {
  aiMode: AIMode;
  serverUrl: string;
  apiKey: string;
  agent: AgentConfig;
  claudeEnabled: boolean;
  claudeApiKey: string;
  llmProvider: LLMProvider;
  githubPat: string;
  githubModel: string;
}

const DEFAULT_CONFIG: McpConfig = {
  aiMode: 'dynatrace-assist',
  serverUrl: '',
  apiKey: '',
  agent: { type: 'claude', apiKey: '' },
  claudeEnabled: false,
  claudeApiKey: '',
  llmProvider: 'github-models',
  githubPat: '',
  githubModel: 'openai/gpt-4.1',
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
      const cfg = { ...DEFAULT_CONFIG, ...parsed, agent: { ...DEFAULT_CONFIG.agent, ...parsed.agent }, aiMode: parsed.aiMode || DEFAULT_CONFIG.aiMode, claudeEnabled: parsed.claudeEnabled ?? DEFAULT_CONFIG.claudeEnabled, claudeApiKey: parsed.claudeApiKey ?? DEFAULT_CONFIG.claudeApiKey, llmProvider: parsed.llmProvider ?? DEFAULT_CONFIG.llmProvider, githubPat: parsed.githubPat ?? DEFAULT_CONFIG.githubPat, githubModel: parsed.githubModel ?? DEFAULT_CONFIG.githubModel };
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
