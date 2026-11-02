import { describe, expect, it } from 'vitest';
import { decidir } from '@/lib/editorial/decidir';

const sug = { titulo: 'Cria programa', resumo: 'Cria um programa.', temaId: 't1' };

describe('decidir', () => {
  it('aprovou quando nada mudou', () => {
    expect(decidir({ titulo: 'Cria programa', resumo: 'Cria um programa.', temaId: 't1' }, sug)).toBe('aprovou');
  });
  it('ignora espacos nas pontas', () => {
    expect(decidir({ titulo: ' Cria programa ', resumo: 'Cria um programa.\n', temaId: 't1' }, sug)).toBe('aprovou');
  });
  it('ajustou quando o titulo mudou', () => {
    expect(decidir({ titulo: 'Outro', resumo: 'Cria um programa.', temaId: 't1' }, sug)).toBe('ajustou');
  });
  it('ajustou quando o resumo mudou', () => {
    expect(decidir({ titulo: 'Cria programa', resumo: 'Outro.', temaId: 't1' }, sug)).toBe('ajustou');
  });
  it('ajustou quando o tema mudou', () => {
    expect(decidir({ titulo: 'Cria programa', resumo: 'Cria um programa.', temaId: 't2' }, sug)).toBe('ajustou');
  });
  it('ajustou quando nao havia rascunho (texto escrito pelo editor)', () => {
    expect(decidir({ titulo: 'a', resumo: 'b', temaId: 't1' }, null)).toBe('ajustou');
  });
});
