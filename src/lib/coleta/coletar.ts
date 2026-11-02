import type { SupabaseClient } from '@supabase/supabase-js';
import { classificarTipo, extrairNumero } from '@/lib/dou/classificar';
import { descobrirLinkMes } from '@/lib/dou/descobrirLink';
import { parseAto } from '@/lib/dou/parseAto';
import { baixarZip, lerEntradas } from '@/lib/dou/zip';
import { diasDaJanela } from './janela';
import { paraLinha } from './linha';

export interface OpcoesColeta {
  supabase: SupabaseClient;
  diasRetroativos: number;
  hoje?: Date;
  fetchFn?: typeof fetch;
}

export interface ResultadoColeta {
  lidos: number;
  relevantes: number;
  novos: number;
  falhas: number;
}

const LOTE = 500;

async function gravar(supabase: SupabaseClient, linhas: ReturnType<typeof paraLinha>[]): Promise<number> {
  let novos = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { data, error } = await supabase
      .from('ato')
      .upsert(linhas.slice(i, i + LOTE), { onConflict: 'dou_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`falha ao gravar atos: ${error.message}`);
    novos += data?.length ?? 0;
  }
  return novos;
}

export async function coletar(opts: OpcoesColeta): Promise<ResultadoColeta> {
  const { supabase, diasRetroativos } = opts;
  if (!Number.isInteger(diasRetroativos) || diasRetroativos < 0) throw new Error('diasRetroativos invalido');
  const fetchFn = opts.fetchFn ?? fetch;
  const dias = diasDaJanela(opts.hoje ?? new Date(), diasRetroativos);
  const meses = [...new Set(dias.map((d) => d.slice(0, 6)))];

  const r: ResultadoColeta = { lidos: 0, relevantes: 0, novos: 0, falhas: 0 };
  const avisos: string[] = [];
  let erro: string | null = null;
  let maisRecente: string | null = null;

  try {
    for (const ym of meses) {
      const link = await descobrirLinkMes(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)) - 1, fetchFn);
      if (!link) {
        avisos.push(`sem ZIP S01 para ${ym}`);
        continue;
      }
      const zip = await baixarZip(link.url, fetchFn);
      const entradas = lerEntradas(zip, new Set(dias.filter((d) => d.startsWith(ym))));
      const porId = new Map<string, ReturnType<typeof paraLinha>>();
      for (const e of entradas) {
        r.lidos++;
        if (maisRecente === null || e.dia > maisRecente) maisRecente = e.dia;
        try {
          const bruto = parseAto(e.conteudo, e.secao === 'DO1E');
          const tipo = classificarTipo(bruto.artType, bruto.artCategory, bruto.texto);
          if (!tipo) continue;
          const linha = paraLinha({ ...bruto, tipo, numero: extrairNumero(bruto.identifica) });
          if (!porId.has(linha.dou_id)) porId.set(linha.dou_id, linha);
        } catch (e2) {
          r.falhas++;
          avisos.push(`${e.nome}: ${e2 instanceof Error ? e2.message : String(e2)}`);
        }
      }
      r.relevantes += porId.size;
      r.novos += await gravar(supabase, [...porId.values()]);
    }
    if (r.lidos === 0) throw new Error(`nenhum XML lido na janela ${dias.at(-1)}..${dias[0]}. ${avisos.join('; ')}`);
    const limite = dias[Math.min(3, dias.length - 1)];
    if (maisRecente === null || maisRecente < limite) {
      throw new Error(`ZIP desatualizado: nenhum XML dos ultimos 4 dias (mais recente lido: ${maisRecente ?? 'nenhum'})`);
    }
    if (r.falhas / r.lidos > 0.05) throw new Error(`muitas falhas de leitura (${r.falhas}/${r.lidos}): ${avisos.slice(0, 3).join('; ')}`);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  const ref = dias[0];
  let erroLog: string | null = null;
  try {
    const { error } = await supabase.from('execucao_coleta').insert({
      data_referencia: `${ref.slice(0, 4)}-${ref.slice(4, 6)}-${ref.slice(6, 8)}`,
      status: erro ? 'erro' : 'ok',
      qtd_atos: r.novos,
      erro: erro ?? (avisos.length ? avisos.slice(0, 5).join('; ') : null),
    });
    if (error) erroLog = error.message;
  } catch (e) {
    erroLog = e instanceof Error ? e.message : String(e);
  }
  if (erro) {
    if (erroLog) console.error(`falha ao registrar execucao_coleta: ${erroLog}`);
    throw new Error(erro);
  }
  if (erroLog) throw new Error(`falha ao registrar execucao_coleta: ${erroLog}`);
  return r;
}
