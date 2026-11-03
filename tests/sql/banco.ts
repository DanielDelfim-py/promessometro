import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.resolve(import.meta.dirname, '..', '..', 'supabase', 'migrations');

/** Migrações na ordem em que foram aplicadas no banco ao vivo. */
export const MIGRACOES = ['0001_schema.sql', '0002_correcoes.sql', '0003_promessas.sql'];

/** "Hoje" fixo dos testes (a 0003 cria hoje_sp(); os cenários de 2027 precisam de um hoje em 2027). */
export const HOJE_TESTE = '2027-06-30';

// Imita o que o Supabase cria antes das nossas migrações: papéis, auth.users, auth.uid()
// (lê o claim "sub" do JWT) e os privilégios padrão que o Supabase dá a objetos novos.
// Os privilégios padrão importam: as migrações precisam revogar o que não querem dar.
const SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type Papel = 'anon' | 'authenticated' | 'service_role';

export interface Banco {
  db: PGlite;
  /** Executa como o dono das tabelas (equivale ao Editor de SQL). */
  dono<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa numa transação com o papel e o usuário (claim sub) indicados, como o PostgREST faz. */
  como<T = Record<string, unknown>>(papel: Papel, sub: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa como dono com a flag app.revisando ligada (simula estar dentro de uma função editorial). */
  comFlag<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  fechar(): Promise<void>;
}

export async function criarBanco(migracoes: string[] = MIGRACOES, hoje: string | null = HOJE_TESTE): Promise<Banco> {
  const db = await PGlite.create();
  await db.exec(SUPABASE);
  for (const m of migracoes) {
    await db.exec(readFileSync(path.join(PASTA, m), 'utf8'));
  }
  if (hoje !== null && migracoes.includes('0003_promessas.sql')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) throw new Error('hoje deve ser aaaa-mm-dd');
    await db.exec(`create or replace function hoje_sp() returns date
      language sql stable set search_path = pg_catalog, pg_temp as $$ select date '${hoje}'; $$;`);
  }
  return {
    db,
    async dono<T>(sql: string, params: unknown[] = []) {
      return (await db.query<T>(sql, params)).rows;
    },
    async como<T>(papel: Papel, sub: string | null, sql: string, params: unknown[] = []) {
      return db.transaction(async (tx) => {
        // Os dois caminhos que o Supabase usa: claim legado e JSON completo.
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [sub ? JSON.stringify({ sub, role: papel }) : '']);
        await tx.exec(`set local role ${papel}`);
        return (await tx.query<T>(sql, params)).rows;
      });
    },
    async comFlag<T>(sql: string, params: unknown[] = []) {
      return db.transaction(async (tx) => {
        await tx.query(`select set_config('app.revisando', 'on', true)`);
        return (await tx.query<T>(sql, params)).rows;
      });
    },
    fechar: () => db.close(),
  };
}

/** Espera que a operação falhe e devolve o SQLSTATE e a mensagem. Falha o teste se ela funcionar. */
export async function erroDe(p: Promise<unknown>): Promise<{ code: string | undefined; message: string }> {
  try {
    await p;
  } catch (e) {
    const erro = e as { code?: string; message?: string };
    return { code: erro.code, message: String(erro.message ?? e) };
  }
  throw new Error('era esperado um erro, mas a operacao funcionou');
}

export const EDITOR = '11111111-1111-4111-8111-111111111111';
/** Usuário autenticado que NÃO é editor. */
export const INTRUSO = '22222222-2222-4222-8222-222222222222';

export async function semearEditor(b: Banco): Promise<void> {
  await b.dono('insert into auth.users (id) values ($1), ($2)', [EDITOR, INTRUSO]);
  await b.dono(`insert into editor (id, nome) values ($1, 'Editora de teste')`, [EDITOR]);
}

export async function temaId(b: Banco, slug: string): Promise<string> {
  const [t] = await b.dono<{ id: string }>('select id from tema where slug = $1', [slug]);
  if (!t) throw new Error(`tema ${slug} nao existe`);
  return t.id;
}

let seqAto = 0;
/** Insere um ato coletado (status 'coletado') com a data do DOU indicada (aaaa-mm-dd). */
export async function inserirAto(b: Banco, dataDou: string): Promise<string> {
  seqAto++;
  const [r] = await b.dono<{ id: string }>(
    `insert into ato (dou_id, tipo, orgao, data_dou, titulo_original, texto_original, url_dou)
     values ($1, 'decreto', 'Presidência da República', $2::date, 'DECRETO DE TESTE', '<p>Art. 1º Teste.</p>', $3)
     returning id`,
    [`teste-${seqAto}`, dataDou, `https://www.in.gov.br/teste/${seqAto}`],
  );
  return r.id;
}

