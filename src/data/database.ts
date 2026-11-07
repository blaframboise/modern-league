/** Phase 8A API subset. Regenerate against a local migrated database before expanding. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: never; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      screenshot_assets: Table<{ id: string; draft_id: string; object_path: string; mime_type: string; byte_size: number; sha256: string; created_at: string }, never>;
      import_drafts: Table<{ id: string; created_by: string; created_at: string; original: Json }, { id?: string; original: Json }>;
      import_corrections: Table<{ id: string; draft_id: string; revision: number; snapshot: Json; reason: string; actor: string; created_at: string }, { draft_id: string; revision: number; snapshot: Json; reason: string }>;
      published_results: Table<{ result_id: string; public_snapshot: Json; published_at: string }, never>;
    };
    Views: { [_ in never]: never };
    Functions: { is_administrator: { Args: Record<PropertyKey, never>; Returns: boolean } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
