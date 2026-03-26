/**
 * GitHub Models Embeddings Function
 *
 * Calls the GitHub Models embeddings endpoint to vectorize text chunks.
 * Used for RAG — embed KB document chunks and user queries, then do
 * cosine similarity search to retrieve only relevant context.
 */

interface EmbeddingsPayload {
  githubPat: string;
  model?: string;
  inputs: string[];
}

const API_URL = 'https://models.github.ai/inference/embeddings';

export default async function (payload: EmbeddingsPayload) {
  const { githubPat, model = 'openai/text-embedding-3-small', inputs } = payload;

  if (!githubPat) {
    return { status: 'error', message: 'GitHub PAT is required' };
  }
  if (!inputs || inputs.length === 0) {
    return { status: 'error', message: 'inputs array is required' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubPat}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const body = JSON.stringify({
    model,
    input: inputs,
  });

  let res: Response;
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body });
  } catch (err: unknown) {
    return { status: 'error', message: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const responseBody = await res.text();

  if (!res.ok) {
    return {
      status: 'error',
      message: `Embeddings API error (${res.status}): ${responseBody.slice(0, 500)}`,
    };
  }

  try {
    const data = JSON.parse(responseBody);
    // OpenAI-compatible response: { data: [{ embedding: number[], index: number }], usage: { ... } }
    const embeddings: number[][] = (data.data || [])
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);

    return {
      status: 'success',
      embeddings,
      usage: data.usage ? {
        prompt_tokens: data.usage.prompt_tokens,
        total_tokens: data.usage.total_tokens,
      } : undefined,
    };
  } catch {
    return { status: 'error', message: 'Failed to parse embeddings response' };
  }
}
