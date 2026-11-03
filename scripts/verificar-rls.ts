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

type ErroApi = { code?: string; message?: string } | null;
/** Exige o SQLSTATE E um trecho da mensagem (sem o trecho, qualquer erro com o mesmo codigo passaria). */
function erroIgual(erro: ErroApi, code: string, trecho: RegExp): boolean {
  return erro?.code === code && trecho.test(erro.message ?? '');
}
/** Privilegio negado: 42501 "permission denied for table|function ...". */
function negado(erro: ErroApi, tipo: 'table' | 'function' = 'table'): boolean {
  return erroIgual(erro, '42501', new RegExp(`^permission denied for ${tipo} `));
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

// Sem slug (not null): se o privilegio faltasse, o insert falharia com 23502 e nada ficaria gravado.
const temaEscrita = await anon.from('tema').insert({ nome: 'verificar-rls' });
conferir('anon nao escreve tema', temaEscrita.error?.code === '42501', detalheErro(temaEscrita.error));

const rev = await anon.from('revisao').select('id').limit(1);
conferir('anon nao le revisao', rev.error?.code === '42501', detalheErro(rev.error));

const exec = await anon.from('execucao_coleta').select('id').limit(1);
conferir('anon nao le execucao_coleta', exec.error?.code === '42501', detalheErro(exec.error));

const editor = await anon.from('editor').select('id').limit(1);
conferir('anon nao le editor', editor.error?.code === '42501', detalheErro(editor.error));

// url_dou sem https viola o check url_dou_https (23514): sem o bloqueio nada ficaria gravado.
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

// Fase 2 (0003): o publico nao le nenhuma tabela nova; le as visoes.
const COLUNA_TESTE: Record<string, string> = {
  plano: 'id',
  plano_pagina: 'plano_id',
  promessa_candidata: 'id',
  promessa: 'id',
  evidencia: 'id',
  vinculo_ato_promessa: 'id',
  proposta_status: 'id',
  revisao_promessa: 'id',
};
for (const [tabela, coluna] of Object.entries(COLUNA_TESTE)) {
  const r = await anon.from(tabela).select(coluna).limit(1);
  conferir(`anon nao le ${tabela}`, negado(r.error), detalheErro(r.error));
}

for (const visao of ['promessa_publica', 'historico_status_publico', 'evidencia_publica']) {
  const r = await anon.from(visao).select('id').limit(1);
  conferir(`anon le ${visao}`, !r.error, detalheErro(r.error));
}

const estadoInterno = await anon.from('promessa_publica').select('estado').limit(1);
conferir(
  'promessa_publica nao expoe estado',
  erroIgual(estadoInterno.error, '42703', /column .*estado.* does not exist/),
  detalheErro(estadoInterno.error),
);

const nPromessas = await anon.from('ato_publico').select('id, n_promessas').limit(1);
conferir('ato_publico tem n_promessas', !nPromessas.error, detalheErro(nPromessas.error));

const UUID_ZERO = '00000000-0000-0000-0000-000000000000';
const RPCS_PROTEGIDAS: [string, Record<string, unknown>][] = [
  ['aceitar_candidata', { p_candidata_id: UUID_ZERO, p_titulo: 'x', p_tema_id: UUID_ZERO }],
  ['descartar_candidata', { p_candidata_id: UUID_ZERO }],
  ['reabrir_candidata', { p_candidata_id: UUID_ZERO }],
  ['editar_promessa', { p_promessa_id: UUID_ZERO, p_titulo: 'x', p_tema_id: UUID_ZERO, p_nota: 'x' }],
  ['publicar_promessa', { p_promessa_id: UUID_ZERO, p_nota: null }],
  ['retirar_promessa', { p_promessa_id: UUID_ZERO, p_nota: 'x' }],
  ['registrar_evidencia', { p_promessa_id: UUID_ZERO, p_tipo: 'documento', p_fonte_url: 'https://x', p_descricao: 'x', p_data_fato: '2027-01-01', p_ato_id: null }],
  ['retirar_evidencia', { p_evidencia_id: UUID_ZERO, p_nota: 'x' }],
  ['decidir_status', { p_promessa_id: UUID_ZERO, p_status: 'cumprida', p_evidencia_ids: [UUID_ZERO], p_nota: 'x', p_confirmou_fonte: true, p_proposta_id: null }],
  ['recusar_proposta', { p_proposta_id: UUID_ZERO, p_nota: 'x' }],
  ['confirmar_vinculo', { p_vinculo_id: UUID_ZERO, p_confirmar: true, p_descricao: 'x' }],
  ['importar_plano', { p_plano: {}, p_paginas: [], p_candidatas: [] }],
];
for (const [nome, args] of RPCS_PROTEGIDAS) {
  const r = await anon.rpc(nome, args);
  conferir(`anon nao executa ${nome}`, negado(r.error, 'function'), detalheErro(r.error));
}

// Bloco opcional: privilegio minimo de service_role (so roda com SUPABASE_SECRET_KEY).
// Todas as operacoes abaixo DEVEM falhar com 42501 e nao deixar dados.
const chaveSecreta = process.env.SUPABASE_SECRET_KEY;
if (chaveSecreta) {
  const svc = createClient(url, chaveSecreta, { auth: { persistSession: false } });
  const ZERO = '00000000-0000-0000-0000-000000000000';

  // Regra de todas as escritas abaixo: a carga viola um CHECK, NOT NULL ou chave estrangeira, que o Postgres
  // avalia DEPOIS da checagem de privilegio e dos gatilhos BEFORE. Com a protecao o erro e 42501 (ou a mensagem
  // do gatilho); sem ela seria 23514/23502/23503 e nenhuma linha ficaria gravada. UPDATE/DELETE usam um id
  // inexistente (zero linhas afetadas).
  // url_dou sem https viola url_dou_https e tema_id inexistente viola a chave estrangeira.
  const insPub = await svc.from('ato').insert({
    dou_id: 'verificar-rls',
    tipo: 'decreto',
    orgao: 'x',
    data_dou: '2026-01-01',
    titulo_original: 'x',
    texto_original: 'x',
    url_dou: 'sem-https',
    status: 'publicado',
    titulo_publico: 'x',
    resumo_publico: 'x',
    tema_id: ZERO,
    publicado_em: '2026-01-01T00:00:00Z',
  });
  conferir('service_role nao insere ato publicado', insPub.error?.code === '42501', detalheErro(insPub.error));

  // url_dou sem https viola url_dou_https (23514), avaliado depois do gatilho que recusa correcao_nota (42501).
  const insCorr = await svc.from('ato').insert({
    dou_id: 'verificar-rls-correcao',
    tipo: 'decreto',
    orgao: 'x',
    data_dou: '2026-01-01',
    titulo_original: 'x',
    texto_original: 'x',
    url_dou: 'sem-https',
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

  // Fase 2 (0003): todas DEVEM falhar e nao deixar dados. Cada uma confere SQLSTATE e mensagem.
  const updStatus = await svc.from('promessa').update({ status: 'cumprida' }).eq('id', ZERO);
  conferir('service_role nao altera promessa.status', negado(updStatus.error), detalheErro(updStatus.error));

  const updEstado = await svc.from('promessa').update({ estado: 'publicada' }).eq('id', ZERO);
  conferir('service_role nao altera promessa.estado', negado(updEstado.error), detalheErro(updEstado.error));

  // plano_id e tema_id inexistentes: violam a chave estrangeira (23503).
  const insProm = await svc.from('promessa').insert({
    plano_id: ZERO,
    tema_id: ZERO,
    titulo: 'x',
    texto_original: 'x',
    pagina: 1,
    fonte_url: 'https://x',
  });
  conferir('service_role nao insere promessa', negado(insProm.error), detalheErro(insProm.error));

  const delPlano = await svc.from('plano').delete().eq('id', ZERO);
  conferir('service_role nao apaga plano', negado(delPlano.error), detalheErro(delPlano.error));

  // O plano so entra por importar_plano: insert direto em plano, plano_pagina e promessa_candidata e negado.
  const insPlano = await svc.from('plano').insert({
    titulo: 'x',
    candidato: 'x',
    cargo: 'x',
    ano_eleicao: 2026,
    fonte_url: 'https://x',
    // sha256 fora do formato viola plano_sha256_formato (23514): sem o bloqueio nada ficaria gravado.
    arquivo_sha256: 'nao-e-sha',
    paginas: 1,
  });
  conferir('service_role nao insere plano direto', negado(insPlano.error), detalheErro(insPlano.error));

  // plano_id inexistente: viola a chave estrangeira (23503).
  const insPagina = await svc.from('plano_pagina').insert({ plano_id: ZERO, numero: 1, texto: 'x' });
  conferir('service_role nao insere plano_pagina direto', negado(insPagina.error), detalheErro(insPagina.error));

  // plano_id inexistente: viola a chave estrangeira (23503).
  const insCand = await svc.from('promessa_candidata').insert({
    plano_id: ZERO,
    pagina: 1,
    citacao: 'x'.repeat(30),
    titulo_sugerido: 'x',
    tema_sugerido: 'outros',
    modelo: 'x',
    versao_prompt: 'x',
  });
  conferir('service_role nao insere candidata direto', negado(insCand.error), detalheErro(insCand.error));

  // importar_plano E permitida, mas com carga invalida recusa antes de gravar qualquer coisa.
  const impVazia = await svc.rpc('importar_plano', { p_plano: {}, p_paginas: [], p_candidatas: [] });
  conferir(
    'service_role executa importar_plano (carga invalida e recusada)',
    erroIgual(impVazia.error, 'P0001', /^importacao invalida: formato$/),
    detalheErro(impVazia.error),
  );

  const lerRevP = await svc.from('revisao_promessa').select('id').limit(1);
  conferir('service_role nao le revisao_promessa', negado(lerRevP.error), detalheErro(lerRevP.error));

  // promessa_id e editor_id inexistentes: violam a chave estrangeira (23503).
  const insRevP = await svc.from('revisao_promessa').insert({
    promessa_id: ZERO,
    editor_id: ZERO,
    decisao: 'mudou_status',
    status_antes: 'nao_iniciada',
    status_depois: 'cumprida',
    valores_antes: {},
    valores_depois: {},
  });
  conferir('service_role nao insere revisao_promessa', negado(insRevP.error), detalheErro(insRevP.error));

  // promessa_id e criado_por inexistentes: violam a chave estrangeira (23503); tipo documento sem ato e coerente.
  const insEv = await svc.from('evidencia').insert({
    promessa_id: ZERO,
    tipo: 'documento',
    fonte_url: 'https://x',
    descricao: 'x',
    data_fato: '2027-01-01',
    criado_por: ZERO,
  });
  conferir('service_role nao insere evidencia', negado(insEv.error), detalheErro(insEv.error));

  // service_role pode inserir sugestao e proposta pendente; qualquer outra coisa o gatilho recusa (42501).
  // estado confirmado sem decidido_por viola vinculo_decisao_completa (23514) e ato/promessa inexistentes violam a chave estrangeira.
  const insVinc = await svc.from('vinculo_ato_promessa').insert({
    ato_id: ZERO,
    promessa_id: ZERO,
    origem: 'ia',
    estado: 'confirmado',
    justificativa: 'x',
    modelo: 'x',
    versao_prompt: 'x',
  });
  conferir(
    'service_role nao insere vinculo confirmado',
    erroIgual(insVinc.error, '42501', /vinculo novo deve ser sugestao pendente da ia/),
    detalheErro(insVinc.error),
  );

  // promessa_id inexistente: viola a chave estrangeira (23503).
  const insProp = await svc.from('proposta_status').insert({
    promessa_id: ZERO,
    status_proposto: 'cumprida',
    justificativa: 'x',
    evidencia_ids: [ZERO],
    modelo: 'x',
    versao_prompt: 'x',
    estado: 'aprovada',
  });
  conferir(
    'service_role nao insere proposta aprovada',
    erroIgual(insProp.error, '42501', /proposta nova deve estar pendente/),
    detalheErro(insProp.error),
  );

  const rpcPub = await svc.rpc('publicar_promessa', { p_promessa_id: ZERO, p_nota: null });
  conferir('service_role nao executa publicar_promessa', negado(rpcPub.error, 'function'), detalheErro(rpcPub.error));

  const rpcDec = await svc.rpc('decidir_status', {
    p_promessa_id: ZERO,
    p_status: 'cumprida',
    p_evidencia_ids: [ZERO],
    p_nota: 'x',
    p_confirmou_fonte: true,
    p_proposta_id: null,
  });
  conferir('service_role nao executa decidir_status', negado(rpcDec.error, 'function'), detalheErro(rpcDec.error));
} else {
  console.log('PULOU verificacoes de service_role (defina SUPABASE_SECRET_KEY para rodar)');
}

process.exit(falhas ? 1 : 0);
