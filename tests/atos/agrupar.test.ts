import { describe, expect, it } from 'vitest';
import { agruparPorData } from '@/lib/atos/agrupar';
import type { AtoPublico } from '@/lib/atos/filtro';

const base: AtoPublico = {
  id: '1', tipo: 'decreto', numero: '1', orgao: 'o', data_dou: '2026-10-30', secao: 1, edicao_extra: false,
  titulo: 't', resumo: 'r', url_dou: 'u', publicado_em: '2026-10-30T10:00:00Z', tema_nome: 'Saúde', tema_slug: 'saude',
  correcao_nota: null, corrigido_em: null,
};

describe('agruparPorData', () => {
  it('rotula hoje e agrupa por data mantendo a ordem', () => {
    const grupos = agruparPorData(
      [base, { ...base, id: '2' }, { ...base, id: '3', data_dou: '2026-10-29' }],
      '2026-10-30',
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(['Hoje · 30/10/2026', '29/10/2026']);
    expect(grupos[0].atos.map((a) => a.id)).toEqual(['1', '2']);
    expect(grupos[1].atos.map((a) => a.id)).toEqual(['3']);
  });

  it('lista vazia', () => {
    expect(agruparPorData([], '2026-10-30')).toEqual([]);
  });
});
