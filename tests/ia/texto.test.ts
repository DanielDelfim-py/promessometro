import { describe, expect, it } from 'vitest';
import { htmlParaTexto } from '@/lib/ia/texto';

describe('htmlParaTexto', () => {
  it('remove tags e separa paragrafos', () => {
    expect(htmlParaTexto('<p class="a">Um</p><p>Dois &amp; tres</p>')).toBe('Um\nDois & tres');
  });
  it('decodifica entidades depois de remover tags', () => {
    expect(htmlParaTexto('<p>a &lt;b&gt; c</p>')).toBe('a <b> c');
  });
  it('colapsa espacos e linhas em branco', () => {
    expect(htmlParaTexto('<p>a   b</p><p></p><p></p><p>c</p>')).toBe('a b\n\nc');
  });
  it('nao decodifica duas vezes', () => {
    expect(htmlParaTexto('<p>&amp;lt;</p>')).toBe('&lt;');
  });
  it('decodifica entidades numericas', () => {
    expect(htmlParaTexto('<p>&#233;</p>')).toBe('é');
    expect(htmlParaTexto('<p>&#xE9;</p>')).toBe('é');
  });
  it('mantem entidade numerica invalida', () => {
    expect(htmlParaTexto('<p>&#99999999;</p>')).toBe('&#99999999;');
  });
});
