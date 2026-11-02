import { describe, expect, it, vi } from 'vitest';
import { gerarRascunho, MARCADOR_TRUNCADO, type ClienteIA } from '@/lib/ia/gerarRascunho';

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

  it('envia ate 40000 caracteres do ato sem marcar truncamento', async () => {
    const cabe = { ...ato, texto_original: '<p>' + 'y'.repeat(20_000) + '</p>' };
    const c1 = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c1, cabe, temas, 'm');
    const m1 = c1.create.mock.calls[0][0].messages[0].content as string;
    expect(m1).toContain('<ato>');
    expect(m1).toContain('</ato>');
    expect(m1).toContain('y'.repeat(20_000));
    expect(m1).not.toContain(MARCADOR_TRUNCADO);
    expect(m1).not.toContain('texto truncado');
  });

  it('acima de 40000 caracteres envia exatamente os 40000 primeiros e marca truncamento', async () => {
    const longo = { ...ato, texto_original: '<p>' + 'y'.repeat(40_001) + '</p>' };
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c, longo, temas, 'm');
    const m = c.create.mock.calls[0][0].messages[0].content as string;
    expect(m).toContain('[texto truncado: so os primeiros 40000 caracteres foram enviados]');
    expect(m).toContain(MARCADOR_TRUNCADO);
    expect(c.create.mock.calls[0][0].system).toContain(MARCADOR_TRUNCADO);
    expect(m.indexOf('[texto truncado')).toBeLessThan(m.indexOf('</ato>'));
    const trecho = m.slice(m.indexOf('<ato>\n') + '<ato>\n'.length, m.indexOf('\n[texto truncado'));
    expect(trecho).toBe('y'.repeat(40_000));
  });

  it('ato exatamente de 40000 caracteres nao e truncado', async () => {
    const exato = { ...ato, texto_original: '<p>' + 'y'.repeat(40_000) + '</p>' };
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude' });
    await gerarRascunho(c, exato, temas, 'm');
    const m = c.create.mock.calls[0][0].messages[0].content as string;
    expect(m).not.toContain(MARCADOR_TRUNCADO);
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
    expect(sistema).toContain('no máximo 350 caracteres');
    expect(sistema).toContain('até 200 caracteres');
    expect(sistema).not.toContain('não parece tratar de veto');
    expect(sistema).toContain('dado');
    expect(sistema).toContain(MARCADOR_TRUNCADO);
    expect(c.create.mock.calls[0][0].tools[0].input_schema.properties.observacao.description).toContain('200');
  });

  it('observacao acima de 300 caracteres e cortada em 300 terminando com reticencias', async () => {
    const c = clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: 'a'.repeat(301) });
    const o = (await gerarRascunho(c, ato, temas, 'm')).observacao as string;
    expect(o).toHaveLength(300);
    expect(o.endsWith('…')).toBe(true);
    expect(o.slice(0, 299)).toBe('a'.repeat(299));
  });

  it('observacao cortada nao deixa espaco antes das reticencias', async () => {
    const obs = 'a'.repeat(298) + ' ' + 'b'.repeat(50);
    const o = (await gerarRascunho(clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: obs }), ato, temas, 'm')).observacao as string;
    expect(o.length).toBeLessThanOrEqual(300);
    expect(o.endsWith('…')).toBe(true);
    expect(o.endsWith(' …')).toBe(false);
  });

  it('observacao com ate 300 caracteres fica intacta; so espacos vira null', async () => {
    const exata = 'b'.repeat(300);
    expect((await gerarRascunho(clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: exata }), ato, temas, 'm')).observacao).toBe(exata);
    expect((await gerarRascunho(clienteCom({ titulo: 't', resumo: 'r', tema: 'saude', observacao: '   ' }), ato, temas, 'm')).observacao).toBeNull();
  });
});
