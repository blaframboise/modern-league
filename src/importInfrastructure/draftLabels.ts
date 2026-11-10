import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database';

export type DraftSummary = { id: string; original?: unknown; created_at?: string };
type CorrectionSummary = { draft_id: string; revision: number; snapshot: unknown };

export function savedEventName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const values = 'values' in source ? source.values : raw;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const event = (values as Record<string, unknown>).tournament;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const tournament = event as Record<string, unknown>;
  const name = typeof tournament.name === 'string' ? tournament.name.trim() : '';
  const date = typeof tournament.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tournament.date) ? tournament.date : '';
  return name && date ? `${name} — ${date}` : name || date || null;
}
export function labelledDrafts(drafts: DraftSummary[], corrections: CorrectionSummary[]): Record<string, string> {
  const latest = new Map<string, CorrectionSummary>();
  for (const entry of corrections) {
    if (!latest.has(entry.draft_id) || entry.revision > latest.get(entry.draft_id)!.revision) {
      latest.set(entry.draft_id, entry);
    }
  }
  return Object.fromEntries(drafts.map(draft => {
    const event = savedEventName(latest.get(draft.id)?.snapshot) || savedEventName(draft.original) || 'Unreviewed screenshot';
    const when = draft.created_at && Number.isFinite(Date.parse(draft.created_at))
      ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(draft.created_at))
      : 'Upload time unknown';
    return [draft.id, `${event} · uploaded ${when} · ${draft.id.slice(0, 8)}`];
  }));
}
export async function fetchDraftLabels(client: SupabaseClient<Database>, drafts: DraftSummary[]): Promise<Record<string,string>> {
  if (!drafts.length) return {};
  const { data, error } = await client.from('import_corrections').select('draft_id,revision,snapshot')
    .in('draft_id', drafts.map(item => item.id)).order('revision', { ascending: false });
  if (error) throw new Error('Saved event labels could not be loaded: ' + error.message);
  return labelledDrafts(drafts, data || []);
}
