import { describe, expect, it } from 'vitest';
import { classificarTipo, extrairNumero } from '@/lib/dou/classificar';

const PODER_EXEC = 'Atos do Poder Executivo';
const DESPACHOS = 'Presidência da República/Despachos do Presidente da República';

describe('classificarTipo', () => {
  it.each([
    ['Decreto numerado', 'decreto'],
    ['Decreto não numerado', 'decreto'],
    ['Medida Provisória', 'mp'],
    ['Lei', 'lei'],
    ['Lei Complementar', 'lei'],
    ['Decreto Legislativo', 'decreto_legislativo'],
    ['Emenda Constitucional', 'emenda_constitucional'],
    ['Portaria', 'portaria'],
    ['Portaria Conjunta', 'portaria'],
    ['Portaria Interministerial', 'portaria'],
  ])('%s -> %s', (artType, esperado) => {
    expect(classificarTipo(artType, PODER_EXEC, '')).toBe(esperado);
  });

  it('normaliza espacos no artType', () => {
    expect(classificarTipo('Resolução Conjunta ', PODER_EXEC, '')).toBeNull();
    expect(classificarTipo(' Decreto  numerado ', PODER_EXEC, '')).toBe('decreto');
  });

  it('ignora tipos fora do escopo', () => {
    for (const t of ['Despacho', 'Resolução', 'Decisão', 'Pauta', 'Retificação', 'Alvará']) {
      expect(classificarTipo(t, PODER_EXEC, '')).toBeNull();
    }
  });

  it('veto: Mensagem em Despachos do Presidente que cita veto', () => {
    const texto = '<p>Ouvidos os ministérios, manifestaram-se pelo veto ao seguinte dispositivo do Projeto de Lei:</p>';
    expect(classificarTipo('Mensagem', DESPACHOS, texto)).toBe('veto');
  });

  it('Mensagem sem veto no texto nao e veto', () => {
    expect(classificarTipo('Mensagem', DESPACHOS, '<p>Nomeio fulano.</p>')).toBeNull();
  });

  it('Mensagem de outra categoria nao e veto', () => {
    expect(classificarTipo('Mensagem', 'Ministério X/Gabinete', '<p>veto</p>')).toBeNull();
  });
});

describe('extrairNumero', () => {
  it.each([
    ['DECRETO Nº 13.131, DE 30 DE SETEMBRO DE 2026', '13.131'],
    ['MEDIDA PROVISÓRIA Nº 1.395, DE 8 DE OUTUBRO DE 2026', '1.395'],
    ['EMENDA CONSTITUCIONAL Nº 140', '140'],
    ['LEI Nº 15.492, DE 2 DE SETEMBRO DE 2026', '15.492'],
    ['PORTARIA GM/MS Nº 12.306, DE 28 DE OUTUBRO DE 2026', '12.306'],
    ['DECRETO DE 6 DE OUTUBRO DE 2026', null],
    ['', null],
  ])('%s -> %s', (identifica, esperado) => {
    expect(extrairNumero(identifica)).toBe(esperado);
  });
});
