import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, criarPromessa, EDITOR, erroDe, inserirAto, semearEditor, temaId, type Banco } from './banco';

let b: Banco;
beforeAll(async () => {
  b = await criarBanco();
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

const ed = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => b.como<T>('authenticated', EDITOR, sql, params);
const anon = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => b.como<T>('anon', null, sql, params);

async function colunas(visao: string): Promise<string[]> {
  const cols = await b.dono<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [visao],
  );
  return cols.map((c) => c.column_name);
}

async function publicarAto(dataDou: string, titulo: string): Promise<string> {
  const ato = await inserirAto(b, dataDou);
  await ed(`select revisar_ato($1::uuid, 'aprovou', $2, 'Resumo do ato.', $3::uuid, null)`, [ato, titulo, await temaId(b, 'educacao')]);
  return ato;
}
async function evidenciaDeAto(promessaId: string, ato: string): Promise<string> {
  const [r] = await ed<{ id: string }>(
    `select registrar_evidencia($1::uuid, 'ato_dou', null, 'Decreto ligado a promessa', null, $2::uuid) as id`,
    [promessaId, ato],
  );
  return r.id;
}

describe('promessa_publica', () => {
  it('mostra so as publicadas, com tema e plano', async () => {
    const pub = await criarPromessa(b, true);
    const ras = await criarPromessa(b);
    const ret = await criarPromessa(b, true);
    await ed('select retirar_promessa($1::uuid, $2)', [ret.promessaId, 'Sai do ar.']);
    const linhas = await anon<{ id: string; status: string; tema_slug: string; plano_titulo: string; mandato: string }>(
      `select id, titulo, texto_original, pagina, fonte_url, mandato, status::text, publicada_em, status_atualizado_em,
              tema_nome, tema_slug, plano_titulo, plano_candidato, plano_ano, correcao_nota, corrigido_em
         from promessa_publica`,
    );
    const ids = linhas.map((l) => l.id);
    expect(ids).toContain(pub.promessaId);
    expect(ids).not.toContain(ras.promessaId);
    expect(ids).not.toContain(ret.promessaId);
    const p = linhas.find((l) => l.id === pub.promessaId)!;
    expect(p).toMatchObject({ status: 'nao_iniciada', tema_slug: 'educacao', plano_titulo: 'Plano de teste', mandato: '2027-2030' });
  });

  it('as colunas da correcao ficam no fim e mostram a nota da correcao de promessa publicada', async () => {
    expect((await colunas('promessa_publica')).slice(-2)).toEqual(['correcao_nota', 'corrigido_em']);
    const { promessaId } = await criarPromessa(b, true);
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Titulo corrigido', await temaId(b, 'educacao'), 'Titulo trocava o sentido.']);
    const [p] = await anon<{ titulo: string; correcao_nota: string; tem_data: boolean }>(
      'select titulo, correcao_nota, corrigido_em is not null as tem_data from promessa_publica where id = $1::uuid',
      [promessaId],
    );
    expect(p).toEqual({ titulo: 'Titulo corrigido', correcao_nota: 'Titulo trocava o sentido.', tem_data: true });
  });

  it('nao expoe colunas internas (lista exata de colunas)', async () => {
    expect(await colunas('promessa_publica')).toEqual([
      'id', 'titulo', 'texto_original', 'pagina', 'fonte_url', 'mandato', 'status', 'publicada_em', 'status_atualizado_em',
      'tema_nome', 'tema_slug', 'plano_titulo', 'plano_candidato', 'plano_ano', 'correcao_nota', 'corrigido_em',
    ]);
    for (const col of ['estado', 'plano_id', 'tema_id', 'criado_por', 'decidido_por', 'editor_id']) {
      const e = await erroDe(anon(`select ${col} from promessa_publica`));
      expect({ col, code: e.code }).toEqual({ col, code: '42703' });
    }
  });

  it('nota de correcao de promessa retirada nao aparece em lugar nenhum', async () => {
    const { promessaId } = await criarPromessa(b, true);
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Titulo ajustado', await temaId(b, 'educacao'), 'NOTA-CORRECAO-SECRETA']);
    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'NOTA-RETIRADA-SECRETA']);
    expect(await anon('select id from promessa_publica where id = $1::uuid', [promessaId])).toEqual([]);
    const tudo = JSON.stringify([
      await anon('select * from promessa_publica'),
      await anon('select * from historico_status_publico'),
      await anon('select * from evidencia_publica'),
      await anon('select * from ato_publico'),
    ]);
    expect(tudo).not.toContain('NOTA-CORRECAO-SECRETA');
    expect(tudo).not.toContain('NOTA-RETIRADA-SECRETA');
  });
});

