"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Client Supabase du navigateur, ou null si l'appli tourne en mode local. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const cloudEnabled = !!supabase;
