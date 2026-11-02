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

// Bloco opcional: privilegio minimo de service_role (so roda com SUPABASE_SECRET_KEY).
// Todas as operacoes abaixo DEVEM falhar com 42501 e nao deixar dados.
const chaveSecreta = process.env.SUPABASE_SECRET_KEY;
if (chaveSecreta) {
  const svc = createClient(url, chaveSecreta, { auth: { persistSession: false } });
  const ZERO = '00000000-0000-0000-0000-000000000000';

  const insPub = await svc.from('ato').insert({
    dou_id: 'verificar-rls',
    tipo: 'decreto',
    orgao: 'x',
    data_dou: '2026-01-01',
    titulo_original: 'x',
    texto_original: 'x',
    url_dou: 'https://x',
    status: 'publicado',
    titulo_publico: 'x',
    resumo_publico: 'x',
    tema_id: ZERO,
    publicado_em: '2026-01-01T00:00:00Z',
  });
  conferir('service_role nao insere ato publicado', insPub.error?.code === '42501', detalheErro(insPub.error));

  const insCorr = await svc.from('ato').insert({
    dou_id: 'verificar-rls-correcao',
    tipo: 'decreto',
    orgao: 'x',
    data_dou: '2026-01-01',
    titulo_original: 'x',
    texto_original: 'x',
    url_dou: 'https://x',
    status: 'coletado',
    correcao_nota: 'x',
  });
  conferir('service_role nao semeia correcao_nota no insert', insCorr.error?.code === '42501', detalheErro(insCorr.error));

  const insRev = await svc.from('revisao').insert({
    ato_id: ZERO,
    editor_id: ZERO,
    decisao: 'aprovou',
    valores_antes: {},
    valores_depois: {},
  });
  conferir('service_role nao insere revisao', insRev.error?.code === '42501', detalheErro(insRev.error));

  const updRev = await svc.from('revisao').update({ nota: 'x' }).eq('id', ZERO);
  conferir('service_role nao altera revisao', updRev.error?.code === '42501', detalheErro(updRev.error));

  const delRev = await svc.from('revisao').delete().eq('id', ZERO);
  conferir('service_role nao apaga revisao', delRev.error?.code === '42501', detalheErro(delRev.error));

  const delAto = await svc.from('ato').delete().eq('id', ZERO);
  conferir('service_role nao apaga ato', delAto.error?.code === '42501', detalheErro(delAto.error));

  const updOrgao = await svc.from('ato').update({ orgao: 'x' }).eq('id', ZERO);
  conferir('service_role nao altera colunas de ato alem de status', updOrgao.error?.code === '42501', detalheErro(updOrgao.error));
} else {
  console.log('PULOU verificacoes de service_role (defina SUPABASE_SECRET_KEY para rodar)');
}

process.exit(falhas ? 1 : 0);
