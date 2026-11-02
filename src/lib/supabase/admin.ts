import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function criarClienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY');
  return createClient(url, chave, { auth: { persistSession: false } });
}
