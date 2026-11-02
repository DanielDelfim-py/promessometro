import Link from 'next/link';
import { agruparPorData } from '@/lib/atos/agrupar';
import { lerFiltro, ORDEM_FILTRO, ROTULO_FILTRO, ROTULO_TIPO, type AtoPublico } from '@/lib/atos/filtro';
import { dataBrasil } from '@/lib/atos/data';
import { criarClientePublico } from '@/lib/supabase/publico';
import { CabecalhoPublico } from '@/components/CabecalhoPublico';

export const dynamic = 'force-dynamic';

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const br = (iso: string) => iso.split('-').reverse().join('/');

export default async function Atos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtro = lerFiltro(await searchParams);
  const supabase = criarClientePublico();

  let temas: { nome: string; slug: string }[] = [];
  let atos: AtoPublico[] = [];
  let falhou = false;

  try {
    const r = await supabase.from('tema').select('nome, slug').order('nome');
    if (r.error) falhou = true;
    else temas = r.data ?? [];

    if (filtro.tipos.length > 0) {
      let q = supabase.from('ato_publico').select('id, tipo, numero, orgao, data_dou, secao, edicao_extra, titulo, resumo, url_dou, publicado_em, tema_nome, tema_slug, correcao_nota, corrigido_em').in('tipo', filtro.tipos);
      if (filtro.tema) q = q.eq('tema_slug', filtro.tema);
      const { data, error } = await q
        .order('data_dou', { ascending: false })
        .order('publicado_em', { ascending: false })
        .limit(200);
      if (error) falhou = true;
      else atos = (data ?? []) as AtoPublico[];
    }
  } catch {
    falhou = true;
  }
  const grupos = agruparPorData(atos, hojeSP());

  return (
    <div className="pagina">
      <CabecalhoPublico ativo="atos" />

      <main className="conteudo">
        <aside className="filtros">
          <h2>Filtrar</h2>
          <form method="get">
            <input type="hidden" name="f" value="1" />
            <fieldset>
              <legend>Tipo de ato</legend>
              {ORDEM_FILTRO.map((t) => (
                <label key={t} className="opcao">
                  <input type="checkbox" name="tipo" value={t} defaultChecked={filtro.tipos.includes(t)} /> {ROTULO_FILTRO[t]}
                </label>
              ))}
            </fieldset>
            <div className="campo">
              <label htmlFor="tema">Tema</label>
              <select id="tema" name="tema" defaultValue={filtro.tema ?? ''}>
                <option value="">Todos</option>
                {temas.map((t) => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
              </select>
            </div>
            <button type="submit" className="botao">Aplicar filtros</button>
          </form>
        </aside>

        <section className="lista">
          <div className="titulo-pagina">
            <h1>Atos oficiais</h1>
            <p>O que saiu no Diário Oficial da União, explicado em linguagem simples e com link para o texto original.</p>
          </div>

          {falhou && <p className="vazio">Não foi possível carregar os atos agora.</p>}
          {!falhou && grupos.length === 0 && <p className="vazio">Nenhum ato publicado para estes filtros.</p>}
          {grupos.map((g) => (
            <div key={g.rotulo} className="grupo">
              <h2 className="data">{g.rotulo}</h2>
              {g.atos.map((a) => (
                <article key={a.id} className="cartao">
                  <div className="meta">
                    <span className="selo">{ROTULO_TIPO[a.tipo]}</span>
                    <span>{a.tema_nome} · DOU {br(a.data_dou)}, seção {a.secao}</span>
                  </div>
                  <h3>{a.titulo}</h3>
                  <p>{a.resumo}</p>
                  <div className="links">
                    <a href={a.url_dou} target="_blank" rel="noreferrer">Texto original no DOU</a>
                  </div>
                  {a.correcao_nota && a.corrigido_em && (
                    <p className="correcao">Corrigido em {dataBrasil(a.corrigido_em)}: {a.correcao_nota}</p>
                  )}
                </article>
              ))}
            </div>
          ))}
          <p className="rodape-ia">Resumos preparados com apoio de IA e aprovados por um editor antes da publicação. <Link href="/como-trabalhamos">Saiba como trabalhamos.</Link></p>
        </section>
      </main>
    </div>
  );
}
