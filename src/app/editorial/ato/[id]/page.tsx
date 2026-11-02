import { notFound } from 'next/navigation';
import { mensagemDeErro } from '@/lib/editorial/erros';
import { htmlParaTexto } from '@/lib/ia/texto';
import { exigirEditor } from '@/lib/supabase/servidor';
import { gerarResumoPortaria, revisarAto } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function Revisao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirEditor();

  const { data: ato } = await supabase.from('ato').select('*').eq('id', id).maybeSingle();
  if (!ato) notFound();
  const { data: temas } = await supabase.from('tema').select('id, nome, slug').order('nome');
  const { data: r } = await supabase
    .from('rascunho_ia')
    .select('titulo_sugerido, resumo_sugerido, tema_sugerido, observacao')
    .eq('ato_id', id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const temaSugerido = temas?.find((t) => t.slug === r?.tema_sugerido)?.id ?? ato.tema_id ?? '';
  const revisavel = ato.status === 'coletado' || ato.status === 'rascunho';

  return (
    <main className="revisao">
      <h1>{ato.titulo_original}</h1>
      <p>{ato.orgao} · DOU {ato.data_dou}, seção {ato.secao} · <a href={ato.url_dou} target="_blank" rel="noreferrer">Texto original no DOU</a></p>
      {mensagemDeErro(erro) && <p role="alert" className="erro">{mensagemDeErro(erro)}</p>}
      <div className="duas-colunas">
        <section>
          <h2>Texto original</h2>
          <pre className="texto-original">{htmlParaTexto(ato.texto_original)}</pre>
        </section>
        <section>
          <h2>Resumo para publicação</h2>
          {!r && revisavel && (
            <form action={gerarResumoPortaria}>
              <input type="hidden" name="ato_id" value={id} />
              <p>Este ato ainda não tem rascunho da IA.</p>
              <button type="submit">Gerar resumo com IA</button>
            </form>
          )}
          {r?.observacao && <p className="aviso">Aviso da IA: {r.observacao}</p>}
          {revisavel ? (
            <form action={revisarAto}>
              <input type="hidden" name="ato_id" value={id} />
              <label>Título <input name="titulo" defaultValue={r?.titulo_sugerido ?? ''} required maxLength={140} /></label>
              <label>Resumo <textarea name="resumo" defaultValue={r?.resumo_sugerido ?? ''} required rows={5} maxLength={600} /></label>
              <label>Tema
                <select name="tema_id" defaultValue={temaSugerido} required>
                  <option value="" disabled>Escolha…</option>
                  {temas?.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <label>Nota (opcional) <input name="nota" /></label>
              <button type="submit" name="acao" value="publicar">Aprovar e publicar</button>
              <button type="submit" name="acao" value="descartar" formNoValidate>Descartar</button>
            </form>
          ) : (
            <p>Este ato já foi revisado ({ato.status}).</p>
          )}
        </section>
      </div>
    </main>
  );
}
