import Link from 'next/link';
import { exigirEditor } from '@/lib/supabase/servidor';
import { sair } from './login/actions';

export const dynamic = 'force-dynamic';

export default async function Fila({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const { supabase, editor } = await exigirEditor();
  const portarias = aba === 'portarias';

  let q = supabase.from('ato').select('id, tipo, numero, titulo_original, orgao, data_dou, status');
  q = portarias ? q.eq('status', 'coletado').eq('tipo', 'portaria') : q.eq('status', 'rascunho');
  const { data: atos } = await q.order('data_dou', { ascending: false }).limit(100);

  return (
    <main className="editorial">
      <header>
        <h1>Fila editorial</h1>
        <span>{editor.nome}</span>
        <form action={sair}><button type="submit">Sair</button></form>
      </header>
      <nav>
        <Link href="/editorial" aria-current={!portarias ? 'page' : undefined}>Rascunhos da IA</Link>
        <Link href="/editorial?aba=portarias" aria-current={portarias ? 'page' : undefined}>Portarias (sem resumo)</Link>
      </nav>
      {(atos ?? []).length === 0 && <p>Nada na fila.</p>}
      <ul>
        {(atos ?? []).map((a) => (
          <li key={a.id}>
            <Link href={`/editorial/ato/${a.id}`}>
              <strong>{a.tipo}{a.numero ? ` nº ${a.numero}` : ''}</strong> · {a.orgao} · {a.data_dou}
              <br />
              {a.titulo_original}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
