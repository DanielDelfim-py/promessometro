import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CITACAO_1, criarBanco, criarPromessa, EDITOR, erroDe, INTRUSO, semearEditor, semearPlano, temaId, type Banco } from './banco';

let b: Banco;
beforeAll(async () => {
  b = await criarBanco();
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

const ed = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => b.como<T>('authenticated', EDITOR, sql, params);

async function revisoes(promessaId: string) {
  return b.dono<{ decisao: string; status_antes: string; status_depois: string; nota: string | null; editor_id: string; titulo_antes: string; titulo_depois: string }>(
    `select decisao::text, status_antes::text, status_depois::text, nota, editor_id,
            valores_antes->>'titulo' as titulo_antes, valores_depois->>'titulo' as titulo_depois
       from revisao_promessa where promessa_id = $1::uuid order by criado_em, id`,
    [promessaId],
  );
}

async function promessa(id: string) {
  const [p] = await b.dono<{ titulo: string; estado: string; status: string; publicada_em: string | null; correcao_nota: string | null; corrigido_em: string | null }>(
    'select titulo, estado::text, status::text, publicada_em::text, correcao_nota, corrigido_em::text from promessa where id = $1::uuid',
    [id],
  );
  return p;
}

describe('aceitar, descartar e reabrir candidata', () => {
  it('editor aceita: nasce promessa em rascunho, nao iniciada, com a citacao literal e a fonte do plano', async () => {
    const { planoId, candidatas } = await semearPlano(b);
    const tema = await temaId(b, 'educacao');
    const [r] = await ed<{ id: string }>('select aceitar_candidata($1::uuid, $2, $3::uuid) as id', [candidatas[0], '  Construir 500 creches  ', tema]);
    const [p] = await b.dono(
      `select titulo, texto_original, pagina, status::text, estado::text, mandato, fonte_url, plano_id, correcao_nota
         from promessa where id = $1::uuid`,
      [r.id],
    );
    expect(p).toEqual({
      titulo: 'Construir 500 creches',
      texto_original: CITACAO_1,
      pagina: 1,
      status: 'nao_iniciada',
      estado: 'rascunho',
      mandato: '2027-2030',
      fonte_url: 'https://www.tse.jus.br/plano.pdf',
      plano_id: planoId,
      correcao_nota: null,
    });
    const [c] = await b.dono('select estado::text, promessa_id, decidido_por from promessa_candidata where id = $1::uuid', [candidatas[0]]);
    expect(c).toEqual({ estado: 'aceita', promessa_id: r.id, decidido_por: EDITOR });
  });

  it('candidata decidida nao e aceita nem descartada de novo', async () => {
    const { candidatas } = await semearPlano(b);
    const tema = await temaId(b, 'saude');
    await ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], 'T', tema]);
    expect((await erroDe(ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], 'T', tema]))).message).toContain('candidata ja decidida');
    await ed('select descartar_candidata($1::uuid)', [candidatas[1]]);
    const [c] = await b.dono('select estado::text, decidido_por from promessa_candidata where id = $1::uuid', [candidatas[1]]);
    expect(c).toEqual({ estado: 'descartada', decidido_por: EDITOR });
    expect((await erroDe(ed('select descartar_candidata($1::uuid)', [candidatas[1]]))).message).toContain('candidata ja decidida');
  });

  it('reabrir desfaz o descarte; candidata aceita ou pendente nao e reaberta', async () => {
    const { candidatas } = await semearPlano(b);
    const tema = await temaId(b, 'saude');
    await ed('select descartar_candidata($1::uuid)', [candidatas[1]]);
    await ed('select reabrir_candidata($1::uuid)', [candidatas[1]]);
    const [c] = await b.dono('select estado::text, decidido_por, decidido_em from promessa_candidata where id = $1::uuid', [candidatas[1]]);
    expect(c).toEqual({ estado: 'pendente', decidido_por: null, decidido_em: null });
    expect((await erroDe(ed('select reabrir_candidata($1::uuid)', [candidatas[1]]))).message).toContain('so e possivel reabrir candidata descartada');
    await ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], 'T', tema]);
    expect((await erroDe(ed('select reabrir_candidata($1::uuid)', [candidatas[0]]))).message).toContain('so e possivel reabrir candidata descartada');
    expect((await erroDe(b.como('authenticated', INTRUSO, 'select reabrir_candidata($1::uuid)', [candidatas[1]]))).message).toContain('sem permissao');
  });

  it('valida titulo e tema', async () => {
    const { candidatas } = await semearPlano(b);
    const tema = await temaId(b, 'saude');
    expect((await erroDe(ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], '   ', tema]))).message).toContain('titulo e tema sao obrigatorios');
    expect((await erroDe(ed('select aceitar_candidata($1::uuid, $2, null)', [candidatas[0], 'T']))).message).toContain('titulo e tema sao obrigatorios');
    expect(
      (await erroDe(ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], 'T', '00000000-0000-4000-8000-000000000000']))).message,
    ).toContain('titulo e tema sao obrigatorios');
    expect((await erroDe(ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', [candidatas[0], 'x'.repeat(141), tema]))).message).toContain('titulo acima do limite');
    expect(
      (await erroDe(ed('select aceitar_candidata($1::uuid, $2, $3::uuid)', ['00000000-0000-4000-8000-000000000000', 'T', tema]))).message,
    ).toContain('candidata nao encontrada');
  });
});

