import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.ts';
import type { ImportValues, ImportDraft } from '../results/index.ts';
import { reconstructImportDraft, sameHistory } from './reconstruction.ts';

function json(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
function checked<T>(response: { data: T; error: { message: string } | null }): T {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
/** RLS is the authority. No browser method can approve or publish. */
export function leagueRepository(client: SupabaseClient<Database>) {
  async function loadDraft(id: string): Promise<ImportDraft> {
    const original = checked(await client.from('import_drafts').select('*').eq('id', id).single());
    const response = await client.from('import_corrections').select('*', { count: 'exact' }).eq('draft_id', id).order('revision');
    const rows = checked(response);
    if (!original || original.id !== id || !rows || response.count === null) throw new Error('Incomplete persisted import history.');
    return reconstructImportDraft(original, rows, response.count);
  }
  return {
    loadDraft,
    async isAdministrator() { return checked(await client.rpc('is_administrator')) === true; },
    async publishedResults() { return checked(await client.from('published_results').select('result_id,public_snapshot,published_at').order('published_at')); },
    async createDraft(original: ImportValues) {
      return checked(await client.from('import_drafts').insert({ original: json(reconstructImportDraft({ id: 'new-draft', original }, [], 0).original) }).select().single());
    },
    async appendCorrection(draftId: string, draft: ImportDraft) {
      if (draft.state !== 'draft' || !draft.corrections.length) throw new Error('Require an editable corrected draft.');
      if (draft.importId !== draftId || draft.decision) throw new Error('Draft identity or state mismatch.');
      const candidate = reconstructImportDraft({ id: draftId, original: draft.original }, draft.corrections.map((correction, index) => ({
        id: String(index + 1), draft_id: draftId, revision: index + 1, snapshot: correction, reason: correction.reason,
      })), draft.corrections.length);
      const persisted = await loadDraft(draftId);
      if (!sameHistory(persisted.original, candidate.original) || !sameHistory(persisted.corrections, candidate.corrections.slice(0, -1))) {
        throw new Error('Persisted history differs. Reload before appending a correction.');
      }
      const last = candidate.corrections.at(-1)!;
      return checked(await client.from('import_corrections').insert({ draft_id: draftId, revision: draft.corrections.length, snapshot: json(last), reason: last.reason }).select().single());
    },
    async drafts() { return checked(await client.from('import_drafts').select('*').order('created_at')); },
    async corrections(draftId: string) { return checked(await client.from('import_corrections').select('*').eq('draft_id', draftId).order('revision')); },
  };
}
