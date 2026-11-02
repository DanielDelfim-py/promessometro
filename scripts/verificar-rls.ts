import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const anon = createClient(url, chave, { auth: { persistSession: false } });

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome} ${detalhe}`);
  if (!ok) falhas++;
}
function detalheErro(erro: { code?: string; message?: string } | null): string {
  return erro ? `${erro.code} ${erro.message}` : 'sem erro';
}

// Negado = Postgres "permission denied" (42501). Sem essa checagem, um erro qualquer passaria.
const ato = await anon.from('ato').select('id').limit(1);
conferir('anon nao le ato', ato.error?.code === '42501', detalheErro(ato.error));

const publico = await anon.from('ato_publico').select('id').limit(1);
conferir('anon le ato_publico', !publico.error, detalheErro(publico.error));

const colunaSecreta = await anon.from('ato_publico').select('texto_original').limit(1);
conferir('ato_publico nao expoe texto_original', colunaSecreta.error?.code === '42703', detalheErro(colunaSecreta.error));

const tema = await anon.from('tema').select('slug');
conferir('anon le temas', !tema.error && (tema.data?.length ?? 0) >= 13, `${tema.data?.length} temas`);

const temaEscrita = await anon.from('tema').insert({ nome: 'x', slug: 'x' });
conferir('anon nao escreve tema', temaEscrita.error?.code === '42501', detalheErro(temaEscrita.error));

const rev = await anon.from('revisao').select('id').limit(1);
conferir('anon nao le revisao', rev.error?.code === '42501', detalheErro(rev.error));

const exec = await anon.from('execucao_coleta').select('id').limit(1);
conferir('anon nao le execucao_coleta', exec.error?.code === '42501', detalheErro(exec.error));

const editor = await anon.from('editor').select('id').limit(1);
conferir('anon nao le editor', editor.error?.code === '42501', detalheErro(editor.error));

const ins = await anon.from('ato').insert({
  dou_id: 'x',
  tipo: 'decreto',
  orgao: 'x',
  data_dou: '2026-01-01',
  titulo_original: 'x',
  texto_original: 'x',
  url_dou: 'x',
});
conferir('anon nao insere ato', ins.error?.code === '42501', detalheErro(ins.error));

const rpc = await anon.rpc('revisar_ato', {
  p_ato_id: '00000000-0000-0000-0000-000000000000',
  p_decisao: 'aprovou',
  p_titulo: 'x',
  p_resumo: 'x',
  p_tema_id: '00000000-0000-0000-0000-000000000000',
});
conferir('anon nao executa revisar_ato', rpc.error?.code === '42501', detalheErro(rpc.error));

process.exit(falhas ? 1 : 0);
