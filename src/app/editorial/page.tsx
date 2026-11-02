import Link from 'next/link';
import { mensagemDeErro } from '@/lib/editorial/erros';
import { exigirEditor } from '@/lib/supabase/servidor';
import { sair } from './login/actions';

export const dynamic = 'force-dynamic';

export default async function Fila({ searchParams }: { searchParams: Promise<{ aba?: string; erro?: string }> }) {
  const { aba, erro } = await searchParams;
  const { supabase, editor } = await exigirEditor();
  const atual = aba === 'sem-rascunho' || aba === 'portarias' || aba === 'publicados' ? aba : 'rascunhos';

  let q = supabase.from('ato').select('id, tipo, numero, titulo_original, titulo_publico, orgao, data_dou, status');
  if (atual === 'portarias') q = q.eq('status', 'coletado').eq('tipo', 'portaria');
  else if (atual === 'sem-rascunho') q = q.eq('status', 'coletado').neq('tipo', 'portaria');
  else if (atual === 'publicados') q = q.eq('status', 'publicado');
  else q = q.eq('status', 'rascunho');
  const { data: atos } =
    atual === 'publicados'
      ? await q.order('publicado_em', { ascending: false }).limit(100)
      : await q.order('data_dou', { ascending: false }).limit(100);
  const msg = mensagemDeErro(erro);

  return (
    <main className="editorial">
      <header>
        <h1>Fila editorial</h1>
        <span>{editor.nome}</span>
        <form action={sair}><button type="submit">Sair</button></form>
      </header>
      {msg && <p role="alert" className="erro">{msg}</p>}
      <nav>
        <Link href="/editorial" aria-current={atual === 'rascunhos' ? 'page' : undefined}>Rascunhos da IA</Link>
        <Link href="/editorial?aba=sem-rascunho" aria-current={atual === 'sem-rascunho' ? 'page' : undefined}>Sem rascunho</Link>
        <Link href="/editorial?aba=portarias" aria-current={atual === 'portarias' ? 'page' : undefined}>Portarias (sem resumo)</Link>
        <Link href="/editorial?aba=publicados" aria-current={atual === 'publicados' ? 'page' : undefined}>Publicados</Link>
      </nav>
      {(atos ?? []).length === 0 && <p>Nada na fila.</p>}
      <ul>
        {(atos ?? []).map((a) => (
          <li key={a.id}>
            <Link href={`/editorial/ato/${a.id}`}>
              <strong>{a.tipo}{a.numero ? ` nº ${a.numero}` : ''}</strong> · {a.orgao} · {a.data_dou}
              <br />
              {atual === 'publicados' && a.titulo_publico ? a.titulo_publico : a.titulo_original}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
