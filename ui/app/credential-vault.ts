/**
 * Credential Vault integration.
 *
 * Resolves Dynatrace Credential Vault IDs (CREDENTIALS_VAULT-xxx) to their
 * actual secret values.  Each user stores their own credentials in the vault
 * with "Owner only" access + AppEngine scope, so the vault enforces per-user
 * isolation automatically.
 *
 * Usage: call `resolveVaultCredentials()` with the vault IDs from config,
 * and it returns the resolved secret values ready to pass to API functions.
 */
import {
  credentialVaultClient,
  type CredentialsDetailsTokenResponseElement,
} from '@dynatrace-sdk/client-classic-environment-v2';

const VAULT_ID_PREFIX = 'CREDENTIALS_VAULT-';

/** Check whether a string looks like a vault credential ID. */
export function isVaultId(value: string | undefined): boolean {
  return !!value && value.startsWith(VAULT_ID_PREFIX);
}

/** Resolved secrets from vault credential IDs. */
export interface ResolvedCredentials {
  anthropicApiKey?: string;
  githubPat?: string;
  mcpBearerToken?: string;
}

// In-memory cache so we don't hit the vault on every API call.
// Cache is per-session (cleared on page reload).
let cache: Record<string, string> = {};

/** Clear the in-memory cache (e.g. on logout or credential change). */
export function clearVaultCache(): void {
  cache = {};
}

/**
 * Resolve a single vault credential ID to its token value.
 * Returns the cached value if available.
 */
async function resolveToken(vaultId: string): Promise<string> {
  if (cache[vaultId]) return cache[vaultId];

  const details: CredentialsDetailsTokenResponseElement =
    await credentialVaultClient.getCredentialsDetails({ id: vaultId });

  if (!details.token) {
    throw new Error(`Credential ${vaultId} has no token value. Ensure it is a Token-type credential with AppEngine scope.`);
  }

  cache[vaultId] = details.token;
  return details.token;
}

/**
 * Resolve vault IDs to actual secrets.
 *
 * For each field:
 * - If the value starts with CREDENTIALS_VAULT-, resolve via the vault SDK
 * - Otherwise treat it as a raw secret (backwards-compatible)
 */
export async function resolveVaultCredentials(opts: {
  anthropicApiKey?: string;
  githubPat?: string;
  mcpBearerToken?: string;
}): Promise<ResolvedCredentials> {
  const result: ResolvedCredentials = {};

  const [anthropic, github, mcp] = await Promise.all([
    opts.anthropicApiKey && isVaultId(opts.anthropicApiKey)
      ? resolveToken(opts.anthropicApiKey).catch(() => undefined)
      : Promise.resolve(opts.anthropicApiKey),
    opts.githubPat && isVaultId(opts.githubPat)
      ? resolveToken(opts.githubPat).catch(() => undefined)
      : Promise.resolve(opts.githubPat),
    opts.mcpBearerToken && isVaultId(opts.mcpBearerToken)
      ? resolveToken(opts.mcpBearerToken).catch(() => undefined)
      : Promise.resolve(opts.mcpBearerToken),
  ]);

  if (anthropic) result.anthropicApiKey = anthropic;
  if (github) result.githubPat = github;
  if (mcp) result.mcpBearerToken = mcp;

  return result;
}

/**
 * Test that a vault credential ID is accessible and contains a token.
 * Returns { ok, message }.
 */
export async function testVaultCredential(vaultId: string): Promise<{ ok: boolean; message: string }> {
  if (!isVaultId(vaultId)) {
    return { ok: false, message: 'Not a vault credential ID (expected CREDENTIALS_VAULT-...)' };
  }
  try {
    const token = await resolveToken(vaultId);
    const masked = token.substring(0, 4) + '...' + token.substring(token.length - 4);
    return { ok: true, message: `Resolved (${masked})` };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to resolve credential' };
  }
}