describe('publicar_promessa, retirar_promessa e editar_promessa', () => {
  it('publica, registra e nao publica duas vezes', async () => {
    const { promessaId } = await criarPromessa(b);
    await ed('select publicar_promessa($1::uuid, null)', [promessaId]);
    const p = await promessa(promessaId);
    expect(p.estado).toBe('publicada');
    expect(p.publicada_em).not.toBeNull();
    expect(await revisoes(promessaId)).toEqual([
      { decisao: 'publicou', status_antes: 'nao_iniciada', status_depois: 'nao_iniciada', nota: null, editor_id: EDITOR, titulo_antes: 'Construir 500 creches', titulo_depois: 'Construir 500 creches' },
    ]);
    expect((await erroDe(ed('select publicar_promessa($1::uuid, null)', [promessaId]))).message).toContain('promessa ja publicada');
  });

  it('retirar exige nota; republicar exige nota e mantem a data da primeira publicacao', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const antes = (await promessa(promessaId)).publicada_em;
    expect((await erroDe(ed('select retirar_promessa($1::uuid, $2)', [promessaId, '  ']))).message).toContain('nota e obrigatoria para retirar');
    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Trecho nao e promessa.']);
    expect((await promessa(promessaId)).estado).toBe('retirada');
    expect((await erroDe(ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'de novo']))).message).toContain('promessa ja retirada');
    expect((await erroDe(ed('select publicar_promessa($1::uuid, null)', [promessaId]))).message).toContain('nota e obrigatoria para republicar');
    await ed('select publicar_promessa($1::uuid, $2)', [promessaId, 'Revisado, volta ao ar.']);
    const depois = await promessa(promessaId);
    expect(depois.estado).toBe('publicada');
    expect(depois.publicada_em).toBe(antes);
    expect((await revisoes(promessaId)).map((r) => [r.decisao, r.nota])).toEqual([
      ['publicou', null],
      ['retirou', 'Trecho nao e promessa.'],
      ['republicou', 'Revisado, volta ao ar.'],
    ]);
  });

  it('rascunho pode ser retirado e, se publicado depois, conta como primeira publicacao', async () => {
    const { promessaId } = await criarPromessa(b);
    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Duplicada.']);
    await ed('select publicar_promessa($1::uuid, null)', [promessaId]);
    expect((await revisoes(promessaId)).map((r) => r.decisao)).toEqual(['retirou', 'publicou']);
  });

  it('editar: rascunho sem nota; publicada exige nota; retirada nao edita; sem mudanca nao registra', async () => {
    const { promessaId } = await criarPromessa(b);
    const saude = await temaId(b, 'saude');
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, null)', [promessaId, 'Novo titulo', saude]);
    expect((await promessa(promessaId)).titulo).toBe('Novo titulo');
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, null)', [promessaId, 'Novo titulo', saude]);
    expect((await revisoes(promessaId)).map((r) => r.decisao)).toEqual(['alterou_texto']);

    await ed('select publicar_promessa($1::uuid, null)', [promessaId]);
    expect(
      (await erroDe(ed('select editar_promessa($1::uuid, $2, $3::uuid, null)', [promessaId, 'Outro', saude]))).message,
    ).toContain('nota e obrigatoria para alterar promessa publicada');
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Outro', saude, 'Titulo mais fiel ao texto.']);
    const ultima = (await revisoes(promessaId)).at(-1)!;
    expect(ultima).toMatchObject({ decisao: 'alterou_texto', titulo_antes: 'Novo titulo', titulo_depois: 'Outro', nota: 'Titulo mais fiel ao texto.' });
    expect(
      (await erroDe(ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Outro 2', saude, 'x'.repeat(501)]))).message,
    ).toContain('nota acima do limite');

    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Sai do ar.']);
    expect(
      (await erroDe(ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'X', saude, 'nota']))).message,
    ).toContain('promessa retirada nao pode ser alterada');
  });

  it('correcao de promessa publicada grava a nota publica; editar rascunho, publicar e retirar zeram', async () => {
    const { promessaId } = await criarPromessa(b);
    const saude = await temaId(b, 'saude');
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Rascunho editado', saude, 'nota interna']);
    expect((await promessa(promessaId)).correcao_nota).toBeNull();

    await ed('select publicar_promessa($1::uuid, null)', [promessaId]);
    await ed('select editar_promessa($1::uuid, $2, $3::uuid, $4)', [promessaId, 'Titulo corrigido', saude, '  Titulo trocava o sentido.  ']);
    const corrigida = await promessa(promessaId);
    expect(corrigida.correcao_nota).toBe('Titulo trocava o sentido.');
    expect(corrigida.corrigido_em).not.toBeNull();

    await ed('select retirar_promessa($1::uuid, $2)', [promessaId, 'Sai do ar.']);
    expect((await promessa(promessaId)).correcao_nota).toBeNull();
    await ed('select publicar_promessa($1::uuid, $2)', [promessaId, 'Volta.']);
    const republicada = await promessa(promessaId);
    expect(republicada.correcao_nota).toBeNull();
    expect(republicada.corrigido_em).toBeNull();
  });

  it('promessa inexistente', async () => {
    const zero = '00000000-0000-4000-8000-000000000000';
    expect((await erroDe(ed('select publicar_promessa($1::uuid, null)', [zero]))).message).toContain('promessa nao encontrada');
    expect((await erroDe(ed('select retirar_promessa($1::uuid, $2)', [zero, 'n']))).message).toContain('promessa nao encontrada');
  });
});

