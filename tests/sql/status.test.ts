import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, criarPromessa, EDITOR, erroDe, HOJE_TESTE, inserirAto, INTRUSO, semearEditor, type Banco } from './banco';

let b: Banco;
beforeAll(async () => {
  b = await criarBanco();
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

const ZERO = '00000000-0000-4000-8000-000000000000';
const ed = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => b.como<T>('authenticated', EDITOR, sql, params);

interface OpcoesEvidencia {
  tipo?: 'ato_dou' | 'documento' | 'outro' | null;
  url?: string | null;
  descricao?: string;
  data?: string | null;
  ato?: string | null;
}
const SQL_EVIDENCIA = 'select registrar_evidencia($1::uuid, $2::tipo_evidencia, $3, $4, $5::date, $6::uuid) as id';
function argsEvidencia(promessaId: string, o: OpcoesEvidencia = {}) {
  return [
    promessaId,
    o.tipo === undefined ? 'documento' : o.tipo,
    o.url === undefined ? 'https://www.gov.br/relatorio.pdf' : o.url,
    o.descricao ?? 'Relatório oficial de execução',
    o.data === undefined ? '2027-03-01' : o.data,
    o.ato ?? null,
  ];
}
async function registrar(promessaId: string, o: OpcoesEvidencia = {}): Promise<string> {
  const [r] = await ed<{ id: string }>(SQL_EVIDENCIA, argsEvidencia(promessaId, o));
  return r.id;
}
const retirar = (evidenciaId: string, nota: string) => ed('select retirar_evidencia($1::uuid, $2)', [evidenciaId, nota]);

const SQL_DECIDIR = 'select decidir_status($1::uuid, $2::status_promessa, $3::uuid[], $4, $5::boolean, $6::uuid)';
const ids = (...v: string[]) => `{${v.join(',')}}`;

async function statusDe(promessaId: string) {
  const [p] = await b.dono<{ status: string; status_atualizado_em: string | null }>(
    'select status::text, status_atualizado_em::text from promessa where id = $1::uuid',
    [promessaId],
  );
  return p;
}

describe('registrar_evidencia', () => {
  it('grava evidencia de documento assinada pelo editor', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const id = await registrar(promessaId);
    const [e] = await b.dono('select tipo::text, fonte_url, data_fato::text, criado_por from evidencia where id = $1::uuid', [id]);
    expect(e).toEqual({ tipo: 'documento', fonte_url: 'https://www.gov.br/relatorio.pdf', data_fato: '2027-03-01', criado_por: EDITOR });
  });

  it('recusa data antes de 01/01/2027 ou no futuro, tipo ausente, fonte sem https, descricao vazia e promessa nao publicada', async () => {
    const { promessaId } = await criarPromessa(b, true);
    expect((await erroDe(registrar(promessaId, { data: '2026-12-31' }))).message).toContain('data do fato anterior a 2027-01-01');
    expect((await erroDe(registrar(promessaId, { data: '2027-07-01' }))).message).toContain('data do fato no futuro');
    await registrar(promessaId, { data: HOJE_TESTE });
    expect((await erroDe(registrar(promessaId, { tipo: null }))).message).toContain('tipo de evidencia obrigatorio');
    expect((await erroDe(registrar(promessaId, { url: 'http://www.gov.br/x' }))).message).toContain('fonte deve ser https');
    expect((await erroDe(registrar(promessaId, { url: null }))).message).toContain('fonte deve ser https');
    expect((await erroDe(registrar(promessaId, { descricao: '  ' }))).message).toContain('descricao obrigatoria');
    expect((await erroDe(registrar(promessaId, { descricao: 'x'.repeat(501) }))).message).toContain('descricao acima do limite');
    const rascunho = await criarPromessa(b);
    expect((await erroDe(registrar(rascunho.promessaId))).message).toContain('promessa nao publicada');
  });

  it('evidencia de ato usa link e data do DOU e confirma o vinculo', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-02-10');
    const id = await registrar(promessaId, { tipo: 'ato_dou', ato, url: null, data: null });
    const [e] = await b.dono<{ fonte_url: string; data_fato: string }>('select fonte_url, data_fato::text from evidencia where id = $1::uuid', [id]);
    expect(e.fonte_url).toMatch(/^https:\/\/www\.in\.gov\.br\/teste\//);
    expect(e.data_fato).toBe('2027-02-10');
    const [v] = await b.dono('select origem::text, estado::text, decidido_por from vinculo_ato_promessa where ato_id = $1::uuid and promessa_id = $2::uuid', [ato, promessaId]);
    expect(v).toEqual({ origem: 'editor', estado: 'confirmado', decidido_por: EDITOR });
    expect((await erroDe(registrar(promessaId, { tipo: 'ato_dou', ato, url: null, data: null }))).message).toContain('evidencia ja registrada');
  });

  it('regras de ato: precisa existir, so no tipo ato_dou, e respeita a data de corte', async () => {
    const { promessaId } = await criarPromessa(b, true);
    expect((await erroDe(registrar(promessaId, { tipo: 'ato_dou', ato: ZERO }))).message).toContain('ato nao encontrado');
    const ato2027 = await inserirAto(b, '2027-05-05');
    expect((await erroDe(registrar(promessaId, { tipo: 'documento', ato: ato2027 }))).message).toContain('ato so vale para evidencia do tipo ato_dou');
    const ato2026 = await inserirAto(b, '2026-06-01');
    expect((await erroDe(registrar(promessaId, { tipo: 'ato_dou', ato: ato2026, url: null, data: null }))).message).toContain(
      'data do fato anterior a 2027-01-01',
    );
  });

  it('so o editor registra', async () => {
    const { promessaId } = await criarPromessa(b, true);
    expect((await erroDe(b.como('authenticated', INTRUSO, SQL_EVIDENCIA, argsEvidencia(promessaId)))).message).toContain('sem permissao');
    expect((await erroDe(b.como('service_role', null, SQL_EVIDENCIA, argsEvidencia(promessaId)))).code).toBe('42501');
  });
});

describe('retirar_evidencia', () => {
  it('marca a evidencia, rejeita o vinculo do ato, registra no historico e nao muda o status', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-02-15');
    const ev = await registrar(promessaId, { tipo: 'ato_dou', ato, url: null, data: null });
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Ha decreto.', false, null]);
    expect((await erroDe(retirar(ev, ' '))).message).toContain('nota e obrigatoria para retirar evidencia');
    await retirar(ev, 'O decreto trata de outro programa.');
    const [e] = await b.dono('select retirada_nota, retirada_por, (retirada_em is not null) as retirada from evidencia where id = $1::uuid', [ev]);
    expect(e).toEqual({ retirada_nota: 'O decreto trata de outro programa.', retirada_por: EDITOR, retirada: true });
    const [v] = await b.dono<{ estado: string }>('select estado::text from vinculo_ato_promessa where ato_id = $1::uuid and promessa_id = $2::uuid', [ato, promessaId]);
    expect(v.estado).toBe('rejeitado');
    const [r] = await b.dono<{ n: number }>(`select count(*)::int as n from revisao_promessa where promessa_id = $1::uuid and decisao = 'retirou_evidencia'`, [promessaId]);
    expect(r.n).toBe(1);
    expect((await statusDe(promessaId)).status).toBe('em_andamento');
    expect((await erroDe(retirar(ev, 'de novo'))).message).toContain('evidencia ja retirada');
    expect((await erroDe(retirar(ZERO, 'x'))).message).toContain('evidencia nao encontrada');
  });

  it('evidencia retirada nao serve para decidir status e o mesmo ato pode ser registrado de novo', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-02-16');
    const ev = await registrar(promessaId, { tipo: 'ato_dou', ato, url: null, data: null });
    await retirar(ev, 'Erro de leitura.');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Ha decreto.', false, null]))).message).toContain('evidencia invalida');
    const nova = await registrar(promessaId, { tipo: 'ato_dou', ato, url: null, data: null, descricao: 'Decreto, lido de novo' });
    expect(nova).not.toBe(ev);
  });

  it('so o editor retira', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    expect((await erroDe(b.como('authenticated', INTRUSO, 'select retirar_evidencia($1::uuid, $2)', [ev, 'x']))).message).toContain('sem permissao');
    expect((await erroDe(b.como('service_role', null, 'select retirar_evidencia($1::uuid, $2)', [ev, 'x']))).code).toBe('42501');
  });
});

