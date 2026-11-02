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

  it('falha claramente se a resposta foi cortada por max_tokens', async () => {
    const c: ClienteIA = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } as never };
    await expect(gerarRascunho(c, ato, temas, 'm')).rejects.toThrow(/max_tokens/);
  });

  it('envolve o texto em <ato> e marca truncamento so quando passa de 12000', async () => {
    const longo = { ...ato, texto_original: '<p>' + 'y'.repeat(13000) + '</p>' };
    const c1 = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c1, longo, temas, 'm');
    const m1 = c1.create.mock.calls[0][0].messages[0].content as string;
    expect(m1).toContain('<ato>');
    expect(m1).toContain('</ato>');
    expect(m1).toContain('[texto truncado: so os primeiros 12000 caracteres foram enviados]');
    expect(m1.indexOf('[texto truncado')).toBeLessThan(m1.indexOf('</ato>'));

    const c2 = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c2, ato, temas, 'm');
    const m2 = c2.create.mock.calls[0][0].messages[0].content as string;
    expect(m2).toContain('<ato>');
    expect(m2).not.toContain('texto truncado');
  });

  it('o sistema trata o texto do ato como dado', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c, ato, temas, 'm');
    expect(c.create.mock.calls[0][0].system).toContain('dado');
  });

  it('prompt v2: limites 350 e 200, sem exemplo antigo, mantem regras de dado e truncamento', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c, ato, temas, 'm');
    const sistema = c.create.mock.calls[0][0].system as string;
    expect(sistema).toContain('350');
    expect(sistema).toContain('200');
    expect(sistema).not.toContain('não parece tratar de veto');
    expect(sistema).toContain('dado');
    expect(sistema).toContain('[texto truncado...]');
    expect(c.create.mock.calls[0][0].tools[0].input_schema.properties.observacao.description).toContain('200');
  });

  it('observacao acima de 300 caracteres e cortada em 300 terminando com reticencias', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: 'a'.repeat(301) });
    const o = (await gerarRascunho(c, ato, temas, 'm')).observacao as string;
    expect(o).toHaveLength(300);
    expect(o.endsWith('…')).toBe(true);
    expect(o.slice(0, 299)).toBe('a'.repeat(299));
  });

  it('observacao com ate 300 caracteres fica intacta; so espacos vira null', async () => {
    const exata = 'b'.repeat(300);
    expect((await gerarRascunho(clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: exata }), ato, temas, 'm')).observacao).toBe(exata);
    expect((await gerarRascunho(clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: '   ' }), ato, temas, 'm')).observacao).toBeNull();
  });
});
