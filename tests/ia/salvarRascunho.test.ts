import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { salvarRascunho, VERSAO_PROMPT } from '@/lib/ia/gerarRascunho';

type Res = { data?: unknown; error?: { message: string } | null };
interface Config {
  insert?: Res;
  update?: Res | 'throw';
  del?: Res;
}

// Fake minimo: registra cada operacao e devolve respostas configuradas.
function fake(cfg: Config) {
  const ops: { tabela: string; op: string; payload?: unknown; filtros: [string, unknown][]; select?: string }[] = [];
  const from = (tabela: string) => {
    const novo = (op: string, payload?: unknown) => {
      const rec = { tabela, op, payload, filtros: [] as [string, unknown][], select: undefined as string | undefined };
      ops.push(rec);
      const resolver = (): Res => {
        if (op === 'insert') return cfg.insert ?? { data: { id: 'r1' }, error: null };
        if (op === 'update') {
          if (cfg.update === 'throw') throw new Error('rede caiu');
          return cfg.update ?? { data: [{ id: 'a1' }], error: null };
        }
        return cfg.del ?? { error: null };
      };
      const b: Record<string, unknown> = {
        eq(c: string, v: unknown) {
          rec.filtros.push([c, v]);
          return b;
        },
        select(s: string) {
          rec.select = s;
          return b;
        },
        single: async () => resolver(),
        then(ok: (v: Res) => unknown, ko: (e: unknown) => unknown) {
          try {
            return Promise.resolve(resolver()).then(ok, ko);
          } catch (e) {
            return Promise.reject(e).then(ok, ko);
          }
        },
      };
      return b;
    };
    return {
      insert: (p: unknown) => novo('insert', p),
      update: (p: unknown) => novo('update', p),
      delete: () => novo('delete'),
    };
  };
  return { sb: { from } as unknown as SupabaseClient, ops };
}

const r = { titulo: 'T', resumo: 'R', tema: 'saude', observacao: 'obs' };

describe('salvarRascunho', () => {
  it('insere o rascunho e muda o ato de coletado para rascunho', async () => {
    const { sb, ops } = fake({});
    await salvarRascunho(sb, 'a1', r, 'm');
    expect(ops[0]).toMatchObject({
      tabela: 'rascunho_ia',
      op: 'insert',
      payload: {
        ato_id: 'a1',
        titulo_sugerido: 'T',
        resumo_sugerido: 'R',
        tema_sugerido: 'saude',
        observacao: 'obs',
        modelo: 'm',
        versao_prompt: VERSAO_PROMPT,
      },
    });
    expect(ops[1]).toMatchObject({ tabela: 'ato', op: 'update', payload: { status: 'rascunho' } });
    expect(ops[1].filtros).toEqual([
      ['id', 'a1'],
      ['status', 'coletado'],
    ]);
    expect(ops).toHaveLength(2);
  });

  it('update sem linhas: apaga o rascunho e falha', async () => {
    const { sb, ops } = fake({ update: { data: [], error: null } });
    await expect(salvarRascunho(sb, 'a1', r, 'm')).rejects.toThrow(/nao esta mais coletado/);
    expect(ops[2]).toMatchObject({ tabela: 'rascunho_ia', op: 'delete', filtros: [['id', 'r1']] });
  });

  it('update com erro: apaga o rascunho e falha', async () => {
    const { sb, ops } = fake({ update: { data: null, error: { message: 'boom' } } });
    await expect(salvarRascunho(sb, 'a1', r, 'm')).rejects.toThrow(/boom/);
    expect(ops[2]).toMatchObject({ op: 'delete', filtros: [['id', 'r1']] });
  });

  it('update lancando excecao: apaga o rascunho e falha', async () => {
    const { sb, ops } = fake({ update: 'throw' });
    await expect(salvarRascunho(sb, 'a1', r, 'm')).rejects.toThrow(/rede caiu/);
    expect(ops[2]).toMatchObject({ op: 'delete', filtros: [['id', 'r1']] });
  });

  it('registra no console se a compensacao tambem falhar', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sb } = fake({ update: { data: [], error: null }, del: { error: { message: 'del falhou' } } });
    await expect(salvarRascunho(sb, 'a1', r, 'm')).rejects.toThrow(/nao esta mais coletado/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('insert falha: lanca e nao tenta atualizar', async () => {
    const { sb, ops } = fake({ insert: { data: null, error: { message: 'sem permissao' } } });
    await expect(salvarRascunho(sb, 'a1', r, 'm')).rejects.toThrow(/sem permissao/);
    expect(ops).toHaveLength(1);
  });
});
