import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig, AGENT_OPTIONS, AI_MODE_OPTIONS, LLM_PROVIDER_OPTIONS, GITHUB_MODEL_OPTIONS, type McpConfig, type AgentType, type AIMode, type LLMProvider } from '../config';
import { testConnection, testDavisConnection, listTools, type McpTool } from '../mcp-client';

import { testVaultCredential, resolveVaultCredentials, clearVaultCache } from '../credential-vault';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const SettingsPanel = ({ open, onClose, onConfigSaved }: SettingsPanelProps) => {
  const [aiMode, setAiMode] = useState<AIMode>('dynatrace-assist');
  const [serverUrl, setServerUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude');
  const [agentApiKey, setAgentApiKey] = useState('');
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('github-models');
  const [githubPat, setGithubPat] = useState('');
  const [githubModel, setGithubModel] = useState('claude-sonnet-4-20250514');
  const [status, setStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [saved, setSaved] = useState(false);

  const [vaultAnthropicId, setVaultAnthropicId] = useState('');
  const [vaultGithubPatId, setVaultGithubPatId] = useState('');
  const [vaultMcpTokenId, setVaultMcpTokenId] = useState('');
  const [vaultStatus, setVaultStatus] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [vaultResolving, setVaultResolving] = useState(false);

  useEffect(() => {
    if (open) {
      const config = loadConfig();
      setAiMode(config.aiMode);
      setServerUrl(config.serverUrl);
      setBearerToken(config.apiKey);
      setAgentType(config.agent.type);
      setAgentApiKey(config.agent.apiKey);
      setClaudeEnabled(config.claudeEnabled);
      setClaudeApiKey(config.claudeApiKey);
      setLlmProvider(config.llmProvider);
      setGithubPat(config.githubPat);
      setGithubModel(config.githubModel);
      setSaved(false);
      setStatus('idle');
      setStatusMessage('');

      setVaultAnthropicId(config.vaultAnthropicId || '');
      setVaultGithubPatId(config.vaultGithubPatId || '');
      setVaultMcpTokenId(config.vaultMcpTokenId || '');
      setVaultStatus({});
    }
  }, [open]);

  if (!open) return null;

  const buildConfig = (): McpConfig => ({
    aiMode,
    serverUrl: serverUrl.replace(/\/+$/, ''),
    apiKey: bearerToken,
    agent: { type: agentType, apiKey: agentApiKey },
    claudeEnabled,
    claudeApiKey,
    llmProvider,
    githubPat,
    githubModel,
    vaultAnthropicId: vaultAnthropicId.trim() || undefined,
    vaultGithubPatId: vaultGithubPatId.trim() || undefined,
    vaultMcpTokenId: vaultMcpTokenId.trim() || undefined,
  });

  const handleSave = async () => {
    const config = buildConfig();

    // If vault IDs are configured, resolve them to actual secrets before saving
    if (config.vaultAnthropicId || config.vaultGithubPatId || config.vaultMcpTokenId) {
      try {
        clearVaultCache();
        const resolved = await resolveVaultCredentials({
          anthropicApiKey: config.vaultAnthropicId,
          githubPat: config.vaultGithubPatId,
          mcpBearerToken: config.vaultMcpTokenId,
        });
        if (resolved.anthropicApiKey) {
          config.claudeApiKey = resolved.anthropicApiKey;
          config.claudeEnabled = true;
          config.agent.apiKey = resolved.anthropicApiKey;
        }
        if (resolved.githubPat) {
          config.githubPat = resolved.githubPat;
        }
        if (resolved.mcpBearerToken) {
          config.apiKey = resolved.mcpBearerToken;
        }
      } catch {
        // Continue with whatever raw values are already set
      }
    }

    saveConfig(config);
    onClose();
    onConfigSaved?.();
  };

  const handleTest = async () => {
    if (aiMode === 'dynatrace-assist') {
      setStatus('testing');
      setStatusMessage('Testing Davis CoPilot connection...');
      setTools([]);
      try {
        const result = await testDavisConnection();
        if (result.status === 'success') {
          setStatus('connected');
          setStatusMessage(`Connected to ${result.environment || 'Dynatrace Assist'}`);
        } else {
          setStatus('error');
          setStatusMessage(`Failed: ${result.message}`);
        }
      } catch (err: unknown) {
        setStatus('error');
        setStatusMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      return;
    }

    if (!serverUrl.trim()) {
      setStatus('error');
      setStatusMessage('Please enter a Server URL first');
      return;
    }
    setStatus('testing');
    setStatusMessage('Testing connection...');
    setTools([]);

    const conn = { serverUrl: serverUrl.replace(/\/+$/, ''), apiKey: bearerToken };
    // If a vault ID is configured for MCP bearer, resolve it first
    if (vaultMcpTokenId.trim()) {
      try {
        clearVaultCache();
        const resolved = await resolveVaultCredentials({ mcpBearerToken: vaultMcpTokenId.trim() });
        if (resolved.mcpBearerToken) {
          conn.apiKey = resolved.mcpBearerToken;
          setVaultStatus((prev) => ({ ...prev, mcp: { ok: true, message: 'Resolved' } }));
        }
      } catch {
        setStatus('error');
        setStatusMessage('Failed to resolve MCP bearer token from Credential Vault');
        return;
      }
    }
    try {
      const result = await testConnection(conn);
      if (result.status === 'success') {
        setStatus('connected');
        setStatusMessage(
          `Connected to ${result.environment || 'MCP server'}`
        );
        try {
          const toolList = await listTools(conn);
          setTools(toolList);
        } catch {
          // tools may not be available
        }
      } else {
        setStatus('error');
        setStatusMessage(`Failed: ${result.message}`);
      }
    } catch (err: unknown) {
      setStatus('error');
      setStatusMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: '100vw',
          background: 'var(--dt-colors-background-base-default, #fff)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)' }}>
            Settings
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--dt-colors-text-primary-default, #666)',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* AI Provider Mode Selection */}
          <SectionHeader title="AI Provider" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {AI_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setAiMode(opt.value); setStatus('idle'); setStatusMessage(''); setTools([]); }}
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `2px solid ${aiMode === opt.value ? (opt.value === 'dynatrace-assist' ? '#00a86b' : '#1496ff') : 'var(--dt-colors-border-neutral-default, #e0e0e0)'}`,
                  background: aiMode === opt.value
                    ? (opt.value === 'dynatrace-assist' ? 'rgba(0,168,107,0.06)' : 'rgba(20,150,255,0.06)')
                    : 'var(--dt-colors-background-surface-default, #f8f8fb)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>
                  {opt.description}
                </div>
                {aiMode === opt.value && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: opt.value === 'dynatrace-assist' ? '#00a86b' : '#1496ff' }}>
                    ✓ Selected
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Dynatrace Assist mode — minimal config */}
          {aiMode === 'dynatrace-assist' && (
            <>
              <div style={{
                padding: '16px 20px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(0,168,107,0.08) 0%, rgba(0,152,212,0.08) 100%)',
                border: '1px solid rgba(0,168,107,0.25)',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
                  🤖 Ready to use
                </div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                  Dynatrace Assist uses the built-in Davis CoPilot — no external servers or API keys needed.
                  AI features like natural language queries, recommendations, and chat are powered directly by your Dynatrace platform.
                </div>
              </div>

              {/* Connection test */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={handleTest} style={btnSecondaryStyle(false)}>
                  {status === 'testing' ? 'Testing...' : 'Test Davis CoPilot'}
                </button>
              </div>

              {statusMessage && (
                <StatusBanner status={status} message={statusMessage} />
              )}
            </>
          )}

          {/* External MCP mode — full config */}
          {aiMode === 'external-mcp' && (
            <>
              <Divider />

              {/* MCP Server Section */}
              <SectionHeader title="Remote MCP Server" />

          <FieldGroup label="Server URL">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://dtroi.whydevslovedynatrace.com/mcp"
              style={inputStyle}
            />
            <FieldHint>Full base URL of your MCP server (e.g. https://example.com/mcp)</FieldHint>
          </FieldGroup>

          <FieldGroup label="MCP Bearer Token — Vault ID">
            <input
              type="text"
              value={vaultMcpTokenId}
              onChange={(e) => setVaultMcpTokenId(e.target.value)}
              placeholder="CREDENTIALS_VAULT-XXXXXXXXXXXXXXXX"
              style={inputStyle}
            />
            {vaultStatus['mcp'] && (
              <div style={{ fontSize: 11, marginTop: 3, color: vaultStatus['mcp'].ok ? '#00a86b' : '#c62828' }}>
                {vaultStatus['mcp'].ok ? '✓' : '✕'} {vaultStatus['mcp'].message}
              </div>
            )}
            <FieldHint>Credential Vault ID for your MCP bearer token. Create a <em>Token</em> credential with <em>AppEngine</em> scope.</FieldHint>
          </FieldGroup>

          {/* Connection test */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={handleTest} style={btnSecondaryStyle(false)}>
              {status === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {statusMessage && (
            <StatusBanner status={status} message={statusMessage} />
          )}

          {tools.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
                Available Tools ({tools.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tools.map((t) => (
                  <span
                    key={t.name}
                    title={t.description}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'var(--dt-colors-background-surface-default, #f0f0f5)',
                      fontSize: 11,
                      color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
                    }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

            </>
          )}

          <Divider />

          {/* Unified AI Agent section */}
          <SectionHeader title="AI Agent" />
          <FieldHint>
            Choose which AI powers your queries, analysis, and DQL repair. KB documents are included as context automatically.
          </FieldHint>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '12px 0 16px' }}>
            {/* Davis CoPilot */}
            <button
              onClick={() => { setAgentType('davis-copilot'); }}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `2px solid ${agentType === 'davis-copilot' ? '#00a86b' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'}`,
                background: agentType === 'davis-copilot'
                  ? 'rgba(0,168,107,0.06)'
                  : 'var(--dt-colors-background-surface-default, #f8f8fb)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>🤖</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                Davis CoPilot
              </div>
              <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>
                Built-in Dynatrace AI — no API keys needed
              </div>
              {agentType === 'davis-copilot' && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#00a86b' }}>
                  ✓ Selected
                </div>
              )}
            </button>

            {/* Claude (Anthropic) */}
            <button
              onClick={() => { setAgentType('claude'); setLlmProvider('anthropic'); }}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `2px solid ${agentType === 'claude' && llmProvider === 'anthropic' ? '#6950A1' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'}`,
                background: agentType === 'claude' && llmProvider === 'anthropic'
                  ? 'rgba(105,80,161,0.06)'
                  : 'var(--dt-colors-background-surface-default, #f8f8fb)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>🧠</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                Claude
              </div>
              <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>
                Direct Anthropic API — Sonnet, Opus, Haiku
              </div>
              {agentType === 'claude' && llmProvider === 'anthropic' && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#6950A1' }}>
                  ✓ Selected
                </div>
              )}
            </button>

            {/* GitHub Models */}
            <button
              onClick={() => { setAgentType('claude'); setLlmProvider('github-models'); }}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `2px solid ${llmProvider === 'github-models' && agentType === 'claude' ? '#1496ff' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'}`,
                background: llmProvider === 'github-models' && agentType === 'claude'
                  ? 'rgba(20,150,255,0.06)'
                  : 'var(--dt-colors-background-surface-default, #f8f8fb)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>🐙</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 3 }}>
                GitHub Models
              </div>
              <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>
                GPT-4o, DeepSeek, Grok &amp; more via GitHub
              </div>
              {llmProvider === 'github-models' && agentType === 'claude' && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#1496ff' }}>
                  ✓ Selected
                </div>
              )}
            </button>
          </div>

          {/* Davis CoPilot — no config needed */}
          {agentType === 'davis-copilot' && (
            <div style={{
              padding: '16px 20px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(0,168,107,0.08) 0%, rgba(0,152,212,0.08) 100%)',
              border: '1px solid rgba(0,168,107,0.25)',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dt-colors-text-primary-default, #2c2d4d)', marginBottom: 4 }}>
                🤖 No API key required
              </div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                Davis CoPilot runs directly on your Dynatrace platform — no external API keys needed.
              </div>
            </div>
          )}

          {/* Claude (Anthropic) config */}
          {agentType === 'claude' && llmProvider === 'anthropic' && (
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid rgba(105,80,161,0.25)',
              background: 'rgba(105,80,161,0.04)',
              marginBottom: 16,
            }}>
              <FieldGroup label="Anthropic API Key — Vault ID">
                <input
                  type="text"
                  value={vaultAnthropicId}
                  onChange={(e) => setVaultAnthropicId(e.target.value)}
                  placeholder="CREDENTIALS_VAULT-XXXXXXXXXXXXXXXX"
                  style={inputStyle}
                />
                {vaultStatus['anthropic'] && (
                  <div style={{ fontSize: 11, marginTop: 3, color: vaultStatus['anthropic'].ok ? '#00a86b' : '#c62828' }}>
                    {vaultStatus['anthropic'].ok ? '✓' : '✕'} {vaultStatus['anthropic'].message}
                  </div>
                )}
                <FieldHint>Credential Vault ID for your Anthropic API key. Create a <em>Token</em> credential with <em>AppEngine</em> scope.</FieldHint>
              </FieldGroup>
              <button
                onClick={async () => {
                  if (!vaultAnthropicId.trim()) return;
                  setVaultResolving(true);
                  clearVaultCache();
                  const result = await testVaultCredential(vaultAnthropicId.trim());
                  setVaultStatus((prev) => ({ ...prev, anthropic: result }));
                  setVaultResolving(false);
                }}
                disabled={vaultResolving || !vaultAnthropicId.trim()}
                style={{
                  ...btnSecondaryStyle(vaultResolving || !vaultAnthropicId.trim()),
                  fontSize: 12,
                  padding: '7px 12px',
                  background: 'rgba(105,80,161,0.08)',
                  borderColor: '#6950A1',
                  color: (vaultResolving || !vaultAnthropicId.trim()) ? undefined : '#6950A1',
                }}
              >
                {vaultResolving ? '↻ Testing...' : '🔐 Test Vault Credentials'}
              </button>
            </div>
          )}

          {/* GitHub Models config */}
          {agentType === 'claude' && llmProvider === 'github-models' && (
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid rgba(20,150,255,0.25)',
              background: 'rgba(20,150,255,0.04)',
              marginBottom: 16,
            }}>
              <FieldGroup label="GitHub PAT — Vault ID">
                <input
                  type="text"
                  value={vaultGithubPatId}
                  onChange={(e) => setVaultGithubPatId(e.target.value)}
                  placeholder="CREDENTIALS_VAULT-XXXXXXXXXXXXXXXX"
                  style={inputStyle}
                />
                {vaultStatus['github'] && (
                  <div style={{ fontSize: 11, marginTop: 3, color: vaultStatus['github'].ok ? '#00a86b' : '#c62828' }}>
                    {vaultStatus['github'].ok ? '✓' : '✕'} {vaultStatus['github'].message}
                  </div>
                )}
                <FieldHint>Credential Vault ID for your GitHub PAT. Create a <em>Token</em> credential with <em>AppEngine</em> scope.</FieldHint>
              </FieldGroup>
              <button
                onClick={async () => {
                  if (!vaultGithubPatId.trim()) return;
                  setVaultResolving(true);
                  clearVaultCache();
                  const result = await testVaultCredential(vaultGithubPatId.trim());
                  setVaultStatus((prev) => ({ ...prev, github: result }));
                  setVaultResolving(false);
                }}
                disabled={vaultResolving || !vaultGithubPatId.trim()}
                style={{
                  ...btnSecondaryStyle(vaultResolving || !vaultGithubPatId.trim()),
                  fontSize: 12,
                  padding: '7px 12px',
                  background: 'rgba(20,150,255,0.08)',
                  borderColor: '#1496ff',
                  color: (vaultResolving || !vaultGithubPatId.trim()) ? undefined : '#1496ff',
                }}
              >
                {vaultResolving ? '↻ Testing...' : '🔐 Test Vault Credentials'}
              </button>
              {vaultStatus['github']?.ok && (
                <>
                  <div style={{ marginTop: 14 }} />
                  <FieldGroup label="Model">
                    <select
                      value={githubModel}
                      onChange={(e) => setGithubModel(e.target.value)}
                      style={inputStyle}
                    >
                      {GITHUB_MODEL_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.provider})
                        </option>
                      ))}
                    </select>
                    <FieldHint>Choose any model available through GitHub Models / Copilot.</FieldHint>
                  </FieldGroup>
                </>
              )}
            </div>
          )}


        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button onClick={handleSave} style={btnPrimaryStyle}>
            Save & Connect
          </button>
          <button onClick={onClose} style={btnSecondaryStyle(false)}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

/* ---------- Small helper components ---------- */

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 12,
        color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
      }}
    >
      {title}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--dt-colors-text-primary-default, #2c2d4d)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>{children}</div>;
}

function Divider() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)', margin: '20px 0' }} />;
}

function StatusBanner({ status, message }: { status: string; message: string }) {
  const isOk = status === 'connected';
  const isErr = status === 'error';
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        marginBottom: 12,
        fontSize: 13,
        background: isOk ? 'rgba(0,168,107,0.1)' : isErr ? 'rgba(227,32,23,0.1)' : '#f5f5f5',
        color: isOk ? '#00a86b' : isErr ? '#c62828' : '#666',
      }}
    >
      {isOk && '✓ '}{isErr && '✕ '}{message}
    </div>
  );
}

/* ---------- Styles ---------- */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--dt-colors-border-neutral-default, #ccc)',
  fontSize: 13,
  outline: 'none',
  background: 'var(--dt-colors-background-surface-default, #fff)',
  color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
  boxSizing: 'border-box' as const,
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--dt-colors-charts-categorical-default-color-05, #1496ff)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

function btnSecondaryStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    borderRadius: 6,
    border: '1px solid var(--dt-colors-border-neutral-default, #ccc)',
    background: 'transparent',
    color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