describe('decidir_status', () => {
  it('exige evidencia valida da propria promessa, nota e status diferente', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const outra = await criarPromessa(b, true);
    const evOutra = await registrar(outra.promessaId);
    const ev = await registrar(promessaId);
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'em_andamento', '{}', 'Ha decreto.', false, null]))).message).toContain('evidencia obrigatoria');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(evOutra), 'Ha decreto.', false, null]))).message).toContain('evidencia invalida');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev, ZERO), 'Ha decreto.', false, null]))).message).toContain('evidencia invalida');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), '   ', false, null]))).message).toContain('nota e obrigatoria para mudar status');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'nao_iniciada', ids(ev), 'Nada.', false, null]))).message).toContain('status igual ao atual');
    expect((await statusDe(promessaId)).status).toBe('nao_iniciada');
  });

  it('cumprida e abandonada exigem confirmacao de que o editor abriu a fonte', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'cumprida', ids(ev), 'Entregue.', false, null]))).message).toContain('confirmacao de fonte obrigatoria');
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'abandonada', ids(ev), 'Revogado.', null, null]))).message).toContain('confirmacao de fonte obrigatoria');
    await ed(SQL_DECIDIR, [promessaId, 'cumprida', ids(ev), 'Entregue nos termos prometidos.', true, null]);
    const [r] = await b.dono<{ confirmou_fonte: boolean }>(`select confirmou_fonte from revisao_promessa where promessa_id = $1::uuid and decisao = 'mudou_status'`, [promessaId]);
    expect(r.confirmou_fonte).toBe(true);
  });

  it('muda o status, data a mudanca e grava antes, depois, nota e evidencias no historico', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Decreto publicado em 2027.', false, null]);
    const p = await statusDe(promessaId);
    expect(p.status).toBe('em_andamento');
    expect(p.status_atualizado_em).not.toBeNull();
    const [r] = await b.dono(
      `select decisao::text, status_antes::text, status_depois::text, nota, editor_id, valores_depois->'evidencia_ids' as evs
         from revisao_promessa where promessa_id = $1::uuid and decisao = 'mudou_status'`,
      [promessaId],
    );
    expect(r).toEqual({ decisao: 'mudou_status', status_antes: 'nao_iniciada', status_depois: 'em_andamento', nota: 'Decreto publicado em 2027.', editor_id: EDITOR, evs: [ev] });
  });

  it('voltar a nao iniciada e correcao: exige nota, nao exige evidencia', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Ha ato.', false, null]);
    expect((await erroDe(ed(SQL_DECIDIR, [promessaId, 'nao_iniciada', '{}', '', false, null]))).message).toContain('nota e obrigatoria para mudar status');
    await ed(SQL_DECIDIR, [promessaId, 'nao_iniciada', '{}', 'Correcao: o ato nao trata desta promessa.', false, null]);
    expect((await statusDe(promessaId)).status).toBe('nao_iniciada');
  });

  it('so vale para promessa publicada e so o editor decide', async () => {
    const rascunho = await criarPromessa(b);
    expect((await erroDe(ed(SQL_DECIDIR, [rascunho.promessaId, 'nao_iniciada', '{}', 'n', false, null]))).message).toContain('promessa nao publicada');
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    const args = [promessaId, 'em_andamento', ids(ev), 'n', false, null];
    expect((await erroDe(b.como('authenticated', INTRUSO, SQL_DECIDIR, args))).message).toContain('sem permissao');
    expect((await erroDe(b.como('anon', null, SQL_DECIDIR, args))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, SQL_DECIDIR, args))).code).toBe('42501');
  });
});

