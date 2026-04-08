/**
 * Persistent storage for recommendation history.
 * Uses the Dynatrace App State API so history survives page reloads.
 */
import { stateClient } from '@dynatrace-sdk/client-state';

const STATE_KEY = 'recommendation-history';
const MAX_HISTORY = 50; // keep last 50 recommendations

export interface HistoryEntry {
  id: string;
  label: string;
  dql: string;
  content: string;
  persona?: string;
  timestamp: number;
}

let cache: HistoryEntry[] | null = null;

export async function loadHistory(): Promise<HistoryEntry[]> {
  if (cache) return cache;
  try {
    const state = await stateClient.getAppState({ key: STATE_KEY });
    cache = JSON.parse(state.value) as HistoryEntry[];
  } catch {
    cache = [];
  }
  return cache;
}

export function getHistory(): HistoryEntry[] {
  return cache ?? [];
}

export async function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry> {
  if (!cache) await loadHistory();
  const full: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  cache = [full, ...(cache || [])].slice(0, MAX_HISTORY);
  await stateClient.setAppState({
    key: STATE_KEY,
    body: { value: JSON.stringify(cache) },
  });
  return full;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  if (!cache) await loadHistory();
  cache = (cache || []).filter((e) => e.id !== id);
  await stateClient.setAppState({
    key: STATE_KEY,
    body: { value: JSON.stringify(cache) },
  });
}

export async function clearHistory(): Promise<void> {
  cache = [];
  await stateClient.setAppState({
    key: STATE_KEY,
    body: { value: JSON.stringify(cache) },
  });
}
