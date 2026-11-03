import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, EDITOR, erroDe, INTRUSO, inserirAto, semearEditor, temaId, type Banco } from './banco';

let b: Banco;
beforeAll(async () => {
  // Sempre o estado da Fase 1 (sem a 0003), mesmo depois que MIGRACOES ganhar a 0003.
  b = await criarBanco(['0001_schema.sql', '0002_correcoes.sql']);
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

/** Cria um ato novo e o publica pelo editor (dados frescos para cada teste). */
async function atoPublicado(titulo = 'Titulo'): Promise<string> {
  const ato = await inserirAto(b, '2026-10-01');
  const tema = await temaId(b, 'saude');
  await b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'aprovou', $2, 'Resumo', $3::uuid, null)`, [ato, titulo, tema]);
  return ato;
}

describe('Fase 1 em Postgres real (0001 + 0002)', () => {
  it('anon nao le ato, mas le ato_publico', async () => {
    const e = await erroDe(b.como('anon', null, 'select id from ato'));
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/permission denied for table ato/);
    expect(await b.como('anon', null, 'select id from ato_publico')).toBeInstanceOf(Array);
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
    expect(e.message).toMatch(/publicacao so e permitida pela funcao revisar_ato/);
  });

  it('service_role nao publica ato coletado por update', async () => {
    const ato = await inserirAto(b, '2026-10-02');
    const e = await erroDe(b.como('service_role', null, `update ato set status = 'publicado' where id = $1::uuid`, [ato]));
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/publicacao so e permitida pela funcao revisar_ato/);
  });

  it('service_role nao semeia correcao_nota num insert', async () => {
    const e = await erroDe(
      b.como(
        'service_role',
        null,
        `insert into ato (dou_id, tipo, orgao, data_dou, titulo_original, texto_original, url_dou, correcao_nota)
         values ('svc-2', 'decreto', 'o', '2026-01-01', 't', 'x', 'https://x', 'nota semeada')`,
      ),
    );
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/correcao so pode ser registrada pela funcao revisar_ato/);
  });

  it('editor publica pela funcao revisar_ato e a revisao fica gravada', async () => {
    const ato = await atoPublicado();
    const [p] = await b.como<{ titulo: string }>('anon', null, 'select titulo from ato_publico where id = $1::uuid', [ato]);
    expect(p.titulo).toBe('Titulo');
    const [r] = await b.dono<{ n: number }>('select count(*)::int as n from revisao where ato_id = $1::uuid', [ato]);
    expect(r.n).toBe(1);
  });

  it('autenticado que nao e editor nao ve atos e nao consegue revisar (RLS e is_editor)', async () => {
    const ato = await atoPublicado();
    const tema = await temaId(b, 'saude');
    expect(await b.como('authenticated', INTRUSO, 'select id from ato')).toEqual([]);
    const [n] = await b.como<{ n: number }>('authenticated', EDITOR, 'select count(*)::int as n from ato');
    expect(n.n).toBeGreaterThan(0);
    const e = await erroDe(
      b.como('authenticated', INTRUSO, `select revisar_ato($1::uuid, 'corrigiu', 'X', 'Y', $2::uuid, 'nota')`, [ato, tema]),
    );
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/sem permissao/);
  });

  it('guarda: ato publicado so muda com a flag app.revisando (por desenho, ate para o dono)', async () => {
    const ato = await atoPublicado();
    const e = await erroDe(b.dono(`update ato set titulo_publico = 'x' where id = $1::uuid`, [ato]));
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/ato publicado ou descartado so pode ser alterado pela funcao revisar_ato/);
    // Por desenho: dentro de funcao editorial a flag esta ligada e o mesmo update passa.
    await b.comFlag(`update ato set titulo_publico = 'x' where id = $1::uuid`, [ato]);
    const [r] = await b.dono<{ titulo_publico: string }>('select titulo_publico from ato where id = $1::uuid', [ato]);
    expect(r.titulo_publico).toBe('x');
  });

  it('ato_publico mostra so atos publicados e nao expoe texto_original nem titulo_original', async () => {
    const publicado = await atoPublicado();
    const coletado = await inserirAto(b, '2026-10-03');
    const ids = (await b.como<{ id: string }>('anon', null, 'select id from ato_publico')).map((r) => r.id);
    expect(ids).toContain(publicado);
    expect(ids).not.toContain(coletado);
    const cols = (
      await b.dono<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ato_publico'`,
      )
    ).map((c) => c.column_name);
    expect(cols).not.toContain('texto_original');
    expect(cols).not.toContain('titulo_original');
    expect(cols).toContain('correcao_nota');
    const e = await erroDe(b.como('anon', null, 'select texto_original from ato_publico'));
    expect(e.code).toBe('42703');
  });

  it('revisar_ato corrigiu: exige nota; com nota atualiza, grava correcao e mantem publicado_em', async () => {
    const ato = await atoPublicado();
    const tema2 = await temaId(b, 'educacao');
    const [antes] = await b.dono<{ publicado_em: string }>('select publicado_em::text from ato where id = $1::uuid', [ato]);

    const sem = await erroDe(
      b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'corrigiu', 'Novo', 'Novo resumo', $2::uuid, '   ')`, [ato, tema2]),
    );
    expect(sem.message).toMatch(/nota e obrigatoria/);

    await b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'corrigiu', 'Novo', 'Novo resumo', $2::uuid, '  erro de digitacao  ')`, [ato, tema2]);
    const [d] = await b.dono<{
      titulo_publico: string;
      resumo_publico: string;
      tema_id: string;
      correcao_nota: string;
      corrigido_em: string | null;
      publicado_em: string;
      status: string;
    }>(
      'select titulo_publico, resumo_publico, tema_id, correcao_nota, corrigido_em::text, publicado_em::text, status::text from ato where id = $1::uuid',
      [ato],
    );
    expect(d.status).toBe('publicado');
    expect(d.titulo_publico).toBe('Novo');
    expect(d.resumo_publico).toBe('Novo resumo');
    expect(d.tema_id).toBe(tema2);
    expect(d.correcao_nota).toBe('erro de digitacao');
    expect(d.corrigido_em).not.toBeNull();
    expect(d.publicado_em).toBe(antes.publicado_em);
  });

  it('revisar_ato despublicou: exige nota, descarta e nao repete', async () => {
    const ato = await atoPublicado();
    const tema = await temaId(b, 'saude');
    const sem = await erroDe(b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'despublicou', null, null, null, null)`, [ato]));
    expect(sem.message).toMatch(/nota e obrigatoria/);

    await b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'despublicou', null, null, null, 'publicado por engano')`, [ato]);
    const [d] = await b.dono<{ status: string; correcao_nota: string }>('select status::text, correcao_nota from ato where id = $1::uuid', [ato]);
    expect(d.status).toBe('descartado');
    expect(d.correcao_nota).toBe('publicado por engano');
    expect(await b.como('anon', null, 'select id from ato_publico where id = $1::uuid', [ato])).toEqual([]);

    const de = await erroDe(
      b.como('authenticated', EDITOR, `select revisar_ato($1::uuid, 'despublicou', null, null, $2::uuid, 'outra vez')`, [ato, tema]),
    );
    expect(de.message).toMatch(/so e possivel despublicar ato publicado/);
  });

  it('revisao e somente insercao, ate para o dono', async () => {
    await atoPublicado(); // garante pelo menos uma linha em revisao, sem depender de outro teste
    const u = await erroDe(b.dono('update revisao set nota = $1', ['x']));
    expect(u.code).toBe('42501');
    expect(u.message).toMatch(/revisao e somente insercao/);
    const d = await erroDe(b.dono('delete from revisao'));
    expect(d.code).toBe('42501');
    expect(d.message).toMatch(/revisao e somente insercao/);
  });

  it('truncate em revisao: negado por privilegio aos papeis e pelo gatilho ao dono', async () => {
    await atoPublicado();
    for (const [papel, sub] of [
      ['service_role', null],
      ['authenticated', EDITOR],
    ] as const) {
      const e = await erroDe(b.como(papel, sub, 'truncate revisao'));
      expect(e.code).toBe('42501');
      expect(e.message).toMatch(/permission denied for table revisao/);
    }
    const e = await erroDe(b.dono('truncate revisao'));
    expect(e.code).toBe('42501');
    expect(e.message).toMatch(/revisao e somente insercao/);
    const [r] = await b.dono<{ n: number }>('select count(*)::int as n from revisao');
    expect(r.n).toBeGreaterThan(0);
  });
});
