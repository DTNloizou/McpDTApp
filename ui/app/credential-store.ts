/**
 * Credential store using the Dynatrace App State API.
 *
 * Stores API keys (Anthropic, GitHub PAT, MCP bearer token, etc.) server-side
 * so they're available to any authorised user of the app — no need for each
 * user to re-enter keys in their own browser.
 *
 * Keys are kept in a single app-state entry under a well-known key.
 * The App State API stores values encrypted at rest within the Dynatrace platform.
 */
import { stateClient } from '@dynatrace-sdk/client-state';

const CREDENTIAL_STATE_KEY = 'mcp-app-credentials';

/** Shape of the stored credentials object. */
export interface StoredCredentials {
  anthropicApiKey?: string;
  githubPat?: string;
  mcpBearerToken?: string;
  mcpServerUrl?: string;
  githubModel?: string;
  /** ISO timestamp of last save */
  updatedAt?: string;
}

/** Load credentials from the Dynatrace App State store. */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  try {
    const state = await stateClient.getAppState({ key: CREDENTIAL_STATE_KEY });
    return JSON.parse(state.value) as StoredCredentials;
  } catch {
    // Not found or parse error — no stored credentials yet
    return null;
  }
}

/** Save credentials to the Dynatrace App State store. */
export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  const payload: StoredCredentials = {
    ...creds,
    updatedAt: new Date().toISOString(),
  };
  await stateClient.setAppState({
    key: CREDENTIAL_STATE_KEY,
    body: { value: JSON.stringify(payload) },
  });
}

/** Delete stored credentials from the Dynatrace App State store. */
export async function deleteCredentials(): Promise<void> {
  try {
    await stateClient.deleteAppState({ key: CREDENTIAL_STATE_KEY });
  } catch {
    // Already gone — that's fine
  }
}
