import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function criarClienteServidor() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) jar.set(name, value, options);
          } catch {
            // chamado de um Server Component: o middleware renova a sessão
          }
        },
      },
    },
  );
}

export async function exigirEditor() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/editorial/login');
  const { data: editor } = await supabase.from('editor').select('id, nome, papel').eq('id', data.user.id).maybeSingle();
  if (!editor) redirect('/editorial/login?erro=sem-permissao');
  return { supabase, user: data.user, editor };
}
