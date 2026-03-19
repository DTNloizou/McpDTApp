import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig, AGENT_OPTIONS, AI_MODE_OPTIONS, type McpConfig, type AgentType, type AIMode } from '../config';
import { testConnection, testDavisConnection, listTools, type McpTool } from '../mcp-client';
import {
  getKBDocuments, addKBDocument, removeKBDocument, loadKBDocuments,
  deleteDocFromAnthropic, syncAllDocsToAnthropic, getDocSyncStatus,
  type KBDocument, type FileSyncStatus,
} from '../knowledge-base';

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
  const [status, setStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [saved, setSaved] = useState(false);
  const [kbDocs, setKbDocs] = useState<KBDocument[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

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
      setSaved(false);
      setStatus('idle');
      setStatusMessage('');
      setSyncMessage('');
      loadKBDocuments().then((docs) => setKbDocs(docs));
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
  });

  const handleSave = () => {
    const config = buildConfig();
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

          <FieldGroup label="Bearer Token">
            <input
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder="mcp_..."
              style={inputStyle}
            />
            <FieldHint>API key for authenticated MCP endpoints</FieldHint>
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

          <Divider />

          {/* Query Agent Section */}
          <SectionHeader title="Query Agent" />

          <FieldGroup label="Agent">
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentType)}
              style={inputStyle}
            >
              {AGENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <FieldHint>AI agent that processes your queries via MCP tools</FieldHint>
          </FieldGroup>

          <FieldGroup label={`${AGENT_OPTIONS.find((o) => o.value === agentType)?.label || 'Agent'} API Key`}>
            <input
              type="password"
              value={agentApiKey}
              onChange={(e) => setAgentApiKey(e.target.value)}
              placeholder={agentType === 'claude' ? 'sk-ant-...' : 'API key'}
              style={inputStyle}
            />
            <FieldHint>
              {agentType === 'claude'
                ? 'Your Anthropic API key for Claude'
                : 'API key for the selected agent'}
            </FieldHint>
          </FieldGroup>

          <Divider />

          {/* Knowledge Base Section */}
          <SectionHeader title="Knowledge Base" />
          <FieldHint>
            Upload .md files as reference context. The AI will use these documents when generating recommendations and answering queries.
          </FieldHint>

          <div style={{ marginTop: 10, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px dashed var(--dt-colors-border-neutral-default, #ccc)',
                background: 'var(--dt-colors-background-surface-default, #f8f8fb)',
                fontSize: 13,
                cursor: 'pointer',
                color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
              }}
            >
              📄 Upload .md files
              <input
                type="file"
                accept=".md,.markdown,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files) return;
                  Array.from(files).forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const text = reader.result as string;
                      await addKBDocument(file.name, text);
                      setKbDocs(getKBDocuments());
                    };
                    reader.readAsText(file);
                  });
                  e.target.value = '';
                }}
              />
            </label>
            {kbDocs.length > 0 && agentApiKey.trim() && (
              <button
                onClick={async () => {
                  setSyncing(true);
                  setSyncMessage('Syncing files to Anthropic...');
                  try {
                    const results = await syncAllDocsToAnthropic(agentApiKey);
                    const uploaded = results.filter((r) => r.status === 'uploaded').length;
                    const errors = results.filter((r) => r.status === 'error').length;
                    const already = results.filter((r) => r.status === 'synced').length;
                    const parts: string[] = [];
                    if (uploaded) parts.push(`${uploaded} uploaded`);
                    if (already) parts.push(`${already} already synced`);
                    if (errors) parts.push(`${errors} failed`);
                    setSyncMessage(`✓ ${parts.join(', ')}`);
                    setKbDocs(getKBDocuments());
                  } catch (err: unknown) {
                    setSyncMessage(`✕ ${err instanceof Error ? err.message : 'Sync failed'}`);
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                style={{
                  ...btnSecondaryStyle(syncing),
                  fontSize: 12,
                  padding: '7px 12px',
                }}
                title="Upload documents to Anthropic Files API for efficient referencing"
              >
                {syncing ? '↻ Syncing...' : '☁ Sync to Claude'}
              </button>
            )}
          </div>

          {syncMessage && (
            <div style={{
              fontSize: 12,
              color: syncMessage.startsWith('✓') ? '#00a86b' : syncMessage.startsWith('✕') ? '#c62828' : '#666',
              marginBottom: 8,
            }}>
              {syncMessage}
            </div>
          )}

          {kbDocs.length === 0 && (
            <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 12 }}>
              No documents uploaded yet.
            </div>
          )}

          {kbDocs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {kbDocs.map((doc) => {
                const syncStatus = getDocSyncStatus(doc.name);
                return (
                <div
                  key={doc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
                    background: 'var(--dt-colors-background-surface-default, #f8f8fb)',
                    fontSize: 12,
                  }}
                >
                  <span title={syncStatus === 'synced' ? 'Synced to Anthropic' : syncStatus === 'modified' ? 'Modified since last sync' : 'Not yet synced'}>
                    {syncStatus === 'synced' ? '☁️' : syncStatus === 'modified' ? '🔄' : '📄'}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500, color: 'var(--dt-colors-text-primary-default, #2c2d4d)' }}>{doc.name}</span>
                  <span style={{ color: '#999', fontSize: 11 }}>
                    {(doc.content.length / 1024).toFixed(1)}KB
                  </span>
                  {syncStatus === 'synced' && (
                    <span style={{ color: '#00a86b', fontSize: 10, fontWeight: 600 }}>SYNCED</span>
                  )}
                  {syncStatus === 'modified' && (
                    <span style={{ color: '#b36305', fontSize: 10, fontWeight: 600 }}>MODIFIED</span>
                  )}
                  <button
                    onClick={async () => {
                      // Delete from Anthropic if synced
                      if (doc.fileId && agentApiKey.trim()) {
                        try { await deleteDocFromAnthropic(doc.name, agentApiKey); } catch { /* best-effort */ }
                      }
                      await removeKBDocument(doc.name);
                      setKbDocs(getKBDocuments());
                    }}
                    title="Remove document"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#c62828',
                      fontSize: 14,
                      padding: '0 4px',
                    }}
                  >
                    ✕
                  </button>
                </div>
                );
              })}
            </div>
          )}
            </>
          )}

          <Divider />

          {/* Claude Integration — separate from AI Provider */}
          <SectionHeader title="Claude Integration" />
          <div style={{
            padding: '14px 16px',
            borderRadius: 10,
            border: `2px solid ${claudeEnabled ? '#D97706' : 'var(--dt-colors-border-neutral-default, #e0e0e0)'}`,
            background: claudeEnabled ? 'rgba(217,119,6,0.06)' : 'var(--dt-colors-background-surface-default, #f8f8fb)',
            marginBottom: 16,
            transition: 'all 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: claudeEnabled ? 12 : 0 }}>
              <button
                onClick={() => setClaudeEnabled(!claudeEnabled)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: 'none',
                  background: claudeEnabled ? '#D97706' : '#ccc',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: claudeEnabled ? 20 : 2,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dt-colors-text-primary-default, #2c2d4d)' }}>
                  🧠 Enable Claude
                </div>
                <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>
                  Adds "Ask Claude" option — uses Davis context + Claude for deeper analysis
                </div>
              </div>
            </div>

            {claudeEnabled && (
              <FieldGroup label="Anthropic API Key">
                <input
                  type="password"
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={inputStyle}
                />
                <FieldHint>Your Anthropic API key. Davis gathers context first, then Claude provides deeper analysis.</FieldHint>
              </FieldGroup>
            )}
          </div>
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
