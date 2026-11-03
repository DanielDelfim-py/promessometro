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