describe('propostas de status', () => {
  const SQL_PROPOSTA = `insert into proposta_status (promessa_id, status_proposto, justificativa, evidencia_ids, modelo, versao_prompt)
                        values ($1::uuid, $2::status_promessa, 'Ha decreto ligado a promessa.', $3::uuid[], 'modelo-teste', 'status-v1') returning id`;

  it('decidir com o mesmo status da proposta a aprova e liga a revisao a ela', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    const [prop] = await b.como<{ id: string }>('service_role', null, SQL_PROPOSTA, [promessaId, 'em_andamento', ids(ev)]);
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Confere com o decreto.', false, prop.id]);
    const [p] = await b.dono('select estado::text, decidido_por, nota_decisao from proposta_status where id = $1::uuid', [prop.id]);
    expect(p).toEqual({ estado: 'aprovada', decidido_por: EDITOR, nota_decisao: 'Confere com o decreto.' });
    const [r] = await b.dono<{ proposta_id: string }>(`select proposta_id from revisao_promessa where promessa_id = $1::uuid and decisao = 'mudou_status'`, [promessaId]);
    expect(r.proposta_id).toBe(prop.id);
  });

  it('decidir com outro status a partir da proposta a marca como recusada', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    const [prop] = await b.como<{ id: string }>('service_role', null, SQL_PROPOSTA, [promessaId, 'cumprida', ids(ev)]);
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'Ainda nao foi entregue.', false, prop.id]);
    const [p] = await b.dono<{ estado: string }>('select estado::text from proposta_status where id = $1::uuid', [prop.id]);
    expect(p.estado).toBe('recusada');
  });

  it('decidir sem a proposta pendente a marca como substituida', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    const [prop] = await b.como<{ id: string }>('service_role', null, SQL_PROPOSTA, [promessaId, 'cumprida', ids(ev)]);
    await ed(SQL_DECIDIR, [promessaId, 'em_andamento', ids(ev), 'So em andamento.', false, null]);
    const [p] = await b.dono<{ estado: string }>('select estado::text from proposta_status where id = $1::uuid', [prop.id]);
    expect(p.estado).toBe('substituida');
  });

  it('proposta de outra promessa ou ja decidida e invalida', async () => {
    const a = await criarPromessa(b, true);
    const c = await criarPromessa(b, true);
    const evA = await registrar(a.promessaId);
    const evC = await registrar(c.promessaId);
    const [propC] = await b.como<{ id: string }>('service_role', null, SQL_PROPOSTA, [c.promessaId, 'em_andamento', ids(evC)]);
    expect((await erroDe(ed(SQL_DECIDIR, [a.promessaId, 'em_andamento', ids(evA), 'n', false, propC.id]))).message).toContain('proposta invalida');
  });

  it('recusar exige nota e so vale para proposta pendente', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ev = await registrar(promessaId);
    const [prop] = await b.como<{ id: string }>('service_role', null, SQL_PROPOSTA, [promessaId, 'cumprida', ids(ev)]);
    expect((await erroDe(ed('select recusar_proposta($1::uuid, $2)', [prop.id, ' ']))).message).toContain('nota e obrigatoria para recusar');
    await ed('select recusar_proposta($1::uuid, $2)', [prop.id, 'O documento nao comprova a entrega.']);
    const [p] = await b.dono('select estado::text, nota_decisao from proposta_status where id = $1::uuid', [prop.id]);
    expect(p).toEqual({ estado: 'recusada', nota_decisao: 'O documento nao comprova a entrega.' });
    expect((await erroDe(ed('select recusar_proposta($1::uuid, $2)', [prop.id, 'de novo']))).message).toContain('proposta invalida');
    expect((await statusDe(promessaId)).status).toBe('nao_iniciada');
  });
});

