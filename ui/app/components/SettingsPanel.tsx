import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig, AGENT_OPTIONS, type McpConfig, type AgentType } from '../config';
import { testConnection, listTools, type McpTool } from '../mcp-client';
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
  const [serverUrl, setServerUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude');
  const [agentApiKey, setAgentApiKey] = useState('');
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
      setServerUrl(config.serverUrl);
      setBearerToken(config.apiKey);
      setAgentType(config.agent.type);
      setAgentApiKey(config.agent.apiKey);
      setSaved(false);
      setSyncMessage('');
      loadKBDocuments().then((docs) => setKbDocs(docs));
    }
  }, [open]);

  if (!open) return null;

  const buildConfig = (): McpConfig => ({
    serverUrl: serverUrl.replace(/\/+$/, ''),
    apiKey: bearerToken,
    agent: { type: agentType, apiKey: agentApiKey },
  });

  const handleSave = () => {
    const config = buildConfig();
    saveConfig(config);
    onClose();
    onConfigSaved?.();
  };

  const handleTest = async () => {
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
