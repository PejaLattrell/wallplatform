import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type PostRow = {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: PostRow;
        Insert: { id?: string; user_id?: string | null; body: string; created_at?: string };
        Update: { body?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);
let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
