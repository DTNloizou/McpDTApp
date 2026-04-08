const STORAGE_KEY = 'mcp_dt_app_config';

export type AgentType = 'claude' | 'davis-copilot';
export type AIMode = 'dynatrace-assist' | 'external-mcp';
export type LLMProvider = 'github-models' | 'anthropic';

export interface AgentConfig {
  type: AgentType;
  apiKey: string;
}

export const AGENT_OPTIONS: { value: AgentType; label: string; emoji: string; description: string }[] = [
  { value: 'claude', label: 'Claude (Anthropic)', emoji: '🧠', description: 'Direct Anthropic API — Claude Sonnet, Opus, Haiku' },
  { value: 'davis-copilot', label: 'Davis CoPilot', emoji: '🤖', description: 'Built-in Dynatrace AI — no external API keys needed' },
];

export const AI_MODE_OPTIONS: { value: AIMode; label: string; emoji: string; description: string }[] = [
  { value: 'dynatrace-assist', label: 'Dynatrace Assist', emoji: '🤖', description: 'Built-in Davis CoPilot — no external servers or API keys needed' },
  { value: 'external-mcp', label: 'External MCP', emoji: '🔌', description: 'Connect to a remote MCP server for tool-calling and queries' },
];

export const LLM_PROVIDER_OPTIONS: { value: LLMProvider; label: string; emoji: string; description: string }[] = [
  { value: 'github-models', label: 'GitHub Models', emoji: '🐙', description: 'Use your GitHub account — GPT-4o, DeepSeek, Grok & more (no Claude)' },
  { value: 'anthropic', label: 'Anthropic (Claude)', emoji: '🧠', description: 'Direct Anthropic API key — Claude Sonnet, Opus, Haiku' },
];

export interface GitHubModelOption {
  id: string;
  label: string;
  provider: string;
  maxInput: number;  // free-tier input token limit (Enterprise may be higher for some)
  tier: 'low' | 'high' | 'reasoning' | 'embedding'; // rate limit tier
}

export const GITHUB_MODEL_OPTIONS: GitHubModelOption[] = [
  // Low tier: 8K in (Enterprise: 8K in, 8K out), 450 req/day Enterprise
  { id: 'openai/gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', maxInput: 8000, tier: 'low' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI', maxInput: 8000, tier: 'low' },
  { id: 'openai/gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'OpenAI', maxInput: 8000, tier: 'low' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxInput: 8000, tier: 'low' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', maxInput: 8000, tier: 'low' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct-fp8', label: 'Llama 4 Maverick', provider: 'Meta', maxInput: 8000, tier: 'low' },
  { id: 'meta/meta-llama-3.1-405b-instruct', label: 'Llama 3.1 405B', provider: 'Meta', maxInput: 8000, tier: 'low' },
  { id: 'mistral-ai/mistral-medium-2505', label: 'Mistral Medium 3', provider: 'Mistral', maxInput: 8000, tier: 'low' },
  { id: 'cohere/cohere-command-a', label: 'Command A', provider: 'Cohere', maxInput: 8000, tier: 'low' },
  // Reasoning tier: 4K in, 4K-8K out, 10-12 req/day Enterprise
  { id: 'openai/gpt-5', label: 'GPT-5 ⚠️ 4K limit', provider: 'OpenAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini ⚠️ 4K limit', provider: 'OpenAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'openai/o4-mini', label: 'o4-mini ⚠️ 4K limit', provider: 'OpenAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'openai/o3-mini', label: 'o3-mini ⚠️ 4K limit', provider: 'OpenAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'openai/o3', label: 'o3 ⚠️ 4K limit', provider: 'OpenAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 0528 ⚠️ 4K limit', provider: 'DeepSeek', maxInput: 4000, tier: 'reasoning' },
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 ⚠️ 4K limit', provider: 'DeepSeek', maxInput: 4000, tier: 'reasoning' },
  // High tier (Enterprise: 16K in, 8K out, 150 req/day)
  { id: 'deepseek/deepseek-v3-0324', label: 'DeepSeek V3', provider: 'DeepSeek', maxInput: 8000, tier: 'high' },
  // Special limits
  { id: 'xai/grok-3', label: 'Grok 3', provider: 'xAI', maxInput: 4000, tier: 'reasoning' },
  { id: 'xai/grok-3-mini', label: 'Grok 3 Mini', provider: 'xAI', maxInput: 4000, tier: 'reasoning' },
];

/** Get the free-tier input token limit for the currently selected model. */
export function getModelMaxInput(): number {
  const config = loadConfig();
  const model = GITHUB_MODEL_OPTIONS.find((m) => m.id === config.githubModel);
  return model?.maxInput ?? 8000;
}

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
  /** Credential Vault IDs — when set, resolved at runtime instead of raw keys */
  vaultAnthropicId?: string;
  vaultGithubPatId?: string;
  vaultMcpTokenId?: string;
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
  vaultAnthropicId: '',
  vaultGithubPatId: '',
  vaultMcpTokenId: '',
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
      const cfg = { ...DEFAULT_CONFIG, ...parsed, agent: { ...DEFAULT_CONFIG.agent, ...parsed.agent }, aiMode: parsed.aiMode || DEFAULT_CONFIG.aiMode, claudeEnabled: parsed.claudeEnabled ?? DEFAULT_CONFIG.claudeEnabled, claudeApiKey: parsed.claudeApiKey ?? DEFAULT_CONFIG.claudeApiKey, llmProvider: parsed.llmProvider ?? DEFAULT_CONFIG.llmProvider, githubPat: parsed.githubPat ?? DEFAULT_CONFIG.githubPat, githubModel: parsed.githubModel ?? DEFAULT_CONFIG.githubModel, vaultAnthropicId: parsed.vaultAnthropicId ?? DEFAULT_CONFIG.vaultAnthropicId, vaultGithubPatId: parsed.vaultGithubPatId ?? DEFAULT_CONFIG.vaultGithubPatId, vaultMcpTokenId: parsed.vaultMcpTokenId ?? DEFAULT_CONFIG.vaultMcpTokenId };
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
