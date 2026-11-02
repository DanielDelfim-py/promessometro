import { describe, expect, it } from 'vitest';
import { paraLinha } from '@/lib/coleta/linha';
import type { AtoClassificado } from '@/lib/dou/tipos';

const ato: AtoClassificado = {
  douId: '24538211',
  artType: 'Decreto numerado',
  artCategory: 'Atos do Poder Executivo',
  orgao: 'Atos do Poder Executivo',
  dataDou: '2026-10-29',
  edicao: '205',
  pagina: '12',
  edicaoExtra: false,
  urlDou: 'https://pesquisa.in.gov.br/x',
  identifica: 'DECRETO Nº 13.131, DE 30 DE SETEMBRO DE 2026',
  ementa: 'Altera o Decreto nº 11.348.',
  texto: '<p>texto</p>',
  tipo: 'decreto',
  numero: '13.131',
};

describe('paraLinha', () => {
  it('mapeia para as colunas de ato com status coletado', () => {
    expect(paraLinha(ato)).toEqual({
      dou_id: '24538211',
      tipo: 'decreto',
      numero: '13.131',
      orgao: 'Atos do Poder Executivo',
      data_dou: '2026-10-29',
      secao: 1,
      edicao_extra: false,
      edicao: '205',
      pagina: '12',
      titulo_original: 'DECRETO Nº 13.131, DE 30 DE SETEMBRO DE 2026',
      ementa: 'Altera o Decreto nº 11.348.',
      texto_original: '<p>texto</p>',
      url_dou: 'https://pesquisa.in.gov.br/x',
      status: 'coletado',
    });
  });

  it('remove caracteres nulos que o Postgres rejeita', () => {
    const l = paraLinha({ ...ato, texto: 'a\u0000b' });
    expect(l.texto_original).toBe('ab');
  });
});
