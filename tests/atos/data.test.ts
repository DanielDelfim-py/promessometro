import { describe, expect, it } from 'vitest';
import { dataBrasil } from '@/lib/atos/data';

describe('dataBrasil', () => {
  it('usa o dia de Sao Paulo, nao o de UTC', () => {
    expect(dataBrasil('2026-03-10T02:30:00Z')).toBe('09/03/2026');
    expect(dataBrasil('2026-03-10T03:00:00Z')).toBe('10/03/2026');
    expect(dataBrasil('2026-03-10T23:59:00-03:00')).toBe('10/03/2026');
  });
  it('devolve vazio para valor invalido', () => {
    expect(dataBrasil('lixo')).toBe('');
  });
});