describe('historico_status_publico e evidencia_publica', () => {
  it('historico mostra so mudancas de status, e so de promessas publicadas', async () => {
    const { promessaId } = await criarPromessa(b, true);
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Titulo corrigido', await temaId(b, 'educacao'), 'Ajuste de titulo.']);
    const [ev] = await ed<{ id: string }>(
      `select registrar_evidencia($1::uuid, 'documento', 'https://www.gov.br/x.pdf', 'Relatorio', '2027-02-01', null) as id`,
      [promessaId],
    );
    await ed('select decidir_status($1::uuid, $2::status_promessa, $3::uuid[], $4, false, null)', [promessaId, 'em_andamento', `{${ev.id}}`, 'Obra iniciada.']);
    const h = await anon('select status_antes::text, status_depois::text, nota from historico_status_publico where promessa_id = $1::uuid', [promessaId]);
    expect(h).toEqual([{ status_antes: 'nao_iniciada', status_depois: 'em_andamento', nota: 'Obra iniciada.' }]);
    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Sai do ar.']);
    expect(await anon('select id from historico_status_publico where promessa_id = $1::uuid', [promessaId])).toEqual([]);
    expect(await anon('select id from evidencia_publica where promessa_id = $1::uuid', [promessaId])).toEqual([]);
  });

  it('historico nao tem identidade do editor nem valores internos (lista exata de colunas)', async () => {
    expect(await colunas('historico_status_publico')).toEqual(['id', 'promessa_id', 'status_antes', 'status_depois', 'nota', 'criado_em']);
    for (const col of ['editor_id', 'decisao', 'valores_antes', 'valores_depois', 'proposta_id', 'confirmou_fonte']) {
      const e = await erroDe(anon(`select ${col} from historico_status_publico`));
      expect({ col, code: e.code }).toEqual({ col, code: '42703' });
    }
  });

  it('evidencia_publica: lista exata de colunas, sem editor nem retirada', async () => {
    expect(await colunas('evidencia_publica')).toEqual([
      'id', 'promessa_id', 'tipo', 'fonte_url', 'descricao', 'data_fato', 'criado_em', 'ato_id', 'ato_titulo', 'ato_url_dou',
    ]);
    for (const col of ['criado_por', 'retirada_em', 'retirada_por', 'retirada_nota']) {
      const e = await erroDe(anon(`select ${col} from evidencia_publica`));
      expect({ col, code: e.code }).toEqual({ col, code: '42703' });
    }
  });

  it('evidencia_publica traz titulo e link do ato so quando o ato esta publicado, e esconde as retiradas', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const publicado = await publicarAto('2027-03-01', 'Decreto das creches');
    const naoPublicado = await inserirAto(b, '2027-03-02');
    const retiradoAto = await inserirAto(b, '2027-03-03');
    await evidenciaDeAto(promessaId, publicado);
    await evidenciaDeAto(promessaId, naoPublicado);
    const evRetirada = await evidenciaDeAto(promessaId, retiradoAto);
    await ed('select retirar_evidencia($1::uuid, $2)', [evRetirada, 'Ato errado.']);
    const [{ url_dou: urlNaoPublicado }] = await b.dono<{ url_dou: string }>('select url_dou from ato where id = $1::uuid', [naoPublicado]);
    const [{ url_dou: urlRetirado }] = await b.dono<{ url_dou: string }>('select url_dou from ato where id = $1::uuid', [retiradoAto]);
    const linhas = await anon<{ ato_id: string | null; ato_titulo: string | null; ato_url_dou: string | null; fonte_url: string | null; data_fato: string }>(
      `select ato_id, ato_titulo, ato_url_dou, fonte_url, data_fato::text, tipo::text, descricao, criado_em
         from evidencia_publica where promessa_id = $1::uuid order by data_fato`,
      [promessaId],
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ ato_id: publicado, ato_titulo: 'Decreto das creches', data_fato: '2027-03-01' });
    expect(linhas[0].ato_url_dou).toMatch(/^https:\/\//);
    expect(linhas[0].fonte_url).toBe(linhas[0].ato_url_dou);
    // Ato nao publicado: nem titulo, nem ato_id, nem o link (fonte_url de evidencia de ato e o link do proprio ato).
    expect(linhas[1]).toMatchObject({ ato_id: null, ato_titulo: null, ato_url_dou: null, fonte_url: null, data_fato: '2027-03-02' });
    const texto = JSON.stringify(linhas);
    expect(texto).not.toContain(urlNaoPublicado);
    expect(texto).not.toContain(urlRetirado);
    expect(texto).not.toContain(naoPublicado);
    expect(texto).not.toContain('Ato errado.');
  });

  it('evidencia que nao e de ato mantem a fonte_url', async () => {
    const { promessaId } = await criarPromessa(b, true);
    await ed(`select registrar_evidencia($1::uuid, 'documento', 'https://www.gov.br/doc-visivel.pdf', 'Relatorio', '2027-02-01', null)`, [promessaId]);
    const [e] = await anon<{ fonte_url: string }>('select fonte_url from evidencia_publica where promessa_id = $1::uuid', [promessaId]);
    expect(e.fonte_url).toBe('https://www.gov.br/doc-visivel.pdf');
  });

  it('evidencia retirada nunca aparece, nem de ato publicado', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await publicarAto('2027-03-10', 'Decreto retratado');
    const ev = await evidenciaDeAto(promessaId, ato);
    expect(await anon('select id from evidencia_publica where promessa_id = $1::uuid', [promessaId])).toHaveLength(1);
    await ed('select retirar_evidencia($1::uuid, $2)', [ev, 'Retratacao.']);
    expect(await anon('select id from evidencia_publica where promessa_id = $1::uuid', [promessaId])).toEqual([]);
  });
});

