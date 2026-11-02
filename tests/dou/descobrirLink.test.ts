import { describe, expect, it } from 'vitest';
import { escolherLink, extrairLinksSecao1, MESES } from '@/lib/dou/descobrirLink';

const HTML = `
<ul>
 <li><a href="/documents/49035712/740172584/S03102026_Atualizado175822.zip/64e5?version=1.0&amp;t=1793308851993&amp;download=true">S03</a></li>
 <li><a href="/documents/49035712/740172584/S02102026_Atualizado175329.zip/ff68?version=1.0&amp;t=1793308854893&amp;download=true">S02</a></li>
 <li><a href="/documents/49035712/740172584/S01102026_Atualizado175048.zip/afb3?version=1.0&amp;t=1793308860050&amp;download=true">S01</a></li>
 <li><a href="/documents/49035712/738042107/S01092026.zip/6a82?version=1.0&amp;t=1791898753253&amp;download=true">S01 set</a></li>
</ul>`;

describe('MESES', () => {
  it('tem 12 meses em portugues', () => {
    expect(MESES).toHaveLength(12);
    expect(MESES[9]).toBe('Outubro');
  });
});

describe('extrairLinksSecao1', () => {
  it('pega so S01 do mes pedido e decodifica &amp;', () => {
    const links = extrairLinksSecao1(HTML, 9, 2026);
    expect(links).toHaveLength(1);
    expect(links[0].nome).toBe('S01102026_Atualizado175048.zip');
    expect(links[0].url).toBe(
      'https://www.in.gov.br/documents/49035712/740172584/S01102026_Atualizado175048.zip/afb3?version=1.0&t=1793308860050&download=true',
    );
    expect(links[0].t).toBe(1793308860050);
  });

  it('acha o zip de mes fechado sem sufixo Atualizado', () => {
    const links = extrairLinksSecao1(HTML, 8, 2026);
    expect(links.map((l) => l.nome)).toEqual(['S01092026.zip']);
  });

  it('remove duplicados', () => {
    expect(extrairLinksSecao1(HTML + HTML, 9, 2026)).toHaveLength(1);
  });

  it('devolve vazio quando nao ha link', () => {
    expect(extrairLinksSecao1('<p>nada</p>', 9, 2026)).toEqual([]);
  });
});

describe('escolherLink', () => {
  it('escolhe o de maior t', () => {
    const a = { nome: 'a', url: 'u1', t: 1 };
    const b = { nome: 'b', url: 'u2', t: 5 };
    expect(escolherLink([a, b])).toBe(b);
  });
  it('null quando vazio', () => {
    expect(escolherLink([])).toBeNull();
  });
});
