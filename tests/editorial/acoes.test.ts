import { describe, expect, it } from 'vitest';
import { decidirAcao } from '@/lib/editorial/acoes';

describe('decidirAcao', () => {
  it('aceita somente a lista de acoes conhecidas', () => {
    expect(decidirAcao('publicar')).toBe('aprovou-ou-ajustou');
    expect(decidirAcao('descartar')).toBe('descartou');
    expect(decidirAcao('corrigir')).toBe('corrigiu');
    expect(decidirAcao('despublicar')).toBe('despublicou');
  });
  it('rejeita qualquer outro valor', () => {
    for (const v of ['', 'Publicar', 'aprovou', 'corrigiu', 'toString', '__proto__', 'null', 'undefined']) {
      expect(decidirAcao(v)).toBeNull();
    }
  });
});
