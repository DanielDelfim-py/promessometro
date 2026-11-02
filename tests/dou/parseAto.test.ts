import { describe, expect, it } from 'vitest';
import { dataIso, parseAto } from '@/lib/dou/parseAto';
import { xmlAto } from '../helpers/xml';

describe('dataIso', () => {
  it('converte dd/mm/aaaa', () => {
    expect(dataIso('29/10/2026')).toBe('2026-10-29');
  });
  it('rejeita formato invalido', () => {
    expect(() => dataIso('2026-10-29')).toThrow();
  });
});

describe('parseAto', () => {
  it('le os campos principais', () => {
    const a = parseAto(xmlAto(), false);
    expect(a).toMatchObject({
      douId: '24538211',
      artType: 'Resolução',
      artCategory: expect.stringContaining('Conselho Federal de Psicologia'),
      orgao: 'Entidades de Fiscalização do Exercício das Profissões Liberais',
      dataDou: '2026-10-29',
      edicao: '205',
      pagina: '210',
      edicaoExtra: false,
      identifica: 'Resolução Nº 14, DE 16 DE outubro DE 2026',
      ementa: 'Altera a Resolução CFP nº 2, de 01 de abril de 2021.',
    });
    expect(a.texto).toContain('<p>Art. 1º');
  });

  it('usa https e decodifica &amp; no link do DOU', () => {
    expect(parseAto(xmlAto(), false).urlDou).toBe(
      'https://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=29/10/2026&jornal=515&pagina=210',
    );
  });

  it('marca edicao extra', () => {
    expect(parseAto(xmlAto(), true).edicaoExtra).toBe(true);
  });

  it('mantem idMateria como texto, sem virar numero', () => {
    expect(typeof parseAto(xmlAto({ idMateria: '0012' }), false).douId).toBe('string');
    expect(parseAto(xmlAto({ idMateria: '0012' }), false).douId).toBe('0012');
  });

  it('falha sem idMateria', () => {
    const xml = xmlAto().replace(/ idMateria="[^"]*"/, '');
    expect(() => parseAto(xml, false)).toThrow(/idMateria/);
  });

  it('falha sem article', () => {
    expect(() => parseAto('<xml></xml>', false)).toThrow(/article/);
  });
});
