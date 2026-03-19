/**
 * Anthropic Files API Function
 *
 * Manages file uploads/deletions on the Anthropic Files API.
 * KB documents are uploaded as text/plain so they can be referenced
 * by file_id in Claude conversations instead of embedding full text.
 *
 * Runs server-side in the Dynatrace JavaScript Runtime
 * (the AppShell would block direct browser calls to api.anthropic.com).
 */

interface FilesPayload {
  action: 'upload' | 'delete' | 'list';
  anthropicApiKey: string;
  /** Original filename (e.g. "runbook.md") — used for upload */
  filename?: string;
  /** Text content of the file — used for upload */
  content?: string;
  /** Anthropic file_id — used for delete */
  fileId?: string;
}

const API_BASE = 'https://api.anthropic.com/v1/files';
const ANTHROPIC_VERSION = '2023-06-01';
const BETA_HEADER = 'files-api-2025-04-14';

export default async function (payload: FilesPayload) {
  const { action, anthropicApiKey } = payload;

  if (!anthropicApiKey) {
    return { error: 'Anthropic API key is required' };
  }

  const baseHeaders: Record<string, string> = {
    'x-api-key': anthropicApiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': BETA_HEADER,
  };

  try {
    switch (action) {
      case 'upload': {
        if (!payload.filename || payload.content == null) {
          return { error: 'filename and content are required for upload' };
        }

        // Anthropic supports text/plain as a document block type.
        // Rename .md → .txt so it gets classified correctly.
        const safeName = payload.filename.replace(/\.(md|markdown)$/i, '.txt');

        // Build multipart/form-data manually (FormData is not available in this runtime)
        const boundary = '----AnthropicFileBoundary' + Date.now();
        const body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${safeName}"`,
          `Content-Type: text/plain`,
          '',
          payload.content,
          `--${boundary}--`,
        ].join('\r\n');

        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: {
            ...baseHeaders,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      }

      case 'delete': {
        if (!payload.fileId) {
          return { error: 'fileId is required for delete' };
        }

        // Validate fileId format to prevent path traversal
        if (!/^file_[A-Za-z0-9]+$/.test(payload.fileId)) {
          return { error: 'Invalid fileId format' };
        }

        const res = await fetch(`${API_BASE}/${payload.fileId}`, {
          method: 'DELETE',
          headers: baseHeaders,
        });

        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      }

      case 'list': {
        const res = await fetch(API_BASE, {
          method: 'GET',
          headers: baseHeaders,
        });

        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Unknown error calling Anthropic Files API',
    };
  }
}
