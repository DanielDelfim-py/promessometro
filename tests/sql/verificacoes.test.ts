import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, MIGRACOES, semearEditor, semearPlano, type Banco } from './banco';

const PASTA = path.resolve(import.meta.dirname, '..', '..', 'supabase', 'verificacoes');
const conferir0003 = readFileSync(path.join(PASTA, '0003_conferir.sql'), 'utf8');
const conferirPlano = readFileSync(path.join(PASTA, 'plano_conferir.sql'), 'utf8');

let completo: Banco;
let semA0003: Banco;
beforeAll(async () => {
  // hoje_sp() real (sem a data fixa dos testes): o arquivo compara com a data de hoje do servidor.
  completo = await criarBanco(MIGRACOES, null);
  semA0003 = await criarBanco(['0001_schema.sql', '0002_correcoes.sql']);
  await semearEditor(completo);
}, 120_000);
afterAll(async () => {
  await completo?.fechar();
  await semA0003?.fechar();
});

describe('supabase/verificacoes/0003_conferir.sql', () => {
  it('com a 0003 aplicada: uma linha, todas as colunas true', async () => {
    const linhas = await completo.dono<Record<string, boolean>>(conferir0003);
    expect(linhas).toHaveLength(1);
    const colunas = Object.entries(linhas[0]);
    expect(colunas.length).toBe(14);
    expect(linhas[0].hoje_sp_ok).toBe(true);
    expect(colunas.filter(([, v]) => v !== true)).toEqual([]);
  });

  it('sem a 0003: nao da erro e mostra migracao_aplicada = false', async () => {
    const [l] = await semA0003.dono<Record<string, boolean>>(conferir0003);
    expect(l.migracao_aplicada).toBe(false);
    expect(l.oito_tabelas).toBe(false);
    expect(l.hoje_sp_ok).toBe(false);
    expect(Object.values(l).every((v) => v === false)).toBe(true);
  });
});

describe('supabase/verificacoes/plano_conferir.sql', () => {
  it('sem a 0003: nao da erro, uma linha de zeros', async () => {
    const linhas = await semA0003.dono<Record<string, unknown>>(conferirPlano);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0].planos_importados)).toBe(0);
    expect(Number(linhas[0].candidatas)).toBe(0);
    expect(linhas[0].titulo).toBeNull();
  });

  it('sem plano: uma linha com zero planos', async () => {
    const linhas = await completo.dono<{ planos_importados: number; titulo: string | null }>(conferirPlano);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0].planos_importados)).toBe(0);
    expect(linhas[0].titulo).toBeNull();
  });

  it('depois de importar: paginas e candidatas por concretude', async () => {
    await semearPlano(completo);
    const r = await completo.dono<Record<string, unknown>>(conferirPlano);
    expect(r).toHaveLength(1);
    const n = (k: string) => Number(r[0][k]);
    expect(r[0].titulo).toBe('Plano de teste');
    expect(n('planos_importados')).toBe(1);
    expect(n('paginas_no_pdf')).toBe(2);
    expect(n('paginas_gravadas')).toBe(2);
    expect(n('candidatas')).toBe(2);
    expect(n('concretas')).toBe(1);
    expect(n('intermediarias')).toBe(1);
    expect(n('aceitas')).toBe(0);
  });
});

describe('supabase/verificacoes: seguranca do texto', () => {
  it('nenhuma palavra que dispara o aviso de operacao destrutiva (nem em comentarios)', () => {
    for (const [nome, texto] of [['0003_conferir.sql', conferir0003], ['plano_conferir.sql', conferirPlano]]) {
      const achadas = texto.match(/truncate|drop|delete|update|insert|alter|grant|revoke/gi) ?? [];
      expect({ nome, achadas }).toEqual({ nome, achadas: [] });
    }
  });
});

describe('supabase/verificacoes/0003_conferir.sql: cada coluna consegue virar false', () => {
  const mutacoes: [string, string, string][] = [
    ['chave_nao_muda_promessa', 'update em promessa', 'grant update on promessa to service_role'],
    ['chave_nao_le_historico', 'select em revisao_promessa', 'grant select on revisao_promessa to service_role'],
    ['chave_nao_grava_plano_direto', 'insert em plano', 'grant insert on plano to service_role'],
    ['chave_nao_grava_evidencia', 'insert em evidencia', 'grant insert on evidencia to service_role'],
    ['so_a_chave_importa', 'sem execute para service_role', 'revoke execute on function importar_plano(jsonb, jsonb, jsonb) from service_role'],
    ['so_a_chave_importa', 'execute para anon', 'grant execute on function importar_plano(jsonb, jsonb, jsonb) to anon'],
    ['publico_nao_le_promessa', 'select de anon em promessa', 'grant select on promessa to anon'],
    ['rls_ligada', 'rls desligada em promessa', 'alter table promessa disable row level security'],
  ];
  // GRANT/REVOKE/ALTER sao transacionais no Postgres: cada mutacao roda numa transacao que e desfeita.
  const DESFAZER = new Error('desfazer');
  async function comMutacao(b: Banco, sql: string): Promise<Record<string, boolean>> {
    let linha: Record<string, boolean> | undefined;
    try {
      await b.db.transaction(async (tx) => {
        await tx.exec(sql);
        linha = (await tx.query<Record<string, boolean>>(conferir0003)).rows[0];
        throw DESFAZER;
      });
    } catch (e) {
      if (e !== DESFAZER) throw e;
    }
    return linha!;
  }

  it.each(mutacoes)('%s vira false com: %s', async (coluna, _desc, sql) => {
    const l = await comMutacao(completo, sql);
    expect(l[coluna]).toBe(false);
    expect(Object.entries(l).filter(([k, v]) => v !== true && k !== coluna)).toEqual([]);
  });

  it('as mutacoes foram desfeitas: o banco continua todo true', async () => {
    const [l] = await completo.dono<Record<string, boolean>>(conferir0003);
    expect(Object.entries(l).filter(([, v]) => v !== true)).toEqual([]);
  });
});