describe('ato_publico.n_promessas', () => {
  it('fica no fim da lista de colunas da 0002', async () => {
    expect(await colunas('ato_publico')).toEqual([
      'id', 'tipo', 'numero', 'orgao', 'data_dou', 'secao', 'edicao_extra', 'titulo', 'resumo', 'url_dou', 'publicado_em',
      'tema_nome', 'tema_slug', 'correcao_nota', 'corrigido_em', 'n_promessas',
    ]);
    const tipos = await b.dono<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'ato_publico' and column_name in ('titulo', 'data_dou', 'n_promessas')`,
    );
    expect(Object.fromEntries(tipos.map((t) => [t.column_name, t.data_type]))).toEqual({ titulo: 'text', data_dou: 'date', n_promessas: 'integer' });
  });

  it('conta so vinculos confirmados com promessas publicadas; retirar a evidencia descontabiliza', async () => {
    const ato = await publicarAto('2027-04-01', 'Decreto do SUS');
    const a = await criarPromessa(b, true);
    const c = await criarPromessa(b, true);
    const d = await criarPromessa(b, true);
    await evidenciaDeAto(a.promessaId, ato);
    const evD = await evidenciaDeAto(d.promessaId, ato);
    await b.como(
      'service_role',
      null,
      `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
       values ($1::uuid, $2::uuid, 'ia', 'sugerido', 'Talvez relacionado.', 'm', 'v')`,
      [ato, c.promessaId],
    );
    const n = async () => (await anon<{ n_promessas: number }>('select n_promessas from ato_publico where id = $1::uuid', [ato]))[0].n_promessas;
    expect(await n()).toBe(2);
    await ed('select retirar_evidencia($1::uuid, $2)', [evD, 'Nao trata desta promessa.']);
    expect(await n()).toBe(1);
    await ed('select retirar_promessa($1::uuid, $2)', [a.promessaId, 'Sai do ar.']);
    expect(await n()).toBe(0);
  });

  it('vinculo confirmado sem evidencia ativa nao conta (defesa em profundidade)', async () => {
    const ato = await publicarAto('2027-04-05', 'Decreto sem evidencia');
    const a = await criarPromessa(b, true);
    // Vinculo 'confirmado' montado direto, com a flag ligada e sem evidencia: nao pode aparecer no contador.
    await b.comFlag(
      `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, decidido_por, decidido_em)
       values ($1::uuid, $2::uuid, 'editor', 'confirmado', 'Sem evidencia.', $3::uuid, now())`,
      [ato, a.promessaId, EDITOR],
    );
    const [r] = await anon<{ n_promessas: number }>('select n_promessas from ato_publico where id = $1::uuid', [ato]);
    expect(r.n_promessas).toBe(0);
  });
});

describe('o publico so le as visoes', () => {
  it('privilegios das visoes', async () => {
    for (const v of ['promessa_publica', 'historico_status_publico', 'evidencia_publica']) {
      for (const [papel, priv, esperado] of [
        ['anon', 'SELECT', true],
        ['authenticated', 'SELECT', true],
        ['anon', 'INSERT', false],
        ['anon', 'UPDATE', false],
        ['anon', 'DELETE', false],
        ['authenticated', 'INSERT', false],
        ['service_role', 'SELECT', false],
      ] as const) {
        const [r] = await b.dono<{ ok: boolean }>('select has_table_privilege($1, $2, $3) as ok', [papel, v, priv]);
        expect({ v, papel, priv, ok: r.ok }).toEqual({ v, papel, priv, ok: esperado });
      }
    }
  });

  it('as visoes nao usam security_invoker (direitos do dono, de proposito)', async () => {
    const r = await b.dono<{ relname: string; opcoes: string[] | null }>(
      `select relname, reloptions as opcoes from pg_class
        where relname in ('promessa_publica', 'historico_status_publico', 'evidencia_publica', 'ato_publico')`,
    );
    expect(r).toHaveLength(4);
    for (const v of r) {
      expect({ v: v.relname, invoker: (v.opcoes ?? []).some((o) => o.startsWith('security_invoker')) }).toEqual({ v: v.relname, invoker: false });
    }
  });

  it('anon nao le as tabelas novas (permission denied)', async () => {
    const consultas: Record<string, string> = {
      plano: 'select id from plano',
      plano_pagina: 'select plano_id from plano_pagina',
      promessa_candidata: 'select id from promessa_candidata',
      promessa: 'select id from promessa',
      evidencia: 'select id from evidencia',
      vinculo_ato_promessa: 'select id from vinculo_ato_promessa',
      proposta_status: 'select id from proposta_status',
      revisao_promessa: 'select id from revisao_promessa',
    };
    for (const [tabela, sql] of Object.entries(consultas)) {
      const e = await erroDe(anon(sql));
      expect({ tabela, code: e.code, msg: e.message }).toEqual({ tabela, code: '42501', msg: `permission denied for table ${tabela}` });
    }
  });

  it('nenhuma visao deixa vazar texto interno (IA, editor)', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const ato = await publicarAto('2027-05-01', 'Decreto de vazamento');
    await evidenciaDeAto(promessaId, ato);
    // Sugestao de IA e proposta de status pendente: justificativas nunca sao publicas.
    const outro = await publicarAto('2027-05-02', 'Outro decreto');
    await b.como(
      'service_role',
      null,
      `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
       values ($1::uuid, $2::uuid, 'ia', 'sugerido', 'JUSTIFICATIVA-IA-SECRETA', 'm', 'v')`,
      [outro, promessaId],
    );
    const [ev] = await b.dono<{ id: string }>('select id from evidencia where promessa_id = $1::uuid limit 1', [promessaId]);
    await b.como(
      'service_role',
      null,
      `insert into proposta_status (promessa_id, status_proposto, justificativa, evidencia_ids, modelo, versao_prompt)
       values ($1::uuid, 'em_andamento', 'PROPOSTA-IA-SECRETA', $2::uuid[], 'm', 'v')`,
      [promessaId, `{${ev.id}}`],
    );
    const tudo = JSON.stringify([
      await anon('select * from promessa_publica'),
      await anon('select * from historico_status_publico'),
      await anon('select * from evidencia_publica'),
      await anon('select * from ato_publico'),
    ]);
    for (const segredo of ['JUSTIFICATIVA-IA-SECRETA', 'PROPOSTA-IA-SECRETA', EDITOR, 'Editora de teste']) {
      expect({ segredo, achou: tudo.includes(segredo) }).toEqual({ segredo, achou: false });
    }
  });
});