describe('so o editor executa as funcoes do cadastro', () => {
  const FUNCOES = [
    'aceitar_candidata(uuid, text, uuid)',
    'descartar_candidata(uuid)',
    'reabrir_candidata(uuid)',
    'editar_promessa(uuid, text, uuid, text)',
    'publicar_promessa(uuid, text)',
    'retirar_promessa(uuid, text)',
  ];

  it('execute so para authenticated', async () => {
    for (const f of FUNCOES) {
      for (const [papel, esperado] of [['anon', false], ['service_role', false], ['authenticated', true]] as const) {
        const [r] = await b.dono<{ ok: boolean }>('select has_function_privilege($1, $2, $3) as ok', [papel, f, 'EXECUTE']);
        expect({ f, papel, ok: r.ok }).toEqual({ f, papel, ok: esperado });
      }
    }
  });

  it('autenticado que nao e editor recebe sem permissao; anon e service_role nem executam', async () => {
    const { promessaId } = await criarPromessa(b);
    const e = await erroDe(b.como('authenticated', INTRUSO, 'select publicar_promessa($1::uuid, null)', [promessaId]));
    expect(e.code).toBe('42501');
    expect(e.message).toContain('sem permissao');
    expect((await erroDe(b.como('anon', null, 'select publicar_promessa($1::uuid, null)', [promessaId]))).code).toBe('42501');
    expect((await erroDe(b.como('service_role', null, 'select publicar_promessa($1::uuid, null)', [promessaId]))).code).toBe('42501');
    expect((await promessa(promessaId)).estado).toBe('rascunho');
  });
});
