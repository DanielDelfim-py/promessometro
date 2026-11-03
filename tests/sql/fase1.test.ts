import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, EDITOR, erroDe, inserirAto, semearEditor, temaId, type Banco } from './banco';

let b: Banco;
beforeAll(async () => {
  // Sempre o estado da Fase 1 (sem a 0003), mesmo depois que MIGRACOES ganhar a 0003.
  b = await criarBanco(['0001_schema.sql', '0002_correcoes.sql']);
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

describe('Fase 1 em Postgres real (0001 + 0002)', () => {
  it('anon nao le ato, mas le ato_publico', async () => {
    expect((await erroDe(b.como('anon', null, 'select id from ato'))).code).toBe('42501');
    expect(await b.como('anon', null, 'select id from ato_publico')).toEqual([]);
  });

  it('service_role nao insere ato ja publicado', async () => {
    const tema = await temaId(b, 'saude');
    const e = await erroDe(
      b.como(
        'service_role',
        null,
        `insert into ato (dou_id, tipo, orgao, data_dou, titulo_original, texto_original, url_dou,
                          status, titulo_publico, resumo_publico, tema_id, publicado_em)
         values ('svc-1', 'decreto', 'o', '2026-01-01', 't', 'x', 'https://x', 'publicado', 't', 'r', $1::uuid, now())`,
        [tema],
      ),
    );
    expect(e.code).toBe('42501');
  });

  it('editor publica pela funcao revisar_ato e a revisao fica gravada', async () => {
    const ato = await inserirAto(b, '2026-10-01');
    const tema = await temaId(b, 'saude');
    await b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'aprovou', 'Titulo', 'Resumo', $2::uuid, null)`, [ato, tema]);
    const [p] = await b.como<{ titulo: string }>('anon', null, 'select titulo from ato_publico where id = $1::uuid', [ato]);
    expect(p.titulo).toBe('Titulo');
    const [r] = await b.dono<{ n: number }>('select count(*)::int as n from revisao where ato_id = $1::uuid', [ato]);
    expect(r.n).toBe(1);
  });

  it('revisao e somente insercao, ate para o dono', async () => {
    expect((await erroDe(b.dono('update revisao set nota = $1', ['x']))).code).toBe('42501');
    expect((await erroDe(b.dono('delete from revisao'))).code).toBe('42501');
  });
});
