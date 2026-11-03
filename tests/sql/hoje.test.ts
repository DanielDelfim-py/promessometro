import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, criarPromessa, EDITOR, erroDe, MIGRACOES, semearEditor, type Banco } from './banco';

// Aqui hoje_sp() NAO e substituida: e a funcao real da 0003, a mesma do banco ao vivo.
let b: Banco;
beforeAll(async () => {
  b = await criarBanco(MIGRACOES, null);
  await semearEditor(b);
}, 120_000);
afterAll(async () => {
  await b?.fechar();
});

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

describe('hoje_sp() real', () => {
  it('devolve a data de hoje no fuso de Sao Paulo', async () => {
    const antes = hojeEmSaoPaulo();
    const [r] = await b.dono<{ d: string }>('select hoje_sp()::text as d');
    const depois = hojeEmSaoPaulo();
    // antes e depois so diferem se a consulta cruzar a meia-noite de Sao Paulo
    expect([antes, depois]).toContain(r.d);
  });

  it('registrar_evidencia recusa data no futuro com o hoje real', async () => {
    const { promessaId } = await criarPromessa(b, true);
    const e = await erroDe(
      b.como(
        'authenticated',
        EDITOR,
        `select registrar_evidencia($1::uuid, 'documento', 'https://www.gov.br/relatorio.pdf', 'Relatorio', '2099-01-01', null)`,
        [promessaId],
      ),
    );
    expect(e.message).toContain('data do fato no futuro');
  });
});
