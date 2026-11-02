'use server';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/servidor';

export async function entrar(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const senha = String(formData.get('senha') ?? '');
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect('/editorial/login?erro=credenciais');
  redirect('/editorial');
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect('/editorial/login');
}
