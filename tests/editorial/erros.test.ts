import { describe, expect, it } from 'vitest';
import { codigoDeErro, mensagemDeErro, ehUuid } from '@/lib/editorial/erros';

describe('codigoDeErro', () => {
  it('mapeia mensagens conhecidas de revisar_ato', () => {
    expect(codigoDeErro('ato ja revisado')).toBe('ato-ja-revisado');
    expect(codigoDeErro('sem permissao')).toBe('sem-permissao');
    expect(codigoDeErro('titulo, resumo e tema sao obrigatorios para publicar')).toBe('dados-invalidos');
    expect(codigoDeErro('nota e obrigatoria para corrigir ou despublicar')).toBe('nota-obrigatoria');
    expect(codigoDeErro('so e possivel corrigir ato publicado')).toBe('ato-nao-publicado');
    expect(codigoDeErro('so e possivel despublicar ato publicado')).toBe('ato-nao-publicado');
  });
  it('qualquer outra coisa vira erro', () => {
    expect(codigoDeErro('duplicate key value violates ...')).toBe('erro');
    expect(codigoDeErro(undefined)).toBe('erro');
  });
});

describe('mensagemDeErro', () => {
  it('traduz codigos conhecidos e usa mensagem generica para desconhecidos', () => {
    expect(mensagemDeErro('falha-ia')).toMatch(/IA/);
    expect(mensagemDeErro('<script>')).toBe(mensagemDeErro('erro'));
    expect(mensagemDeErro(undefined)).toBeNull();
    expect(mensagemDeErro('nota-obrigatoria')).toMatch(/nota/i);
    expect(mensagemDeErro('ato-nao-publicado')).toMatch(/publicado/i);
  });
});

describe('ehUuid', () => {
  it('valida uuid', () => {
    expect(ehUuid('0b6f3c1e-8a4d-4f0e-9c1a-2b3c4d5e6f70')).toBe(true);
    expect(ehUuid('abc')).toBe(false);
    expect(ehUuid('../x')).toBe(false);
  });
});
