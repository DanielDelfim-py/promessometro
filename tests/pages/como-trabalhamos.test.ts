import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Pagina from '@/app/como-trabalhamos/page';
import { EMAIL_CONTATO, NOME_EDITOR } from '@/lib/site';

const html = renderToStaticMarkup(createElement(Pagina));

describe('pagina Como trabalhamos', () => {
  it('mostra editor e e-mail como link mailto', () => {
    expect(html).toContain(NOME_EDITOR);
    expect(html).toContain(`href="mailto:${EMAIL_CONTATO}"`);
  });

  it.each([
    'O que fazemos hoje',
    'Nossas regras',
    'Como um ato chega ao site',
    'Como pedir uma correção',
    'Quem edita',
    'Financiamento',
    'Conflitos de interesse',
    'Avisos',
  ])('tem o titulo %s', (h2) => {
    expect(html).toMatch(new RegExp(`<h2[^>]*>${h2}</h2>`));
  });

  it('diz que a IA nunca publica sozinha', () => {
    expect(html).toContain('A inteligência artificial nunca publica sozinha.');
  });

  it('marca o item ativo no cabecalho', () => {
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/atos"');
  });

  it.each(['[', 'TODO', 'XXX'])('nao contem %s (marcador, caixa exata)', (proibido) => {
    expect(html).not.toContain(proibido);
  });

  it.each(['lorem', 'a definir'])('nao contem %s', (proibido) => {
    expect(html.toLowerCase()).not.toContain(proibido);
  });
});
