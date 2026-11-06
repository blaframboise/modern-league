import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.ts';
import type { ImportValues, ImportDraft } from '../results/index.ts';

function json(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
function checked<T>(response: { data: T; error: { message: string } | null }): T {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
/** RLS is the authority. No browser method can approve or publish. */
export function leagueRepository(client: SupabaseClient<Database>) {
  return {
    async isAdministrator() { return checked(await client.rpc('is_administrator')) === true; },
    async publishedResults() { return checked(await client.from('published_results').select('result_id,public_snapshot,published_at').order('published_at')); },
    async createDraft(original: ImportValues) {
      return checked(await client.from('import_drafts').insert({ original: json(original) }).select().single());
    },
    async appendCorrection(draftId: string, draft: ImportDraft) {
      if (draft.state !== 'draft' || !draft.corrections.length) throw new Error('Require an editable corrected draft.');
      const last = draft.corrections.at(-1)!;
      if (!last.reason.trim()) throw new Error('Require a correction reason.');
      return checked(await client.from('import_corrections').insert({ draft_id: draftId, revision: draft.corrections.length, snapshot: json(draft), reason: last.reason }).select().single());
    },
    async drafts() { return checked(await client.from('import_drafts').select('*').order('created_at')); },
    async corrections(draftId: string) { return checked(await client.from('import_corrections').select('*').eq('draft_id', draftId).order('revision')); },
  };
}
