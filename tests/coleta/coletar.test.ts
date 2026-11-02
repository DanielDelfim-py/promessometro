import AdmZip from 'adm-zip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { coletar } from '@/lib/coleta/coletar';
import { xmlAto } from '../helpers/xml';

const ZIP_URL = 'https://www.in.gov.br/documents/1/2/S01102026.zip/abc?version=1.0&t=1';
const HTML = `<a href="/documents/1/2/S01102026.zip/abc?version=1.0&amp;t=1">zip</a>`;

function fakeFetch(zip: Buffer): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('base-de-dados')) return new Response(HTML, { status: 200 });
    if (u === ZIP_URL) return new Response(new Uint8Array(zip), { status: 200 });
    return new Response('nao encontrado', { status: 404 });
  }) as typeof fetch;
}

interface OpcoesFake {
  /** linhas que o banco "devolve" por lote (simula ignoreDuplicates) */
  aceitar?: (linhas: Record<string, unknown>[]) => Record<string, unknown>[];
  erroLog?: { message: string } | 'lancar';
}

function fakeSupabase(op: OpcoesFake = {}) {
  const upserts: Record<string, unknown>[][] = [];
  const execucoes: Record<string, unknown>[] = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === 'ato') {
        return {
          upsert(linhas: Record<string, unknown>[]) {
            upserts.push(linhas);
            const aceitas = op.aceitar ? op.aceitar(linhas) : linhas;
            return { select: async () => ({ data: aceitas.map((_, i) => ({ id: i })), error: null }) };
          },
        };
      }
      return {
        insert: async (linha: Record<string, unknown>) => {
          execucoes.push(linha);
          if (op.erroLog === 'lancar') throw new Error('rede caiu');
          return { error: op.erroLog ?? null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, upserts, execucoes };
}

const HOJE = new Date('2026-10-29T15:00:00Z');
const decreto = (id: string) =>
  xmlAto({
    idMateria: id,
    artType: 'Decreto numerado',
    artCategory: 'Atos do Poder Executivo',
    identifica: 'DECRETO Nº 13.131, DE 28 DE OUTUBRO DE 2026',
  });

function zipCom(arquivos: Record<string, string>): Buffer {
  const z = new AdmZip();
  for (const [nome, xml] of Object.entries(arquivos)) z.addFile(nome, Buffer.from(xml));
  return z.toBuffer();
}

describe('coletar', () => {
  it('grava so os atos relevantes e registra execucao ok', async () => {
    const zip = zipCom({
      '20261029/DO1/1.xml': decreto('1'),
      '20261029/DO1/2.xml': xmlAto({ idMateria: '2', artType: 'Despacho', artCategory: 'Ministério X' }),
      '20261029/DO1/3.xml': xmlAto({ idMateria: '3', artType: 'Portaria', artCategory: 'Ministério Y', identifica: 'PORTARIA Nº 5' }),
    });
    const { supabase, upserts, execucoes } = fakeSupabase();

    const r = await coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) });

    expect(r).toEqual({ lidos: 3, relevantes: 2, novos: 2, falhas: 0 });
    const linhas = upserts.flat();
    expect(linhas.map((l) => l.dou_id).sort()).toEqual(['1', '3']);
    expect(linhas.every((l) => l.status === 'coletado')).toBe(true);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]).toMatchObject({ status: 'ok', qtd_atos: 2, data_referencia: '2026-10-29' });
  });

  it('janela sem XML registra erro e lanca', async () => {
    const zip = zipCom({ '20250101/DO1/1.xml': xmlAto() });
    const { supabase, upserts, execucoes } = fakeSupabase();

    await expect(
      coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) }),
    ).rejects.toThrow(/nenhum XML lido/);

    expect(upserts).toHaveLength(0);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]).toMatchObject({ status: 'erro' });
  });

  it('novos conta so as linhas que o banco devolveu (duplicatas ignoradas)', async () => {
    const zip = zipCom({ '20261029/DO1/1.xml': decreto('1'), '20261029/DO1/2.xml': decreto('2'), '20261029/DO1/3.xml': decreto('3') });
    const { supabase, execucoes } = fakeSupabase({ aceitar: (l) => l.slice(0, 1) });

    const r = await coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) });

    expect(r).toMatchObject({ relevantes: 3, novos: 1 });
    expect(execucoes[0]).toMatchObject({ status: 'ok', qtd_atos: 1 });
  });

  it('dou_id duplicado no lote vira uma linha so e relevantes conta distintos', async () => {
    const zip = zipCom({ '20261029/DO1/1.xml': decreto('1'), '20261029/DO1/1b.xml': decreto('1'), '20261029/DO1/2.xml': decreto('2') });
    const { supabase, upserts } = fakeSupabase();

    const r = await coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) });

    expect(upserts.flat().map((l) => l.dou_id).sort()).toEqual(['1', '2']);
    expect(r).toMatchObject({ lidos: 3, relevantes: 2, novos: 2 });
  });

  it('falha ao registrar execucao no caminho de sucesso lanca', async () => {
    const zip = zipCom({ '20261029/DO1/1.xml': decreto('1') });
    const { supabase } = fakeSupabase({ erroLog: { message: 'permissao negada' } });

    await expect(
      coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) }),
    ).rejects.toThrow(/falha ao registrar execucao_coleta: permissao negada/);
  });

  it('falha no log (retorno ou excecao) nao mascara o erro original', async () => {
    const zip = zipCom({ '20250101/DO1/1.xml': xmlAto() });
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const erroLog of [{ message: 'log quebrou' }, 'lancar' as const]) {
      const { supabase } = fakeSupabase({ erroLog });
      await expect(
        coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(zip) }),
      ).rejects.toThrow(/nenhum XML lido/);
    }
    expect(espiao).toHaveBeenCalledTimes(2);
    espiao.mockRestore();
  });

  it('ZIP desatualizado: XMLs so mais antigos que os 4 dias mais novos', async () => {
    const zip = zipCom({ '20261024/DO1/1.xml': decreto('1') });
    const { supabase, execucoes } = fakeSupabase();

    await expect(
      coletar({ supabase, diasRetroativos: 5, hoje: HOJE, fetchFn: fakeFetch(zip) }),
    ).rejects.toThrow(/ZIP desatualizado.*mais recente lido: 20261024/);

    expect(execucoes[0]).toMatchObject({ status: 'erro' });
  });

  it('passa quando ha XML entre os 4 dias mais novos', async () => {
    const zip = zipCom({ '20261026/DO1/1.xml': decreto('1'), '20261024/DO1/2.xml': decreto('2') });
    const { supabase, execucoes } = fakeSupabase();

    const r = await coletar({ supabase, diasRetroativos: 5, hoje: HOJE, fetchFn: fakeFetch(zip) });

    expect(r.novos).toBe(2);
    expect(execucoes[0]).toMatchObject({ status: 'ok' });
  });

  it.each([-1, 1.5, Number.NaN])('rejeita diasRetroativos invalido (%s) sem registrar', async (dias) => {
    const { supabase, execucoes } = fakeSupabase();
    await expect(
      coletar({ supabase, diasRetroativos: dias, hoje: HOJE, fetchFn: fakeFetch(zipCom({})) }),
    ).rejects.toThrow('diasRetroativos invalido');
    expect(execucoes).toHaveLength(0);
  });
});
