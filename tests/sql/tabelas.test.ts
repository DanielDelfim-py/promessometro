import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CANDIDATAS_TESTE, criarBanco, EDITOR, erroDe, evidenciaDireta, importar, inserirAto, INTRUSO, planoJson, promessaDireta,
  semearEditor, semearPlano, TEXTO_P1, TEXTO_P2, type Banco,
} from './banco';

const TABELAS = [
  'plano', 'plano_pagina', 'promessa_candidata', 'promessa', 'evidencia', 'vinculo_ato_promessa', 'proposta_status', 'revisao_promessa',
];

let b: Banco;
beforeAll(async () => {
  b = await criarBanco();
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

async function pode(papel: string, tabela: string, privilegio: string): Promise<boolean> {
  const [r] = await b.dono<{ ok: boolean }>('select has_table_privilege($1, $2, $3) as ok', [papel, tabela, privilegio]);
  return r.ok;
}
const contar = async (sql: string, params: unknown[] = []) => (await b.dono<{ n: number }>(sql, params))[0].n;

describe('0003: tabelas, RLS e privilegios', () => {
  it('as oito tabelas existem com RLS ligada', async () => {
    const linhas = await b.dono<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1::text[])`,
      [`{${TABELAS.join(',')}}`],
    );
    expect(linhas).toHaveLength(8);
    expect(linhas.every((l) => l.relrowsecurity)).toBe(true);
  });

  it('anon nao tem privilegio nenhum nas tabelas novas', async () => {
    for (const t of TABELAS) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(await pode('anon', t, p)).toBe(false);
    }
  });

  it('authenticated so le (as escritas sao pelas funcoes)', async () => {
    for (const t of TABELAS) {
      expect(await pode('authenticated', t, 'SELECT')).toBe(true);
      for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) expect(await pode('authenticated', t, p)).toBe(false);
    }
  });

  it('service_role tem o minimo (sem update e sem delete em nenhuma tabela nova)', async () => {
    const esperado: Record<string, string[]> = {
      plano: ['SELECT', 'INSERT'],
      plano_pagina: ['SELECT', 'INSERT'],
      promessa_candidata: ['SELECT', 'INSERT'],
      promessa: ['SELECT'],
      evidencia: ['SELECT'],
      vinculo_ato_promessa: ['SELECT', 'INSERT'],
      proposta_status: ['SELECT', 'INSERT'],
      revisao_promessa: [],
    };
    for (const t of TABELAS) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        expect({ t, p, ok: await pode('service_role', t, p) }).toEqual({ t, p, ok: esperado[t].includes(p) });
      }
    }
  });

  it('anon e erro 42501; autenticado sem ser editor nao ve linhas', async () => {
    const { planoId } = await semearPlano(b);
    await promessaDireta(b, planoId);
    expect((await erroDe(b.como('anon', null, 'select id from promessa'))).code).toBe('42501');
    expect(await b.como('authenticated', INTRUSO, 'select id from promessa')).toEqual([]);
    expect((await b.como('authenticated', EDITOR, 'select id from promessa')).length).toBeGreaterThan(0);
  });
});

describe('0003: importar_plano (atomico)', () => {
  it('grava plano, todas as paginas e as candidatas numa chamada', async () => {
    const r = await importar(b, planoJson(), [TEXTO_P1, TEXTO_P2], CANDIDATAS_TESTE);
    expect(r).toMatchObject({ paginas: 2, candidatas: 2 });
    expect(await contar('select count(*)::int as n from plano_pagina where plano_id = $1::uuid', [r.plano_id])).toBe(2);
    expect(await contar(`select count(*)::int as n from promessa_candidata where plano_id = $1::uuid and estado = 'pendente'`, [r.plano_id])).toBe(2);
  });

  it('recusa o mesmo arquivo duas vezes', async () => {
    const plano = planoJson();
    await importar(b, plano, [TEXTO_P1, TEXTO_P2], []);
    expect((await erroDe(importar(b, plano, [TEXTO_P1, TEXTO_P2], []))).message).toContain('plano ja importado');
  });

  it('qualquer falha desfaz tudo: nada fica gravado', async () => {
    const antes = await contar('select count(*)::int as n from plano');
    const semPagina = { ...CANDIDATAS_TESTE[0], pagina: 3 };
    expect((await erroDe(importar(b, planoJson(), [TEXTO_P1, TEXTO_P2], [CANDIDATAS_TESTE[0], semPagina]))).message).toContain(
      'citacao nao encontrada na pagina',
    );
    const inventada = { ...CANDIDATAS_TESTE[0], citacao: 'Vamos construir 900 creches em cada cidade do país' };
    expect((await erroDe(importar(b, planoJson(), [TEXTO_P1, TEXTO_P2], [inventada]))).message).toContain('citacao nao encontrada na pagina');
    expect((await erroDe(importar(b, planoJson(undefined, 3), [TEXTO_P1, TEXTO_P2], []))).message).toContain('numero de paginas');
    expect(await contar('select count(*)::int as n from plano')).toBe(antes);
  });

  it('so a chave de servico executa importar_plano', async () => {
    for (const [papel, esperado] of [['service_role', true], ['authenticated', false], ['anon', false]] as const) {
      const [r] = await b.dono<{ ok: boolean }>('select has_function_privilege($1, $2, $3) as ok', [papel, 'importar_plano(jsonb, jsonb, jsonb)', 'EXECUTE']);
      expect({ papel, ok: r.ok }).toEqual({ papel, ok: esperado });
    }
    const args = [JSON.stringify(planoJson()), JSON.stringify([TEXTO_P1, TEXTO_P2]), '[]'];
    expect((await erroDe(b.como('authenticated', EDITOR, 'select importar_plano($1::jsonb, $2::jsonb, $3::jsonb)', args))).code).toBe('42501');
  });
});

describe('0003: plano, paginas e candidatas', () => {
  it('plano e paginas nunca mudam nem sao apagados', async () => {
    const { planoId } = await semearPlano(b);
    expect((await erroDe(b.como('service_role', null, `update plano set titulo = 'x' where id = $1::uuid`, [planoId]))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, 'delete from plano where id = $1::uuid', [planoId]))).code).toBe('42501');
    expect((await erroDe(b.dono(`update plano set titulo = 'x' where id = $1::uuid`, [planoId]))).code).toBe('42501');
    expect((await erroDe(b.dono('delete from plano where id = $1::uuid', [planoId]))).code).toBe('42501');
    expect((await erroDe(b.dono(`update plano_pagina set texto = 'x' where plano_id = $1::uuid`, [planoId]))).code).toBe('42501');
    expect((await erroDe(b.dono('delete from plano_pagina where plano_id = $1::uuid', [planoId]))).code).toBe('42501');
    expect((await erroDe(b.dono('delete from promessa_candidata where plano_id = $1::uuid', [planoId]))).code).toBe('42501');
  });

  it('pagina so entra dentro do numero de paginas do plano e antes das candidatas', async () => {
    const { planoId } = await semearPlano(b);
    const sql = 'insert into plano_pagina (plano_id, numero, texto) values ($1::uuid, $2, $3)';
    expect((await erroDe(b.como('service_role', null, sql, [planoId, 999, 'Prometemos uma frase inventada pela chave']))).message).toContain(
      'pagina fora do plano',
    );
    const [novo] = await b.como<{ id: string }>(
      'service_role',
      null,
      `insert into plano (titulo, candidato, cargo, ano_eleicao, fonte_url, arquivo_sha256, paginas)
       values ('t', 'c', 'p', 2026, 'https://x', repeat('e', 64), 3) returning id`,
    );
    await b.como('service_role', null, sql, [novo.id, 1, TEXTO_P1]);
    expect((await erroDe(b.como('service_role', null, sql, [novo.id, 4, 'x']))).message).toContain('pagina fora do plano');
    // plano com candidatas: nenhuma pagina nova, nem dentro do limite
    const r = await importar(b, planoJson(undefined, 2), [TEXTO_P1, TEXTO_P2], CANDIDATAS_TESTE);
    expect(r.candidatas).toBe(2);
    expect((await erroDe(b.como('service_role', null, sql, [r.plano_id, 2, 'outra']))).code).toBe('42501');
  });

  it('citacao com espacos e quebras de linha diferentes da pagina e aceita (checagem de consistencia)', async () => {
    const r = await importar(b, planoJson(), [TEXTO_P1, TEXTO_P2], [
      { ...CANDIDATAS_TESTE[0], citacao: 'Vamos  construir 500\nnovas creches em todo o país' },
    ]);
    expect(r.candidatas).toBe(1);
  });

  it('service_role nao insere candidata ja decidida nem altera candidata', async () => {
    const { planoId, candidatas } = await semearPlano(b);
    const e = await erroDe(
      b.como(
        'service_role',
        null,
        `insert into promessa_candidata (plano_id, pagina, citacao, titulo_sugerido, tema_sugerido, modelo, versao_prompt, estado)
         values ($1::uuid, 1, $2, 't', 'educacao', 'm', 'v', 'descartada')`,
        [planoId, 'Vamos construir 500 novas creches'],
      ),
    );
    expect(e.code).toBe('42501');
    const u = await erroDe(b.como('service_role', null, `update promessa_candidata set titulo_sugerido = 'x' where id = $1::uuid`, [candidatas[0]]));
    expect(u.code).toBe('42501');
  });
});

describe('0003: promessa so muda pelas funcoes', () => {
  it('nem o dono insere ou altera promessa sem a flag; ninguem apaga', async () => {
    const { planoId } = await semearPlano(b);
    const semFlag = await erroDe(
      b.dono(
        `insert into promessa (plano_id, tema_id, titulo, texto_original, pagina, fonte_url)
         select $1::uuid, id, 't', 'x', 1, 'https://x' from tema where slug = 'saude'`,
        [planoId],
      ),
    );
    expect(semFlag.code).toBe('42501');

    const id = await promessaDireta(b, planoId);
    expect((await erroDe(b.dono(`update promessa set status = 'cumprida' where id = $1::uuid`, [id]))).code).toBe('42501');
    expect((await erroDe(b.dono(`update promessa set estado = 'publicada', publicada_em = now() where id = $1::uuid`, [id]))).code).toBe('42501');
    expect((await erroDe(b.dono(`update promessa set correcao_nota = 'x', corrigido_em = now() where id = $1::uuid`, [id]))).code).toBe('42501');
    expect((await erroDe(b.comFlag('delete from promessa where id = $1::uuid', [id]))).code).toBe('42501');
    expect((await erroDe(b.dono('truncate promessa cascade'))).code).toBe('42501');
  });

  it('nota de correcao nunca nasce no insert, nem com a flag', async () => {
    const { planoId } = await semearPlano(b);
    const e = await erroDe(
      b.comFlag(
        `insert into promessa (plano_id, tema_id, titulo, texto_original, pagina, fonte_url, correcao_nota, corrigido_em)
         select $1::uuid, id, 't', 'x', 1, 'https://x', 'semeada', now() from tema where slug = 'saude'`,
        [planoId],
      ),
    );
    expect(e.code).toBe('42501');
    expect(e.message).toContain('correcao so pode ser registrada');
  });

  it('service_role nao altera status nem estado', async () => {
    const { planoId } = await semearPlano(b);
    const id = await promessaDireta(b, planoId);
    expect((await erroDe(b.como('service_role', null, `update promessa set status = 'cumprida' where id = $1::uuid`, [id]))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, `update promessa set estado = 'retirada' where id = $1::uuid`, [id]))).code).toBe('42501');
  });
});

describe('0003: evidencia e revisao_promessa', () => {
  it('evidencia: so nasce com a flag, data >= 2027-01-01; so admite a retratacao; nunca e apagada', async () => {
    const { planoId } = await semearPlano(b);
    const p = await promessaDireta(b, planoId, 'publicada');
    const semFlag = await erroDe(
      b.dono(
        `insert into evidencia (promessa_id, tipo, fonte_url, descricao, data_fato, criado_por)
         values ($1::uuid, 'documento', 'https://x', 'd', '2027-02-01', $2::uuid)`,
        [p, EDITOR],
      ),
    );
    expect(semFlag.code).toBe('42501');
    const antesDoCorte = await erroDe(evidenciaDireta(b, p, '2026-12-31'));
    expect(antesDoCorte.code).toBe('23514');
    expect(antesDoCorte.message).toContain('evidencia_data_corte');
    const http = await erroDe(
      b.comFlag(
        `insert into evidencia (promessa_id, tipo, fonte_url, descricao, data_fato, criado_por)
         values ($1::uuid, 'documento', 'http://x', 'd', '2027-02-01', $2::uuid)`,
        [p, EDITOR],
      ),
    );
    expect(http.code).toBe('23514');
    const id = await evidenciaDireta(b, p, '2027-01-01');
    expect((await erroDe(b.comFlag(`update evidencia set descricao = 'x' where id = $1::uuid`, [id]))).code).toBe('42501');
    expect((await erroDe(b.dono(`update evidencia set retirada_em = now(), retirada_por = $2::uuid, retirada_nota = 'x' where id = $1::uuid`, [id, EDITOR]))).code).toBe('42501');
    expect((await erroDe(b.comFlag('delete from evidencia where id = $1::uuid', [id]))).code).toBe('42501');
    expect((await erroDe(b.dono('truncate evidencia'))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, `update evidencia set descricao = 'x'`))).code).toBe('42501');
    // a retratacao (com a flag) so preenche as colunas de retirada, uma vez
    await b.comFlag(`update evidencia set retirada_em = now(), retirada_por = $2::uuid, retirada_nota = 'erro' where id = $1::uuid`, [id, EDITOR]);
    expect((await erroDe(b.comFlag(`update evidencia set retirada_nota = 'outra' where id = $1::uuid`, [id]))).code).toBe('42501');
  });

  it('revisao_promessa: service_role nao le nem grava; ninguem altera', async () => {
    const { planoId } = await semearPlano(b);
    const p = await promessaDireta(b, planoId);
    expect((await erroDe(b.como('service_role', null, 'select id from revisao_promessa'))).code).toBe('42501');
    const ins = `insert into revisao_promessa (promessa_id, editor_id, decisao, status_antes, status_depois, valores_antes, valores_depois)
                 values ($1::uuid, $2::uuid, 'publicou', 'nao_iniciada', 'nao_iniciada', '{}', '{}')`;
    expect((await erroDe(b.como('service_role', null, ins, [p, EDITOR]))).code).toBe('42501');
    expect((await erroDe(b.dono(ins, [p, EDITOR]))).code).toBe('42501');
    await b.comFlag(ins, [p, EDITOR]);
    expect((await erroDe(b.comFlag(`update revisao_promessa set nota = 'x'`))).code).toBe('42501');
    expect((await erroDe(b.comFlag('delete from revisao_promessa'))).code).toBe('42501');
    expect((await erroDe(b.dono('truncate revisao_promessa'))).code).toBe('42501');
  });
});

describe('0003: vinculos e propostas gravados pela IA', () => {
  it('service_role so sugere vinculo de ato de 2027 com promessa publicada', async () => {
    const { planoId } = await semearPlano(b);
    const publicada = await promessaDireta(b, planoId, 'publicada');
    const rascunho = await promessaDireta(b, planoId);
    const ato2027 = await inserirAto(b, '2027-02-10');
    const ato2026 = await inserirAto(b, '2026-12-30');
    const sql = `insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, modelo, versao_prompt)
                 values ($1::uuid, $2::uuid, 'ia', $3::estado_vinculo, 'trata do mesmo tema', 'm', 'v')`;
    await b.como('service_role', null, sql, [ato2027, publicada, 'sugerido']);
    expect((await erroDe(b.como('service_role', null, sql, [ato2027, publicada, 'sugerido']))).code).toBe('23505');
    const outroAto = await inserirAto(b, '2027-02-11');
    expect((await erroDe(b.como('service_role', null, sql, [outroAto, publicada, 'confirmado']))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, sql, [ato2026, publicada, 'sugerido']))).message).toContain('ato anterior a data de corte');
    expect((await erroDe(b.como('service_role', null, sql, [outroAto, rascunho, 'sugerido']))).message).toContain('promessa nao publicada');
    expect((await erroDe(b.como('service_role', null, `update vinculo_ato_promessa set estado = 'confirmado'`))).code).toBe('42501');
  });

  it('proposta: so pendente, com evidencia ativa da propria promessa, e a nova substitui a anterior', async () => {
    const { planoId } = await semearPlano(b);
    const p = await promessaDireta(b, planoId, 'publicada');
    const outra = await promessaDireta(b, planoId, 'publicada');
    const ev = await evidenciaDireta(b, p);
    const evOutra = await evidenciaDireta(b, outra);
    const evRetirada = await evidenciaDireta(b, p, '2027-02-02');
    await b.comFlag(`update evidencia set retirada_em = now(), retirada_por = $2::uuid, retirada_nota = 'erro' where id = $1::uuid`, [evRetirada, EDITOR]);
    const sql = `insert into proposta_status (promessa_id, status_proposto, justificativa, evidencia_ids, modelo, versao_prompt, estado)
                 values ($1::uuid, $2::status_promessa, 'ha ato oficial', $3::uuid[], 'm', 'v', $4::estado_proposta) returning id`;
    const [p1] = await b.como<{ id: string }>('service_role', null, sql, [p, 'em_andamento', `{${ev}}`, 'pendente']);
    const [p2] = await b.como<{ id: string }>('service_role', null, sql, [p, 'parcialmente_cumprida', `{${ev}}`, 'pendente']);
    const estados = await b.dono<{ id: string; estado: string }>('select id, estado::text from proposta_status where promessa_id = $1::uuid', [p]);
    expect(estados.find((e) => e.id === p1.id)?.estado).toBe('substituida');
    expect(estados.find((e) => e.id === p2.id)?.estado).toBe('pendente');

    expect((await erroDe(b.como('service_role', null, sql, [p, 'cumprida', `{${ev}}`, 'aprovada']))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, sql, [p, 'cumprida', `{${evOutra}}`, 'pendente']))).message).toContain('evidencia invalida');
    expect((await erroDe(b.como('service_role', null, sql, [p, 'cumprida', `{${evRetirada}}`, 'pendente']))).message).toContain('evidencia invalida');
    expect((await erroDe(b.como('service_role', null, sql, [p, 'nao_iniciada', `{${ev}}`, 'pendente']))).message).toContain('status igual ao atual');
    // a guarda roda antes do CHECK proposta_tem_evidencia, por isso a mensagem e a da guarda
    expect((await erroDe(b.como('service_role', null, sql, [p, 'cumprida', '{}', 'pendente']))).message).toContain('evidencia invalida');
    expect((await erroDe(b.como('service_role', null, `update proposta_status set estado = 'aprovada'`))).code).toBe('42501');
    expect((await erroDe(b.dono(`update proposta_status set estado = 'aprovada' where id = $1::uuid`, [p2.id]))).code).toBe('42501');
  });
});

describe('0003: funcoes de gatilho e auxiliares', () => {
  it('ninguem executa as funcoes de gatilho nem hoje_sp/normalizar_espacos pela API', async () => {
    const FUNCOES = [
      'bloquear_alteracao_promessometro()', 'exigir_funcao_editorial()', 'guardar_plano_pagina()', 'guardar_promessa()',
      'guardar_candidata()', 'guardar_evidencia()', 'guardar_vinculo()', 'guardar_proposta()', 'normalizar_espacos(text)', 'hoje_sp()',
    ];
    for (const f of FUNCOES) {
      for (const papel of ['anon', 'authenticated', 'service_role']) {
        const [r] = await b.dono<{ ok: boolean }>('select has_function_privilege($1, $2, $3) as ok', [papel, f, 'EXECUTE']);
        expect({ f, papel, ok: r.ok }).toEqual({ f, papel, ok: false });
      }
    }
  });
});