describe('confirmar_vinculo', () => {
  const SQL_SUGERIR = `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
                       values ($1::uuid, $2::uuid, 'ia', 'sugerido', 'Justificativa da IA, nunca publica.', 'modelo-teste', 'vinculo-v1') returning id`;

  it('confirmar exige a descricao do editor e cria a evidencia do ato com ela', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-04-20');
    const [v] = await b.como<{ id: string }>('service_role', null, SQL_SUGERIR, [ato, promessaId]);
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, null)', [v.id]))).message).toContain('descricao obrigatoria');
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, $2)', [v.id, '   ']))).message).toContain('descricao obrigatoria');
    const [r] = await ed<{ id: string }>('select confirmar_vinculo($1::uuid, true, $2) as id', [v.id, 'Decreto cria 200 creches em 2027']);
    const [e] = await b.dono('select tipo::text, ato_id, data_fato::text, descricao from evidencia where id = $1::uuid', [r.id]);
    expect(e).toEqual({ tipo: 'ato_dou', ato_id: ato, data_fato: '2027-04-20', descricao: 'Decreto cria 200 creches em 2027' });
    const [vv] = await b.dono('select estado::text, decidido_por from vinculo_ato_promessa where id = $1::uuid', [v.id]);
    expect(vv).toEqual({ estado: 'confirmado', decidido_por: EDITOR });
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, $2)', [v.id, 'x']))).message).toContain('vinculo ja decidido');
  });

  it('rejeitar nao cria evidencia; decisao nula e recusada', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-04-21');
    const [v] = await b.como<{ id: string }>('service_role', null, SQL_SUGERIR, [ato, promessaId]);
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, null, $2)', [v.id, 'x']))).message).toContain('decisao do vinculo obrigatoria');
    const [r] = await ed<{ id: string | null }>('select confirmar_vinculo($1::uuid, false, null) as id', [v.id]);
    expect(r.id).toBeNull();
    const [n] = await b.dono<{ n: number }>('select count(*)::int as n from evidencia where promessa_id = $1::uuid', [promessaId]);
    expect(n.n).toBe(0);
  });

  it('promessa retirada depois da sugestao nao recebe evidencia; vinculo inexistente', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-04-22');
    const [v] = await b.como<{ id: string }>('service_role', null, SQL_SUGERIR, [ato, promessaId]);
    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Sai do ar.']);
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, $2)', [v.id, 'Decreto']))).message).toContain('promessa nao publicada');
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, $2)', [ZERO, 'Decreto']))).message).toContain('vinculo nao encontrado');
  });
});

