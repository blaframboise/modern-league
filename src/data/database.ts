/** Phase 8A API subset. Regenerate against a local migrated database before expanding. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      proposed_calendar_settings: Table<{year:number;revision:number;overrides:Json;updated_at:string},never,{revision:number;overrides:Json}>;
      players: Table<{id:string;display_name:string},{display_name:string}>;
      player_identities: Table<{id:string;player_id:string;alias:string},{player_id:string;alias:string}>;
      sandbox_players: Table<{id:string;display_name:string;created_at:string},{id?:string;display_name:string}>;
      sandbox_player_aliases: Table<{player_id:string;alias:string},{player_id:string;alias:string}>;
      sandbox_tournaments: Table<{id:string;draft_id:string;revision:number;edit_revision:number;event_name:string;season_ordinal:number;scheduled_rounds:number;created_at:string},{id?:string;draft_id:string;revision:number;event_name:string;season_ordinal:number;scheduled_rounds:number}>;
      sandbox_result_edits: Table<{tournament_id:string;edit_revision:number;previous_results:Json;corrected_results:Json;actor:string;changed_at:string},never>;
      sandbox_results: Table<{tournament_id:string;row_id:string;player_id:string;wins:number;losses:number;draws:number},{tournament_id:string;row_id:string;player_id:string;wins:number;losses:number;draws:number}>;
      screenshot_assets: Table<{ id: string; draft_id: string; object_path: string; mime_type: string; byte_size: number; sha256: string; created_at: string }, never>;
      import_drafts: Table<{ id: string; created_by: string; created_at: string; original: Json }, { id?: string; original: Json }>;
      import_corrections: Table<{ id: string; draft_id: string; revision: number; snapshot: Json; reason: string; actor: string; created_at: string }, { draft_id: string; revision: number; snapshot: Json; reason: string }>;
      published_results: Table<{ result_id: string; public_snapshot: Json; published_at: string }, never>;
    };
    Views: { [_ in never]: never };
    Functions: { publish_reviewed_tournament: { Args: {p_draft:string;p_revision:number;p_calendar_revision:number;p_links:Json;p_reason:string;p_confirm:boolean};Returns:string }; correct_sandbox_tournament_results: { Args: {p_tournament:string;p_expected_edit_revision:number;p_results:Json}; Returns:number }; is_administrator: { Args: Record<PropertyKey, never>; Returns: boolean }; import_sandbox_tournament_with_players: { Args: {p_draft:string;p_revision:number;p_name:string;p_season:number;p_rounds:number;p_links:Json};Returns:string }; save_sandbox_tournament: { Args: {p_draft:string;p_revision:number;p_name:string;p_season:number;p_rounds:number;p_links:Json};Returns:string } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
