import { describe, expect, it, vi } from 'vitest';
import { gerarRascunho, type ClienteIA } from '@/lib/ia/gerarRascunho';

const temas = [
  { slug: 'saude', nome: 'Saúde' },
  { slug: 'outros', nome: 'Outros' },
];
const ato = {
  tipo: 'decreto',
  numero: '13.131',
  orgao: 'Atos do Poder Executivo',
  titulo_original: 'DECRETO Nº 13.131',
  ementa: 'Dispõe sobre vacinas.',
  texto_original: '<p>Art. 1º Fica criado o programa.</p>',
};

function clienteCom(input: unknown): ClienteIA & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => ({ content: [{ type: 'tool_use', name: 'registrar_rascunho', input }] }));
  return { messages: { create }, create };
}

describe('gerarRascunho', () => {
  it('devolve titulo, resumo e tema validos', async () => {
    const c = clienteCom({ titulo: 'Cria programa de vacinas', resumo: 'Cria um programa.', tema: 'saude', observacao: '' });
    const r = await gerarRascunho(c, ato, temas, 'm');
    expect(r).toEqual({ titulo: 'Cria programa de vacinas', resumo: 'Cria um programa.', tema: 'saude', observacao: null });
  });

  it('forca o uso da ferramenta e restringe os temas', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c, ato, temas, 'modelo-x');
    const args = c.create.mock.calls[0][0];
    expect(args.model).toBe('modelo-x');
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'registrar_rascunho' });
    expect(args.tools[0].input_schema.properties.tema.enum).toEqual(['saude', 'outros']);
    expect(args.messages[0].content).toContain('Art. 1º Fica criado o programa.');
    expect(args.messages[0].content).not.toContain('<p>');
  });

  it('tema desconhecido vira outros', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'inventado' });
    expect((await gerarRascunho(c, ato, temas, 'm')).tema).toBe('outros');
  });

  it('mantem observacao quando preenchida', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: 'Nao parece veto.' });
    expect((await gerarRascunho(c, ato, temas, 'm')).observacao).toBe('Nao parece veto.');
  });

  it('rejeita titulo ou resumo vazios', async () => {
    await expect(gerarRascunho(clienteCom({ titulo: ' ', resumo: 'r', tema: 'saude' }), ato, temas, 'm')).rejects.toThrow(/titulo/);
    await expect(gerarRascunho(clienteCom({ titulo: 't', resumo: '', tema: 'saude' }), ato, temas, 'm')).rejects.toThrow(/resumo/);
  });

  it('rejeita textos acima do limite', async () => {
    const longo = 'x'.repeat(601);
    await expect(gerarRascunho(clienteCom({ titulo: 't', resumo: longo, tema: 'saude' }), ato, temas, 'm')).rejects.toThrow(/limite/);
  });

  it('falha se a resposta nao trouxer a ferramenta', async () => {
    const c: ClienteIA = { messages: { create: async () => ({ content: [{ type: 'text', text: 'oi' }] }) } };
    await expect(gerarRascunho(c, ato, temas, 'm')).rejects.toThrow(/tool_use/);
  });
});