describe('confirmar_vinculo: ato no futuro', () => {
  it('nao vira evidencia', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await inserirAto(b, '2027-07-15');
    const [v] = await b.dono<{ id: string }>(
      `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
       values ($1::uuid, $2::uuid, 'ia', 'sugerido', 'Justificativa.', 'm', 'v') returning id`,
      [ato, promessaId],
    );
    expect((await erroDe(ed('select confirmar_vinculo($1::uuid, true, $2)', [v.id, 'Decreto']))).message).toContain('data do fato no futuro');
  });
});

describe('privilegios das funcoes de status', () => {
  it('execute so para authenticated', async () => {
    const FUNCOES = [
      'registrar_evidencia(uuid, tipo_evidencia, text, text, date, uuid)',
      'retirar_evidencia(uuid, text)',
      'decidir_status(uuid, status_promessa, uuid[], text, boolean, uuid)',
      'recusar_proposta(uuid, text)',
      'confirmar_vinculo(uuid, boolean, text)',
    ];
    for (const f of FUNCOES) {
      for (const [papel, esperado] of [['anon', false], ['service_role', false], ['authenticated', true]] as const) {
        const [r] = await b.dono<{ ok: boolean }>('select has_function_privilege($1, $2, $3) as ok', [papel, f, 'EXECUTE']);
        expect({ f, papel, ok: r.ok }).toEqual({ f, papel, ok: esperado });
      }
    }
  });
});

describe('negacao de acesso em cada funcao de status', () => {
  const SQL_PROP = `insert into proposta_status (promessa_id, status_proposto, justificativa, evidencia_ids, modelo, versao_prompt)
                    values ($1::uuid, 'cumprida', 'Justificativa.', $2::uuid[], 'modelo-teste', 'status-v1') returning id`;
  const SQL_VINC = `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
                    values ($1::uuid, $2::uuid, 'ia', 'sugerido', 'Justificativa da IA.', 'modelo-teste', 'vinculo-v1') returning id`;
  // Cada caso tem os proprios dados (ids reais), para a falha so poder vir da checagem de permissao.
  const casos: [string, () => Promise<{ sql: string; params: unknown[] }>][] = [
    [
      'registrar_evidencia',
      async () => ({ sql: SQL_EVIDENCIA, params: argsEvidencia((await criarPromessa(b, true)).promessaId) }),
    ],
    [
      'retirar_evidencia',
      async () => ({ sql: 'select retirar_evidencia($1::uuid, $2)', params: [await registrar((await criarPromessa(b, true)).promessaId), 'Motivo.'] }),
    ],
    [
      'decidir_status',
      async () => {
        const { promessaId } = await criarPromessa(b, true);
        return { sql: SQL_DECIDIR, params: [promessaId, 'em_andamento', ids(await registrar(promessaId)), 'Nota.', false, null] };
      },
    ],
    [
      'recusar_proposta',
      async () => {
        const { promessaId } = await criarPromessa(b, true);
        const [p] = await b.como<{ id: string }>('service_role', null, SQL_PROP, [promessaId, ids(await registrar(promessaId))]);
        return { sql: 'select recusar_proposta($1::uuid, $2)', params: [p.id, 'Motivo.'] };
      },
    ],
    [
      'confirmar_vinculo',
      async () => {
        const { promessaId } = await criarPromessa(b, true);
        const [v] = await b.como<{ id: string }>('service_role', null, SQL_VINC, [await inserirAto(b, '2027-05-06'), promessaId]);
        return { sql: 'select confirmar_vinculo($1::uuid, true, $2)', params: [v.id, 'Descricao.'] };
      },
    ],
  ];

  it.each(casos)('%s: intruso recebe sem permissao (42501); anon e service_role sao barrados no privilegio', async (_nome, preparar) => {
    const { sql, params } = await preparar();
    const intruso = await erroDe(b.como('authenticated', INTRUSO, sql, params));
    expect(intruso.code).toBe('42501');
    expect(intruso.message).toContain('sem permissao');
    for (const papel of ['anon', 'service_role'] as const) {
      const e = await erroDe(b.como(papel, null, sql, params));
      expect(e.code).toBe('42501');
      expect(e.message).toMatch(/permission denied for function/);
    }
  });
});