// Página 1 tem quebras de linha no meio da frase, como sai do PDF.
export const TEXTO_P1 =
  'Plano de governo 2027-2030.\nVamos construir 500 novas creches em todo o\npaís até 2030, com prioridade para as regiões mais pobres.';
export const TEXTO_P2 = 'Saúde.\nGarantir atendimento especializado em até 30 dias pelo SUS.';
export const CITACAO_1 = 'Vamos construir 500 novas creches em todo o país até 2030';
export const CITACAO_2 = 'Garantir atendimento especializado em até 30 dias pelo SUS.';

let seqPlano = 0;
export function novoSha(): string {
  seqPlano++;
  return seqPlano.toString(16).padStart(64, '0');
}

export function planoJson(sha: string = novoSha(), paginas = 2) {
  return {
    titulo: 'Plano de teste',
    candidato: 'Candidatura de teste',
    cargo: 'Presidente da República',
    ano_eleicao: 2026,
    fonte_url: 'https://www.tse.jus.br/plano.pdf',
    arquivo_sha256: sha,
    paginas,
  };
}

export const CANDIDATAS_TESTE = [
  {
    pagina: 1,
    citacao: CITACAO_1,
    titulo_sugerido: 'Construir 500 creches',
    tema_sugerido: 'educacao',
    concretude: 'concreta',
    motivo_concretude: '1 sim, 2 sim, 3 sim, 4 sim.',
    modelo: 'modelo-teste',
    versao_prompt: 'plano-v1',
  },
  {
    pagina: 2,
    citacao: CITACAO_2,
    titulo_sugerido: 'Atendimento especializado em 30 dias',
    tema_sugerido: 'saude',
    concretude: 'intermediaria',
    motivo_concretude: null,
    modelo: 'modelo-teste',
    versao_prompt: 'plano-v1',
  },
];

export interface ResultadoImportacaoSql {
  plano_id: string;
  paginas: number;
  candidatas: number;
}

/** Chama importar_plano como a chave de serviço (o script de importação faz o mesmo pela API). */
export async function importar(
  b: Banco,
  plano: Record<string, unknown>,
  paginas: string[],
  candidatas: Record<string, unknown>[],
): Promise<ResultadoImportacaoSql> {
  const [r] = await b.como<{ r: ResultadoImportacaoSql }>(
    'service_role',
    null,
    'select importar_plano($1::jsonb, $2::jsonb, $3::jsonb) as r',
    [JSON.stringify(plano), JSON.stringify(paginas), JSON.stringify(candidatas)],
  );
  return r.r;
}

/** Importa um plano de 2 páginas com 2 candidatas pendentes. */
export async function semearPlano(b: Banco): Promise<{ planoId: string; candidatas: string[] }> {
  const r = await importar(b, planoJson(), [TEXTO_P1, TEXTO_P2], CANDIDATAS_TESTE);
  const cands = await b.dono<{ id: string }>('select id from promessa_candidata where plano_id = $1::uuid order by pagina', [r.plano_id]);
  return { planoId: r.plano_id, candidatas: cands.map((c) => c.id) };
}

/** Cria promessa direto na tabela com a flag ligada (só para testar guardas, sem as funções). */
export async function promessaDireta(b: Banco, planoId: string, estado: 'rascunho' | 'publicada' = 'rascunho'): Promise<string> {
  const tema = await temaId(b, 'educacao');
  const [r] = await b.comFlag<{ id: string }>(
    `insert into promessa (plano_id, tema_id, titulo, texto_original, pagina, fonte_url, estado, publicada_em)
     values ($1::uuid, $2::uuid, 'Promessa direta', $3, 1, 'https://www.tse.jus.br/plano.pdf', $4::estado_publicacao,
             case when $4::estado_publicacao = 'publicada' then now() end)
     returning id`,
    [planoId, tema, CITACAO_1, estado],
  );
  return r.id;
}

/** Cria evidência direto na tabela com a flag ligada (só para testes). */
export async function evidenciaDireta(b: Banco, promessaId: string, dataFato = '2027-03-01'): Promise<string> {
  const [r] = await b.comFlag<{ id: string }>(
    `insert into evidencia (promessa_id, tipo, fonte_url, descricao, data_fato, criado_por)
     values ($1::uuid, 'documento', 'https://www.gov.br/doc', 'Documento de teste', $2::date, $3::uuid)
     returning id`,
    [promessaId, dataFato, EDITOR],
  );
  return r.id;
}
