import React, { useState, useCallback, useRef } from 'react';
import { Page, AppHeader } from '@dynatrace/strato-components-preview/layouts';
import { Route, Routes, Link } from 'react-router-dom';
import { Home, type HomeHandle } from './pages/Home';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpPanel } from './components/HelpPanel';
import { loadConfig } from './config';

export const App = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [configured, setConfigured] = useState(() => !!loadConfig().serverUrl);
  const homeRef = useRef<HomeHandle>(null);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  const handleConfigSaved = useCallback(() => {
    const cfg = loadConfig();
    setConfigured(!!cfg.serverUrl);
    // trigger reconnect — pass URL/key explicitly to avoid stale module reads
    homeRef.current?.reconnect(cfg.serverUrl, cfg.apiKey);
  }, []);

  return (
    <Page>
      <Page.Header>
        <AppHeader>
          <AppHeader.NavItems>
            <AppHeader.AppNavLink as={Link} to="/">
              Chat
            </AppHeader.AppNavLink>
          </AppHeader.NavItems>
          <AppHeader.ActionItems>
            <button
              onClick={() => setHelpOpen(true)}
              title="Help & Documentation"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 16.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm-.75-3h1.5v1.5h-1.5V14.5zm.75-9a3.25 3.25 0 0 0-3.25 3.25h1.5A1.75 1.75 0 0 1 10 7a1.75 1.75 0 0 1 1.75 1.75c0 1.75-2.625 1.531-2.625 4.25h1.5c0-1.906 2.625-2.125 2.625-4.25A3.25 3.25 0 0 0 10 5.5z" />
              </svg>
            </button>
            <button
              onClick={handleOpenSettings}
              title="Settings"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--dt-colors-text-primary-default, #2c2d4d)',
                animation: configured ? 'none' : 'cogPulse 2s ease-in-out infinite',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.43 12.02c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 12 1h-4a.49.49 0 0 0-.49.42l-.38 2.65a7.3 7.3 0 0 0-1.69.98l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.72 1.69.98l.38 2.65c.05.24.26.42.49.42h4c.24 0 .44-.18.49-.42l.38-2.65a7.3 7.3 0 0 0 1.69-.98l2.49 1a.49.49 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65zM10 13.54a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
              </svg>
            </button>
          </AppHeader.ActionItems>
        </AppHeader>
      </Page.Header>
      <Page.Main>
        <Routes>
          <Route path="/" element={<Home ref={homeRef} onOpenSettings={handleOpenSettings} />} />
        </Routes>
      </Page.Main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfigSaved={handleConfigSaved}
      />

      <HelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenSettings={handleOpenSettings}
      />
    </Page>
  );
};
