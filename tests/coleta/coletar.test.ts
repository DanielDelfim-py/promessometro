import AdmZip from 'adm-zip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
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

function fakeSupabase() {
  const upserts: Record<string, unknown>[][] = [];
  const execucoes: Record<string, unknown>[] = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === 'ato') {
        return {
          upsert(linhas: Record<string, unknown>[]) {
            upserts.push(linhas);
            return { select: async () => ({ data: linhas.map((_, i) => ({ id: i })), error: null }) };
          },
        };
      }
      return {
        insert: async (linha: Record<string, unknown>) => {
          execucoes.push(linha);
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, upserts, execucoes };
}

const HOJE = new Date('2026-10-29T15:00:00Z');

describe('coletar', () => {
  it('grava so os atos relevantes e registra execucao ok', async () => {
    const z = new AdmZip();
    z.addFile('20261029/DO1/1.xml', Buffer.from(xmlAto({ idMateria: '1', artType: 'Decreto numerado', artCategory: 'Atos do Poder Executivo', identifica: 'DECRETO Nº 13.131, DE 28 DE OUTUBRO DE 2026' })));
    z.addFile('20261029/DO1/2.xml', Buffer.from(xmlAto({ idMateria: '2', artType: 'Despacho', artCategory: 'Ministério X' })));
    z.addFile('20261029/DO1/3.xml', Buffer.from(xmlAto({ idMateria: '3', artType: 'Portaria', artCategory: 'Ministério Y', identifica: 'PORTARIA Nº 5' })));
    const { supabase, upserts, execucoes } = fakeSupabase();

    const r = await coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(z.toBuffer()) });

    expect(r).toEqual({ lidos: 3, relevantes: 2, novos: 2, falhas: 0 });
    const linhas = upserts.flat();
    expect(linhas.map((l) => l.dou_id).sort()).toEqual(['1', '3']);
    expect(linhas.every((l) => l.status === 'coletado')).toBe(true);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]).toMatchObject({ status: 'ok', qtd_atos: 2, data_referencia: '2026-10-29' });
  });

  it('janela sem XML registra erro e lanca', async () => {
    const z = new AdmZip();
    z.addFile('20250101/DO1/1.xml', Buffer.from(xmlAto()));
    const { supabase, upserts, execucoes } = fakeSupabase();

    await expect(
      coletar({ supabase, diasRetroativos: 0, hoje: HOJE, fetchFn: fakeFetch(z.toBuffer()) }),
    ).rejects.toThrow(/nenhum XML lido/);

    expect(upserts).toHaveLength(0);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]).toMatchObject({ status: 'erro' });
  });
});
