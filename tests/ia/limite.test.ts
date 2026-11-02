import { describe, expect, it } from 'vitest';
import { limiteIa } from '@/lib/ia/limite';

describe('limiteIa', () => {
  it('usa 40 quando ausente ou invalido', () => {
    expect(limiteIa(undefined)).toBe(40);
    expect(limiteIa('')).toBe(40);
    expect(limiteIa('abc')).toBe(40);
    expect(limiteIa('Infinity')).toBe(40);
  });
  it('mantem valores validos', () => {
    expect(limiteIa('25')).toBe(25);
    expect(limiteIa('0')).toBe(0);
    expect(limiteIa('200')).toBe(200);
  });
  it('limita em 0..200 e trunca para inteiro', () => {
    expect(limiteIa('-5')).toBe(0);
    expect(limiteIa('9999')).toBe(200);
    expect(limiteIa('12.7')).toBe(12);
  });
});
