/** Phase 8A API subset. Regenerate against a local migrated database before expanding. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      sandbox_players: Table<{id:string;display_name:string;created_at:string},{id?:string;display_name:string}>;
      sandbox_player_aliases: Table<{player_id:string;alias:string},{player_id:string;alias:string}>;
      sandbox_tournaments: Table<{id:string;draft_id:string;revision:number;event_name:string;season_ordinal:number;scheduled_rounds:number;created_at:string},{id?:string;draft_id:string;revision:number;event_name:string;season_ordinal:number;scheduled_rounds:number}>;
      sandbox_results: Table<{tournament_id:string;row_id:string;player_id:string;wins:number;losses:number;draws:number},{tournament_id:string;row_id:string;player_id:string;wins:number;losses:number;draws:number}>;
      screenshot_assets: Table<{ id: string; draft_id: string; object_path: string; mime_type: string; byte_size: number; sha256: string; created_at: string }, never>;
      import_drafts: Table<{ id: string; created_by: string; created_at: string; original: Json }, { id?: string; original: Json }>;
      import_corrections: Table<{ id: string; draft_id: string; revision: number; snapshot: Json; reason: string; actor: string; created_at: string }, { draft_id: string; revision: number; snapshot: Json; reason: string }>;
      published_results: Table<{ result_id: string; public_snapshot: Json; published_at: string }, never>;
    };
    Views: { [_ in never]: never };
    Functions: { is_administrator: { Args: Record<PropertyKey, never>; Returns: boolean }; save_sandbox_tournament: { Args: {p_draft:string;p_revision:number;p_name:string;p_season:number;p_rounds:number;p_links:Json};Returns:string } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
