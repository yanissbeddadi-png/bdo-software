"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOUD_PUBLIC_KEY, CLOUD_URL } from "./config";

let client: SupabaseClient | null = null;

/** Client Supabase du navigateur (clé publique uniquement ; session en cookies). */
export function browserClient(): SupabaseClient {
  client ??= createBrowserClient(CLOUD_URL, CLOUD_PUBLIC_KEY);
  return client;
}
