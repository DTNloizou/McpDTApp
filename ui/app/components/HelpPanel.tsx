import React, { useState } from 'react';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

type Section = 'overview' | 'quickstart' | 'modes' | 'permissions' | 'mcp' | 'kb' | 'faq';

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: 'overview', label: 'Overview', emoji: '📖' },
  { id: 'quickstart', label: 'Quick Start', emoji: '🚀' },
  { id: 'modes', label: 'AI Modes', emoji: '🤖' },
  { id: 'permissions', label: 'Permissions & Tokens', emoji: '🔑' },
  { id: 'mcp', label: 'MCP Server Setup', emoji: '🔌' },
  { id: 'kb', label: 'Knowledge Base', emoji: '📚' },
  { id: 'faq', label: 'FAQ & Troubleshooting', emoji: '❓' },
];

export const HelpPanel = ({ open, onClose, onOpenSettings }: HelpPanelProps) => {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  if (!open) return null;

  const sectionStyle: React.CSSProperties = {
    marginBottom: 20,
    lineHeight: 1.6,
    color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
    fontSize: 13,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 10,
    color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
  };

  const subHeadingStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6,
    marginTop: 14,
    color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
  };

  const codeBlockStyle: React.CSSProperties = {
    background: 'var(--dt-colors-background-container-neutral-subdued, #f5f5f7)',
    border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
    borderRadius: 6,
    padding: '10px 12px',
    fontFamily: 'monospace',
    fontSize: 11.5,
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre',
    marginBottom: 10,
    marginTop: 6,
  };

  const inlineCodeStyle: React.CSSProperties = {
    background: 'var(--dt-colors-background-container-neutral-subdued, #f5f5f7)',
    borderRadius: 3,
    padding: '1px 5px',
    fontFamily: 'monospace',
    fontSize: 11.5,
  };

  const tipStyle: React.CSSProperties = {
    background: '#e8f4fd',
    border: '1px solid #b3d9f2',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 10,
    marginTop: 6,
    fontSize: 12,
  };

  const warningStyle: React.CSSProperties = {
    background: '#fff8e1',
    border: '1px solid #ffe082',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 10,
    marginTop: 6,
    fontSize: 12,
  };

  const stepStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginBottom: 10,
    alignItems: 'flex-start',
  };

  const stepNumStyle: React.CSSProperties = {
    background: '#1496ff',
    color: '#fff',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>📖 What is Dynatrace MCP?</div>
            <p style={{ marginBottom: 10 }}>
              Dynatrace MCP is an AI-powered observability assistant that lets you query your Dynatrace environment
              using natural language. It combines the power of LLMs with Dynatrace's data platform to help you
              explore logs, metrics, traces, business events, RUM data, and more.
            </p>

            <div style={subHeadingStyle}>Key Features</div>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li><strong>Natural Language Queries</strong> — ask questions in plain English and get DQL queries generated automatically</li>
              <li><strong>Pre-built Query Categories</strong> — one-click access to common queries across Financial, Problems, Services, Logs, Infrastructure, RUM and more</li>
              <li><strong>Multiple AI Backends</strong> — use Davis CoPilot (built-in), GitHub Models (free), or Anthropic Claude</li>
              <li><strong>Knowledge Base</strong> — customizable reference documents that improve query generation</li>
              <li><strong>External MCP Support</strong> — connect to remote MCP servers for advanced tool-calling workflows</li>
              <li><strong>Notebook Export</strong> — save results as Dynatrace Notebooks for sharing</li>
              <li><strong>Credential Store</strong> — share API keys across users via Dynatrace's state store</li>
            </ul>

            <div style={subHeadingStyle}>Two Operating Modes</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Mode</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Best For</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Requirements</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
                  <td style={{ padding: '6px 8px' }}>🤖 Dynatrace Assist</td>
                  <td style={{ padding: '6px 8px' }}>Getting started fast, no external keys</td>
                  <td style={{ padding: '6px 8px' }}>None (uses built-in Davis CoPilot)</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px' }}>🔌 External MCP</td>
                  <td style={{ padding: '6px 8px' }}>Advanced tool-calling, custom MCP servers</td>
                  <td style={{ padding: '6px 8px' }}>MCP server URL + bearer token</td>
                </tr>
              </tbody>
            </table>
          </div>
        );

      case 'quickstart':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>🚀 Quick Start Guide</div>

            <div style={subHeadingStyle}>Option A: Dynatrace Assist (Easiest)</div>
            <p style={{ marginBottom: 8 }}>No external setup required. Uses the built-in Davis CoPilot AI.</p>

            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>Open <strong>Settings</strong> (⚙️ icon in the header)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>Select <strong>Dynatrace Assist</strong> as the AI Mode (default)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>Click <strong>Save & Close</strong> — you're ready to query!</div>
            </div>

            <div style={tipStyle}>
              💡 <strong>Tip:</strong> For better query generation, add an LLM provider (GitHub Models is free) under the AI Agent Configuration section in Settings.
            </div>

            <div style={subHeadingStyle}>Option B: External MCP + LLM</div>
            <p style={{ marginBottom: 8 }}>For power users who want tool-calling workflows with an MCP server.</p>

            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>Deploy your MCP server (e.g., Dynatrace MCP server)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>
                Create a <strong>Platform Token</strong> with the required scopes (see <a href="#" onClick={(e) => { e.preventDefault(); setActiveSection('permissions'); }} style={{ color: '#1496ff' }}>Permissions</a>)
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>In Settings, switch to <strong>External MCP</strong> mode</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>4</div>
              <div>Enter the MCP Server URL and Bearer Token</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>5</div>
              <div>Configure an LLM provider (GitHub Models or Anthropic)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>6</div>
              <div>Click <strong>Test Connection</strong> to verify, then <strong>Save & Close</strong></div>
            </div>

            {onOpenSettings && (
              <button
                onClick={() => { onClose(); onOpenSettings(); }}
                style={{
                  marginTop: 10,
                  padding: '8px 16px',
                  background: '#1496ff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                ⚙️ Open Settings
              </button>
            )}
          </div>
        );

      case 'modes':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>🤖 AI Modes Explained</div>

            <div style={subHeadingStyle}>Dynatrace Assist Mode</div>
            <p style={{ marginBottom: 8 }}>
              Uses Davis CoPilot built into the Dynatrace platform. No external API keys or servers needed.
              Davis CoPilot understands Dynatrace data natively and generates DQL queries.
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>✅ Zero configuration</li>
              <li>✅ Uses Dynatrace-native AI</li>
              <li>✅ No data leaves Dynatrace</li>
              <li>⚠️ Limited to Davis CoPilot's capabilities</li>
            </ul>

            <div style={subHeadingStyle}>External MCP Mode</div>
            <p style={{ marginBottom: 8 }}>
              Connects to a remote MCP (Model Context Protocol) server that provides tools for querying
              Dynatrace. The AI agent calls these tools to fetch data, run DQL, and perform analysis.
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>✅ Full tool-calling support</li>
              <li>✅ Choice of LLM (GPT-4, Claude, DeepSeek, etc.)</li>
              <li>✅ Custom MCP tools and workflows</li>
              <li>⚠️ Requires MCP server + platform token</li>
            </ul>

            <div style={subHeadingStyle}>LLM Provider Options</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Provider</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Cost</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Key Models</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)' }}>
                  <td style={{ padding: '6px 8px' }}>🐙 GitHub Models</td>
                  <td style={{ padding: '6px 8px' }}>Free (rate-limited)</td>
                  <td style={{ padding: '6px 8px' }}>GPT-4.1, GPT-5, Llama 4, DeepSeek, Grok 3</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px' }}>🧠 Anthropic</td>
                  <td style={{ padding: '6px 8px' }}>Pay-per-token</td>
                  <td style={{ padding: '6px 8px' }}>Claude Sonnet 4, Opus 4, Haiku</td>
                </tr>
              </tbody>
            </table>

            <div style={tipStyle}>
              💡 <strong>Recommendation:</strong> Start with <strong>Dynatrace Assist</strong> mode. If you need more powerful AI or tool-calling, add <strong>GitHub Models</strong> (free) as your LLM provider.
            </div>
          </div>
        );

      case 'permissions':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>🔑 Permissions & Token Setup</div>

            <div style={subHeadingStyle}>App Scopes (Automatic)</div>
            <p style={{ marginBottom: 8 }}>
              The deployed app has these scopes automatically. Users don't need to configure them:
            </p>
            <div style={codeBlockStyle}>{`storage:logs:read
storage:buckets:read
storage:metrics:read
storage:entities:read
storage:spans:read
storage:events:read
storage:bizevents:read
storage:user.sessions:read
storage:user.events:read
state:app-states:read / write / delete
davis-copilot:conversations:execute
document:documents:write`}</div>

            <div style={subHeadingStyle}>Creating a Platform Token (for MCP Mode)</div>
            <p style={{ marginBottom: 8 }}>
              If using External MCP mode, you need a Platform Token. This is also used by the MCP server to query Dynatrace.
            </p>

            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>In Dynatrace, go to <strong>Manage → Access tokens</strong></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>Click <strong>Generate new token</strong></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>Give it a name (e.g., "MCP App Token")</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>4</div>
              <div>Add the required scopes (see below)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>5</div>
              <div>Click <strong>Generate token</strong> and copy it immediately</div>
            </div>

            <div style={warningStyle}>
              ⚠️ <strong>Important:</strong> Token values are shown only once. Copy and save it securely.
            </div>

            <div style={subHeadingStyle}>Recommended Token Scopes</div>
            <div style={codeBlockStyle}>{`storage:logs:read
storage:buckets:read
storage:metrics:read
storage:entities:read
storage:spans:read
storage:events:read
storage:bizevents:read
storage:user.sessions:read
storage:user.events:read`}</div>

            <div style={subHeadingStyle}>IAM Setup for Other Users</div>
            <p style={{ marginBottom: 8 }}>
              Other users need permission to create tokens. An admin must:
            </p>
            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>Go to <strong>Account Management → IAM → Policies</strong></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>Create a policy with: <span style={inlineCodeStyle}>ALLOW platform-token:tokens:write;</span></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>Also include scopes the tokens need to carry (e.g., <span style={inlineCodeStyle}>ALLOW storage:logs:read;</span>)</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>4</div>
              <div>Bind the policy to a group, add users to the group</div>
            </div>

            <div style={subHeadingStyle}>Using the Credential Store</div>
            <p style={{ marginBottom: 8 }}>
              Admins can save API keys to the Dynatrace Credential Store in Settings (bottom section).
              Other users can then click <strong>"Load from Dynatrace"</strong> to auto-fill credentials without manual entry.
            </p>
          </div>
        );

      case 'mcp':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>🔌 MCP Server Setup</div>

            <div style={subHeadingStyle}>What is MCP?</div>
            <p style={{ marginBottom: 10 }}>
              MCP (Model Context Protocol) is a standard for connecting AI models to external tools and data sources.
              The Dynatrace MCP server provides tools like <span style={inlineCodeStyle}>execute-dql-query</span>,{' '}
              <span style={inlineCodeStyle}>list-entities</span>, and <span style={inlineCodeStyle}>get-problems</span> that
              allow AI agents to query your Dynatrace environment.
            </p>

            <div style={subHeadingStyle}>Setting Up the Dynatrace MCP Server</div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>
                Install the official Dynatrace MCP server:
                <div style={codeBlockStyle}>npm install -g @dynatrace/mcp-server</div>
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>
                Start the server with your environment details:
                <div style={codeBlockStyle}>{`DT_ENV_URL=https://your-env.dynatrace.com \\
DT_API_TOKEN=dt0c01.xxxxx \\
npx @dynatrace/mcp-server`}</div>
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>
                Note the server URL (default: <span style={inlineCodeStyle}>http://localhost:3000</span>)
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>4</div>
              <div>
                In the app Settings, switch to <strong>External MCP</strong> mode and enter:
                <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                  <li><strong>Server URL</strong> — the MCP server URL</li>
                  <li><strong>Bearer Token</strong> — your Dynatrace Platform Token</li>
                </ul>
              </div>
            </div>

            <div style={subHeadingStyle}>API Key Setup by Provider</div>

            <div style={{ ...subHeadingStyle, fontSize: 12, marginTop: 10 }}>🐙 GitHub Models (Free)</div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#1496ff' }}>github.com/settings/tokens</a></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>Generate a <strong>Personal Access Token (classic)</strong> — no specific scopes required for GitHub Models</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>Paste it in Settings → AI Agent Configuration → GitHub PAT</div>
            </div>

            <div style={{ ...subHeadingStyle, fontSize: 12, marginTop: 10 }}>🧠 Anthropic (Claude)</div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>1</div>
              <div>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#1496ff' }}>console.anthropic.com/settings/keys</a></div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>2</div>
              <div>Create an API key</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNumStyle}>3</div>
              <div>Paste it in Settings → AI Agent Configuration → Anthropic API Key</div>
            </div>
          </div>
        );

      case 'kb':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>📚 Knowledge Base</div>

            <p style={{ marginBottom: 10 }}>
              The Knowledge Base (KB) is a collection of reference documents that help the AI generate accurate DQL queries.
              It contains information about your data schema, entity types, metric keys, and query patterns.
            </p>

            <div style={subHeadingStyle}>Built-in Documents</div>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li><strong>AI Prompt</strong> — system prompt and query instructions</li>
              <li><strong>Data Reference Index</strong> — overview of all Grail data sources</li>
              <li><strong>Entities Reference</strong> — entity types and relationships</li>
              <li><strong>Logs Reference</strong> — log query patterns for Grail</li>
              <li><strong>Metrics Reference</strong> — metric keys and aggregations</li>
              <li><strong>Spans Reference</strong> — distributed tracing query patterns</li>
              <li><strong>BizEvents Reference</strong> — business event schemas</li>
              <li><strong>DQL Lessons</strong> — common mistakes and fixes</li>
              <li><strong>MCP Query Optimization Guide</strong> — best practices for tool-calling</li>
            </ul>

            <div style={subHeadingStyle}>Auto-Populate</div>
            <p style={{ marginBottom: 8 }}>
              Click <strong>"Auto-populate KB"</strong> in Settings to automatically discover your environment's data —
              entity types, metric keys, log attributes, etc. This runs DQL queries against your environment and
              updates the KB documents with real data.
            </p>

            <div style={subHeadingStyle}>Custom Documents</div>
            <p style={{ marginBottom: 8 }}>
              You can add custom KB documents in Settings → Knowledge Base section. Upload markdown files
              describing your custom data schemas, business logic, or query patterns.
            </p>

            <div style={tipStyle}>
              💡 <strong>Tip:</strong> After auto-populating, review the KB documents — replace any remaining placeholders
              with your environment-specific values for best results.
            </div>
          </div>
        );

      case 'faq':
        return (
          <div style={sectionStyle}>
            <div style={headingStyle}>❓ FAQ & Troubleshooting</div>

            <div style={subHeadingStyle}>"mgt.clearMarks is not a function"</div>
            <p style={{ marginBottom: 10 }}>
              This is a known Dynatrace platform issue in sandboxed iframes. The app includes a polyfill that should
              handle this automatically. If you still see it, try refreshing the page.
            </p>

            <div style={subHeadingStyle}>"Insufficient permissions" errors</div>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>If using <strong>Dynatrace Assist</strong>: ensure the app is deployed (not in dev mode)</li>
              <li>If using <strong>External MCP</strong>: check that your Platform Token includes the required scopes</li>
              <li>Ask a tenant admin to set up an IAM policy (see <a href="#" onClick={(e) => { e.preventDefault(); setActiveSection('permissions'); }} style={{ color: '#1496ff' }}>Permissions</a>)</li>
            </ul>

            <div style={subHeadingStyle}>Connection test fails</div>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>Verify the MCP server is running and reachable</li>
              <li>Check the Server URL doesn't have a trailing slash</li>
              <li>Ensure the Bearer Token is correct and not expired</li>
              <li>Check browser console for CORS errors</li>
            </ul>

            <div style={subHeadingStyle}>Queries return no data</div>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>Try expanding the time range (e.g., <span style={inlineCodeStyle}>from:now()-7d</span>)</li>
              <li>Check that the data source exists in your environment</li>
              <li>Use the pre-built category queries as a starting point</li>
              <li>Auto-populate the KB to ensure reference docs match your environment</li>
            </ul>

            <div style={subHeadingStyle}>GitHub Models rate limits</div>
            <p style={{ marginBottom: 10 }}>
              Free-tier GitHub Models have daily request limits. If you hit rate limits:
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>Switch to a lower-tier model (GPT-4.1 Mini or Nano)</li>
              <li>Wait until the daily limit resets</li>
              <li>Consider switching to Anthropic for higher limits</li>
            </ul>

            <div style={subHeadingStyle}>How do I share credentials with my team?</div>
            <p style={{ marginBottom: 10 }}>
              Use the <strong>Credential Store</strong> at the bottom of Settings. Save your API keys once,
              and other users can click "Load from Dynatrace" to auto-fill their settings.
            </p>

            <div style={subHeadingStyle}>Can I use this in dev mode?</div>
            <p style={{ marginBottom: 10 }}>
              Yes! Run <span style={inlineCodeStyle}>npx dt-app dev</span> from the project root.
              Note that dev mode uses your personal token, so other users won't be able to test it.
              Deploy with <span style={inlineCodeStyle}>npx dt-app deploy</span> for shared access.
            </p>
          </div>
        );

      default:
        return null;
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
          width: 520,
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
            📘 Help & Documentation
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 14,
                border: activeSection === s.id
                  ? '1.5px solid #1496ff'
                  : '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
                background: activeSection === s.id
                  ? '#e8f4fd'
                  : 'var(--dt-colors-background-container-neutral-subdued, #f5f5f7)',
                color: activeSection === s.id ? '#1496ff' : 'var(--dt-colors-text-primary-default, #2c2d4d)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: activeSection === s.id ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {renderContent()}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#888' }}>Dynatrace MCP v1.3.0</span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'var(--dt-colors-background-container-neutral-subdued, #f5f5f7)',
              border: '1px solid var(--dt-colors-border-neutral-default, #e0e0e0)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};
