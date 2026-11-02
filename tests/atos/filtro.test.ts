import { describe, expect, it } from 'vitest';
import { lerFiltro, TIPOS_PADRAO } from '@/lib/atos/filtro';

describe('lerFiltro', () => {
  it('sem parametros usa o padrao (portarias fora)', () => {
    const f = lerFiltro({});
    expect(f.tipos).toEqual(TIPOS_PADRAO);
    expect(f.tipos).not.toContain('portaria');
    expect(f.tema).toBeNull();
  });

  it('com f=1 respeita o que foi marcado', () => {
    expect(lerFiltro({ f: '1', tipo: ['decreto', 'portaria'] }).tipos).toEqual(['decreto', 'portaria']);
  });

  it('aceita um unico tipo como texto', () => {
    expect(lerFiltro({ f: '1', tipo: 'mp' }).tipos).toEqual(['mp']);
  });

  it('f=1 sem nenhum tipo marcado resulta em lista vazia', () => {
    expect(lerFiltro({ f: '1' }).tipos).toEqual([]);
  });

  it('descarta tipos desconhecidos', () => {
    expect(lerFiltro({ f: '1', tipo: ['decreto', 'xpto'] }).tipos).toEqual(['decreto']);
  });

  it('le o tema e trata vazio como nenhum', () => {
    expect(lerFiltro({ tema: 'saude' }).tema).toBe('saude');
    expect(lerFiltro({ tema: '' }).tema).toBeNull();
  });
});
