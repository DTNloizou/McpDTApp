/**
 * Persistent storage for custom pre-built query categories.
 * Uses the Dynatrace App State API so edits survive page reloads.
 */
import { stateClient } from '@dynatrace-sdk/client-state';

const STATE_KEY = 'custom-query-categories';

export interface CustomQuery {
  label: string;
  emoji: string;
  query: string;
}

export interface CustomCategory {
  id: string;
  label: string;
  emoji: string;
  color: string;
  queries: CustomQuery[];
}

let cache: CustomCategory[] | null = null;

export async function loadCustomCategories(): Promise<CustomCategory[]> {
  if (cache) return cache;
  try {
    const state = await stateClient.getAppState({ key: STATE_KEY });
    cache = JSON.parse(state.value) as CustomCategory[];
  } catch {
    cache = [];
  }
  return cache;
}

export function getCustomCategories(): CustomCategory[] {
  return cache ?? [];
}

export async function saveCustomCategories(categories: CustomCategory[]): Promise<void> {
  cache = categories;
  await stateClient.setAppState({
    key: STATE_KEY,
    body: { value: JSON.stringify(categories) },
  });
}
