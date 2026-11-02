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
});
