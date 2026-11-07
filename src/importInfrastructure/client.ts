import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database.ts';
export function screenshotClient(client: SupabaseClient<Database>) {
  return async (action: 'create' | 'upload' | 'correct' | 'extract' | 'retention-preview', id: string, body?: File | Record<string, unknown>) => {
    const result = await client.functions.invoke(`screenshot-import?action=${action}`, {
      headers: { 'x-draft-id': id }, body: body instanceof File ? body : body === undefined ? {} : body,
    });
    if (result.error) {
      let message = 'Import request failed. Retain your edits and retry or reload.';
      if (result.error.context instanceof Response) {
        try { message = (await result.error.context.json()).error ?? message; } catch { /* retain safe fallback */ }
      }
      throw new Error(message);
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  };
}
