-- 0003: Promessometro (Fase 2): plano de governo, candidatas, promessas, evidencias,
-- vinculos ato-promessa, propostas de status e historico.
-- Aplicar UMA vez, no Editor de SQL do Supabase, com 0001 e 0002 ja aplicadas, ANTES de publicar o codigo novo.
-- Este arquivo e executado em Postgres real (PGlite, tests/sql) a cada `npm test`. Nao edite 0001 nem 0002.
-- Seguranca (mesmo padrao da Fase 1):
--   * status, estado e nota de correcao de promessa so mudam pelas funcoes SECURITY DEFINER deste arquivo
--     (flag app.revisando);
--   * service_role tem privilegio minimo e e barrado pelos gatilhos, como em ato;
--   * o publico le somente as visoes.

-- =====================================================================
-- PARTE A: tipos, tabelas, RLS, privilegios e guardas
-- =====================================================================

-- A1) Tipos (create type pode ser usado na mesma transacao; so "add value" teria restricao).
create type status_promessa as enum ('nao_iniciada', 'em_andamento', 'parcialmente_cumprida', 'cumprida', 'abandonada');
create type estado_publicacao as enum ('rascunho', 'publicada', 'retirada');
create type estado_vinculo as enum ('sugerido', 'confirmado', 'rejeitado');
create type estado_proposta as enum ('pendente', 'aprovada', 'recusada', 'substituida');
create type estado_candidata as enum ('pendente', 'aceita', 'descartada');
create type concretude_promessa as enum ('concreta', 'intermediaria', 'generica');
create type decisao_promessa as enum ('publicou', 'alterou_texto', 'mudou_status', 'retirou', 'republicou', 'retirou_evidencia');
create type tipo_evidencia as enum ('ato_dou', 'documento', 'outro');
create type origem_vinculo as enum ('ia', 'editor');

-- A2) Normalizacao de espacos: IDENTICA a normalizarEspacos() de src/lib/plano/texto.ts.
-- O texto das paginas e gravado ja limpo (limparTexto), entao so sobram espaco, tab, \r e \n.
create or replace function normalizar_espacos(p text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select btrim(regexp_replace(coalesce(p, ''), '[ \t\r\n]+', ' ', 'g'));
$$;

-- Data de hoje no fuso de Sao Paulo (datas de negocio). Funcao propria para os testes em PGlite poderem
-- fixar "hoje" em 2027 (create or replace no banco de teste); no banco ao vivo nunca e substituida.
create or replace function hoje_sp() returns date
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- A3) Tabelas
create table plano (
  id uuid primary key default gen_random_uuid(),
  titulo text not null constraint plano_titulo_tamanho check (length(btrim(titulo)) between 1 and 300),
  candidato text not null constraint plano_candidato_tamanho check (length(btrim(candidato)) between 1 and 200),
  cargo text not null constraint plano_cargo_tamanho check (length(btrim(cargo)) between 1 and 100),
  ano_eleicao smallint not null constraint plano_ano_valido check (ano_eleicao between 2000 and 2100),
  fonte_url text not null constraint plano_fonte_https check (fonte_url ~ '^https://'),
  arquivo_sha256 text not null constraint plano_sha256_unico unique
    constraint plano_sha256_formato check (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  paginas integer not null constraint plano_paginas_validas check (paginas between 1 and 2000),
  criado_em timestamptz not null default now()
);

create table plano_pagina (
  plano_id uuid not null references plano (id),
  numero integer not null constraint plano_pagina_numero check (numero >= 1),
  texto text not null,
  primary key (plano_id, numero)
);

create table promessa (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references plano (id),
  tema_id uuid not null references tema (id),
  titulo text not null constraint promessa_titulo_tamanho check (length(btrim(titulo)) between 1 and 140),
  texto_original text not null constraint promessa_texto_tamanho check (length(btrim(texto_original)) between 1 and 2000),
  pagina integer not null constraint promessa_pagina_valida check (pagina >= 1),
  fonte_url text not null constraint promessa_fonte_https check (fonte_url ~ '^https://'),
  mandato text not null default '2027-2030' constraint promessa_mandato_formato check (mandato ~ '^[0-9]{4}-[0-9]{4}$'),
  status status_promessa not null default 'nao_iniciada',
  estado estado_publicacao not null default 'rascunho',
  publicada_em timestamptz,
  status_atualizado_em timestamptz,
  -- Nota publica da ultima correcao de titulo/tema de promessa publicada (como ato.correcao_nota).
  correcao_nota text constraint promessa_correcao_tamanho check (correcao_nota is null or length(correcao_nota) <= 500),
  corrigido_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint promessa_publicada_tem_data check (estado <> 'publicada' or publicada_em is not null),
  constraint promessa_correcao_completa check ((correcao_nota is null) = (corrigido_em is null))
);
create index promessa_estado_status on promessa (estado, status);

create table promessa_candidata (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references plano (id),
  pagina integer not null,
  citacao text not null constraint candidata_citacao_tamanho check (length(citacao) between 20 and 2000),
  titulo_sugerido text not null constraint candidata_titulo_tamanho check (length(btrim(titulo_sugerido)) between 1 and 140),
  tema_sugerido text not null,
  concretude concretude_promessa not null default 'intermediaria',
  motivo_concretude text constraint candidata_motivo_tamanho check (motivo_concretude is null or length(motivo_concretude) <= 300),
  estado estado_candidata not null default 'pendente',
  promessa_id uuid references promessa (id),
  decidido_por uuid references editor (id),
  decidido_em timestamptz,
  modelo text not null,
  versao_prompt text not null,
  criado_em timestamptz not null default now(),
  constraint candidata_pagina_existe foreign key (plano_id, pagina) references plano_pagina (plano_id, numero),
  constraint candidata_aceita_tem_promessa check ((estado = 'aceita') = (promessa_id is not null)),
  constraint candidata_decisao_completa check (
    (estado = 'pendente' and decidido_por is null and decidido_em is null)
    or (estado <> 'pendente' and decidido_por is not null and decidido_em is not null)
  )
);
create index candidata_plano_estado on promessa_candidata (plano_id, estado, concretude);

create table evidencia (
  id uuid primary key default gen_random_uuid(),
  promessa_id uuid not null references promessa (id),
  tipo tipo_evidencia not null,
  ato_id uuid references ato (id),
  fonte_url text not null constraint evidencia_fonte_https check (fonte_url ~ '^https://'),
  descricao text not null constraint evidencia_descricao_tamanho check (length(btrim(descricao)) between 1 and 500),
  data_fato date not null constraint evidencia_data_corte check (data_fato >= date '2027-01-01'),
  criado_por uuid not null references editor (id),
  criado_em timestamptz not null default now(),
  -- Retratacao (retirar_evidencia): a evidencia continua gravada, mas sai das visoes e das decisoes.
  retirada_em timestamptz,
  retirada_por uuid references editor (id),
  retirada_nota text constraint evidencia_retirada_nota_tamanho check (retirada_nota is null or length(retirada_nota) <= 500),
  constraint evidencia_ato_coerente check ((tipo = 'ato_dou') = (ato_id is not null)),
  constraint evidencia_retirada_completa check (
    (retirada_em is null and retirada_por is null and retirada_nota is null)
    or (retirada_em is not null and retirada_por is not null and retirada_nota is not null)
  )
);
create index evidencia_promessa on evidencia (promessa_id, data_fato desc);
-- Uma evidencia ativa por ato e promessa (a retirada libera para registrar de novo).
create unique index evidencia_ato_unica on evidencia (promessa_id, ato_id) where ato_id is not null and retirada_em is null;

create table vinculo_ato_promessa (
  id uuid primary key default gen_random_uuid(),
  ato_id uuid not null references ato (id),
  promessa_id uuid not null references promessa (id),
  origem origem_vinculo not null,
  estado estado_vinculo not null default 'sugerido',
  justificativa text not null constraint vinculo_justificativa_tamanho check (length(btrim(justificativa)) between 1 and 500),
  modelo text,
  versao_prompt text,
  decidido_por uuid references editor (id),
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint vinculo_unico unique (ato_id, promessa_id),
  constraint vinculo_ia_registra_modelo check (origem <> 'ia' or (modelo is not null and versao_prompt is not null)),
  constraint vinculo_decisao_completa check (
    (estado = 'sugerido' and decidido_por is null and decidido_em is null)
    or (estado <> 'sugerido' and decidido_por is not null and decidido_em is not null)
  )
);
create index vinculo_promessa on vinculo_ato_promessa (promessa_id, estado);

create table proposta_status (
  id uuid primary key default gen_random_uuid(),
  promessa_id uuid not null references promessa (id),
  status_proposto status_promessa not null,
  justificativa text not null constraint proposta_justificativa_tamanho check (length(btrim(justificativa)) between 1 and 1000),
  evidencia_ids uuid[] not null constraint proposta_tem_evidencia check (cardinality(evidencia_ids) >= 1),
  modelo text not null,
  versao_prompt text not null,
  estado estado_proposta not null default 'pendente',
  decidido_por uuid references editor (id),
  decidido_em timestamptz,
  nota_decisao text constraint proposta_nota_tamanho check (nota_decisao is null or length(nota_decisao) <= 1000),
  criado_em timestamptz not null default now()
);
-- No maximo uma proposta pendente por promessa (a nova marca a anterior como substituida, ver guardar_proposta).
create unique index proposta_uma_pendente on proposta_status (promessa_id) where estado = 'pendente';

create table revisao_promessa (
  id uuid primary key default gen_random_uuid(),
  promessa_id uuid not null references promessa (id),
  editor_id uuid not null references editor (id),
  decisao decisao_promessa not null,
  status_antes status_promessa not null,
  status_depois status_promessa not null,
  proposta_id uuid references proposta_status (id),
  confirmou_fonte boolean not null default false,
  nota text constraint revisao_promessa_nota_tamanho check (nota is null or length(nota) <= 1000),
  valores_antes jsonb not null,
  valores_depois jsonb not null,
  criado_em timestamptz not null default now()
);
create index revisao_promessa_promessa on revisao_promessa (promessa_id, criado_em desc);

-- A4) RLS: o publico nao le nenhuma tabela; o editor le tudo.
alter table plano enable row level security;
alter table plano_pagina enable row level security;
alter table promessa_candidata enable row level security;
alter table promessa enable row level security;
alter table evidencia enable row level security;
alter table vinculo_ato_promessa enable row level security;
alter table proposta_status enable row level security;
alter table revisao_promessa enable row level security;

create policy plano_editor on plano for select to authenticated using (is_editor());
create policy plano_pagina_editor on plano_pagina for select to authenticated using (is_editor());
create policy candidata_editor on promessa_candidata for select to authenticated using (is_editor());
create policy promessa_editor on promessa for select to authenticated using (is_editor());
create policy evidencia_editor on evidencia for select to authenticated using (is_editor());
create policy vinculo_editor on vinculo_ato_promessa for select to authenticated using (is_editor());
create policy proposta_editor on proposta_status for select to authenticated using (is_editor());
create policy revisao_promessa_editor on revisao_promessa for select to authenticated using (is_editor());

-- A5) Privilegios explicitos (nao dependem dos grants padrao do Supabase).
-- service_role ignora RLS, por isso recebe o minimo e os gatilhos abaixo protegem o resto.
revoke all on plano, plano_pagina, promessa_candidata, promessa, evidencia, vinculo_ato_promessa, proposta_status, revisao_promessa
  from anon, authenticated, service_role;
-- Editor: so leitura; toda escrita passa pelas funcoes SECURITY DEFINER.
grant select on plano, plano_pagina, promessa_candidata, promessa, evidencia, vinculo_ato_promessa, proposta_status, revisao_promessa
  to authenticated;
-- service_role: o plano so e gravado pela funcao importar_plano (SECURITY DEFINER, tudo numa transacao);
-- aqui so le (o script confere se o arquivo ja foi importado). IA de vinculos e propostas (le
-- promessa/evidencia; insere sugestao e proposta pendente). Nada em revisao_promessa; sem update nem delete
-- em nenhuma tabela nova; sem insert em plano, plano_pagina, promessa_candidata, promessa e evidencia.
grant select on plano, plano_pagina, promessa_candidata to service_role;
grant select on promessa to service_role;
grant select on evidencia to service_role;
grant select, insert on vinculo_ato_promessa to service_role;
grant select, insert on proposta_status to service_role;

revoke execute on function normalizar_espacos(text) from public, anon, authenticated, service_role;
revoke execute on function hoje_sp() from public, anon, authenticated, service_role;

-- A6) Guardas
-- Recusa sempre (tabelas somente insercao e truncate).
create or replace function bloquear_alteracao_promessometro() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception '% e somente insercao', TG_TABLE_NAME using errcode = '42501';
  return null;
end;
$$;

-- Insercao so dentro das funcoes editoriais (flag app.revisando ligada por elas).
create or replace function exigir_funcao_editorial() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if current_setting('app.revisando', true) is distinct from 'on' then
    raise exception '% so pode ser gravada pelas funcoes editoriais', TG_TABLE_NAME using errcode = '42501';
  end if;
  return NEW;
end;
$$;

-- plano: nunca muda nem e apagado (a importacao e atomica, ver importar_plano).
create trigger plano_somente_insercao before update or delete on plano
  for each row execute function bloquear_alteracao_promessometro();
create trigger plano_sem_truncate before truncate on plano
  for each statement execute function bloquear_alteracao_promessometro();

-- plano_pagina: so paginas 1..plano.paginas, e so antes de existir qualquer candidata do plano.
-- (Fecha o caminho de acrescentar uma pagina inventada a um plano ja importado.)
create or replace function guardar_plano_pagina() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_paginas integer;
begin
  select paginas into v_paginas from plano where id = NEW.plano_id;
  if v_paginas is null or NEW.numero < 1 or NEW.numero > v_paginas then
    raise exception 'pagina fora do plano' using errcode = '42501';
  end if;
  if exists (select 1 from promessa_candidata where plano_id = NEW.plano_id) then
    raise exception 'plano ja tem candidatas: paginas nao podem ser acrescentadas' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
create trigger plano_pagina_guardar before insert on plano_pagina
  for each row execute function guardar_plano_pagina();
create trigger plano_pagina_somente_insercao before update or delete on plano_pagina
  for each row execute function bloquear_alteracao_promessometro();
create trigger plano_pagina_sem_truncate before truncate on plano_pagina
  for each statement execute function bloquear_alteracao_promessometro();

-- promessa: insert/update so dentro das funcoes; nunca apagada; a nota de correcao nunca nasce no insert
-- (impede semear "Corrigido em ..." com texto nao revisado, como em ato).
create or replace function guardar_promessa() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'promessa nao pode ser apagada' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' and (NEW.correcao_nota is not null or NEW.corrigido_em is not null) then
    raise exception 'correcao so pode ser registrada pela funcao editar_promessa' using errcode = '42501';
  end if;
  if current_setting('app.revisando', true) is distinct from 'on' then
    raise exception 'promessa so pode ser alterada pelas funcoes editoriais' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
create trigger promessa_guardar before insert or update or delete on promessa
  for each row execute function guardar_promessa();
create trigger promessa_sem_truncate before truncate on promessa
  for each statement execute function bloquear_alteracao_promessometro();

-- promessa_candidata: fora das funcoes, so nasce pendente; nunca e apagada.
-- A conferencia da citacao aqui e uma checagem de CONSISTENCIA (o programa ja conferiu antes de gravar);
-- nao e defesa contra uma chave de servico mal usada, que poderia gravar a pagina e a citacao juntas.
-- SECURITY DEFINER para ler plano_pagina e chamar normalizar_espacos como dono.
create or replace function guardar_candidata() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_texto text;
begin
  if TG_OP = 'DELETE' then
    raise exception 'promessa_candidata nao pode ser apagada' using errcode = '42501';
  end if;
  if current_setting('app.revisando', true) is distinct from 'on' then
    if TG_OP = 'UPDATE' then
      raise exception 'candidata so muda pelas funcoes editoriais' using errcode = '42501';
    end if;
    if NEW.estado <> 'pendente' or NEW.promessa_id is not null
       or NEW.decidido_por is not null or NEW.decidido_em is not null then
      raise exception 'candidata nova deve estar pendente' using errcode = '42501';
    end if;
  end if;
  if TG_OP = 'INSERT' then
    select texto into v_texto from plano_pagina where plano_id = NEW.plano_id and numero = NEW.pagina;
    if v_texto is null
       or position(normalizar_espacos(NEW.citacao) in normalizar_espacos(v_texto)) = 0 then
      raise exception 'citacao nao encontrada na pagina' using errcode = '23514';
    end if;
  end if;
  return NEW;
end;
$$;
create trigger candidata_guardar before insert or update or delete on promessa_candidata
  for each row execute function guardar_candidata();
create trigger candidata_sem_truncate before truncate on promessa_candidata
  for each statement execute function bloquear_alteracao_promessometro();

-- evidencia: nasce so pelas funcoes (registrar_evidencia, confirmar_vinculo); a unica alteracao possivel e a
-- retratacao (retirar_evidencia), que so preenche as tres colunas de retirada; nunca e apagada.
create or replace function guardar_evidencia() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'evidencia nao pode ser apagada' using errcode = '42501';
  end if;
  if current_setting('app.revisando', true) is distinct from 'on' then
    raise exception 'evidencia so pode ser gravada pelas funcoes editoriais' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE' and (
       OLD.retirada_em is not null
       or NEW.retirada_em is null
       or (to_jsonb(NEW) - 'retirada_em' - 'retirada_por' - 'retirada_nota')
          <> (to_jsonb(OLD) - 'retirada_em' - 'retirada_por' - 'retirada_nota')
     ) then
    raise exception 'evidencia so admite a retratacao' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
create trigger evidencia_guardar before insert or update or delete on evidencia
  for each row execute function guardar_evidencia();
create trigger evidencia_sem_truncate before truncate on evidencia
  for each statement execute function bloquear_alteracao_promessometro();

-- revisao_promessa: historico; nasce so pelas funcoes; nunca muda (nem service_role, nem o dono).
create trigger revisao_promessa_so_funcoes before insert on revisao_promessa
  for each row execute function exigir_funcao_editorial();
create trigger revisao_promessa_somente_insercao before update or delete on revisao_promessa
  for each row execute function bloquear_alteracao_promessometro();
create trigger revisao_promessa_sem_truncate before truncate on revisao_promessa
  for each statement execute function bloquear_alteracao_promessometro();

-- vinculo_ato_promessa: fora das funcoes, so sugestao da IA, para promessa publicada e ato a partir de 2027.
create or replace function guardar_vinculo() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'vinculo_ato_promessa nao pode ser apagado' using errcode = '42501';
  end if;
  if current_setting('app.revisando', true) is not distinct from 'on' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' then
    raise exception 'vinculo so muda pela funcao confirmar_vinculo' using errcode = '42501';
  end if;
  if NEW.origem <> 'ia' or NEW.estado <> 'sugerido' or NEW.decidido_por is not null or NEW.decidido_em is not null then
    raise exception 'vinculo novo deve ser sugestao pendente da ia' using errcode = '42501';
  end if;
  if not exists (select 1 from promessa where id = NEW.promessa_id and estado = 'publicada') then
    raise exception 'promessa nao publicada';
  end if;
  if not exists (select 1 from ato where id = NEW.ato_id and data_dou >= date '2027-01-01') then
    raise exception 'ato anterior a data de corte';
  end if;
  return NEW;
end;
$$;
create trigger vinculo_guardar before insert or update or delete on vinculo_ato_promessa
  for each row execute function guardar_vinculo();
create trigger vinculo_sem_truncate before truncate on vinculo_ato_promessa
  for each statement execute function bloquear_alteracao_promessometro();

-- proposta_status: fora das funcoes, so nasce pendente, para promessa publicada, status diferente do atual
-- e com evidencias ativas (nao retiradas) da propria promessa. A nova marca a anterior pendente como
-- substituida. SECURITY DEFINER para essa marcacao (service_role nao tem update). A marcacao e a unica
-- alteracao aceita fora das funcoes: so pendente -> substituida, so a coluna estado, e so a partir deste
-- gatilho (profundidade > 1).
create or replace function guardar_proposta() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status status_promessa;
  v_estado estado_publicacao;
  v_validas integer;
  v_pedidas integer;
begin
  if TG_OP = 'DELETE' then
    raise exception 'proposta_status nao pode ser apagada' using errcode = '42501';
  end if;

  if TG_OP = 'UPDATE' then
    if current_setting('app.revisando', true) is not distinct from 'on' then
      return NEW;
    end if;
    if pg_trigger_depth() > 1 and OLD.estado = 'pendente' and NEW.estado = 'substituida'
       and (to_jsonb(NEW) - 'estado') = (to_jsonb(OLD) - 'estado') then
      return NEW;
    end if;
    raise exception 'proposta so muda pelas funcoes editoriais' using errcode = '42501';
  end if;

  -- INSERT
  if current_setting('app.revisando', true) is distinct from 'on'
     and (NEW.estado <> 'pendente' or NEW.decidido_por is not null or NEW.decidido_em is not null or NEW.nota_decisao is not null) then
    raise exception 'proposta nova deve estar pendente' using errcode = '42501';
  end if;
  select status, estado into v_status, v_estado from promessa where id = NEW.promessa_id;
  if v_estado is distinct from 'publicada' then
    raise exception 'promessa nao publicada';
  end if;
  if NEW.status_proposto = v_status then
    raise exception 'status igual ao atual';
  end if;
  if array_position(NEW.evidencia_ids, null) is not null then
    raise exception 'evidencia invalida';
  end if;
  select count(distinct x) into v_pedidas from unnest(NEW.evidencia_ids) as x;
  select count(*) into v_validas from evidencia e
   where e.id = any(NEW.evidencia_ids) and e.promessa_id = NEW.promessa_id and e.retirada_em is null;
  if v_pedidas = 0 or v_validas <> v_pedidas then
    raise exception 'evidencia invalida';
  end if;

  update proposta_status set estado = 'substituida'
   where promessa_id = NEW.promessa_id and estado = 'pendente';
  return NEW;
end;
$$;
create trigger proposta_guardar before insert or update or delete on proposta_status
  for each row execute function guardar_proposta();
create trigger proposta_sem_truncate before truncate on proposta_status
  for each statement execute function bloquear_alteracao_promessometro();

-- Funcoes de gatilho nao sao chamadas pela API: ninguem precisa de execute nelas (o Postgres nao confere
-- execute ao disparar um gatilho).
revoke execute on function bloquear_alteracao_promessometro(), exigir_funcao_editorial(), guardar_plano_pagina(),
  guardar_promessa(), guardar_candidata(), guardar_evidencia(), guardar_vinculo(), guardar_proposta()
  from public, anon, authenticated, service_role;

-- A7) Importacao atomica do plano (so service_role).
-- importar_plano: grava plano + todas as paginas + todas as candidatas numa unica transacao.
-- Se qualquer parte falhar, nada fica gravado (nao existe "importacao pela metade" a desfazer).
-- SECURITY DEFINER: e o UNICO caminho de escrita do service_role nestas tres tabelas (ele nao tem insert
-- direto, entao nao ha plano pela metade nem candidata acrescentada depois). Os gatilhos de guarda continuam
-- valendo (a flag app.revisando fica desligada, logo candidata nova deve estar pendente). Execute so service_role.
-- Carga tipica: 84 paginas, cerca de 170 mil caracteres, bem abaixo dos limites da API.
create or replace function importar_plano(p_plano jsonb, p_paginas jsonb, p_candidatas jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_paginas integer;
  v_n_paginas integer;
  v_n_candidatas integer;
begin
  if jsonb_typeof(p_plano) is distinct from 'object'
     or jsonb_typeof(p_paginas) is distinct from 'array'
     or jsonb_typeof(p_candidatas) is distinct from 'array' then
    raise exception 'importacao invalida: formato';
  end if;
  -- Tipos conferidos ANTES de qualquer conversao, para a mensagem ser a estavel e nao um 22P02 cru.
  if jsonb_typeof(p_plano->'paginas') is distinct from 'number'
     or jsonb_typeof(p_plano->'ano_eleicao') is distinct from 'number'
     or exists (select 1 from jsonb_array_elements(p_paginas) e where jsonb_typeof(e) is distinct from 'string')
     or exists (select 1 from jsonb_array_elements(p_candidatas) c
                 where jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'pagina') is distinct from 'number') then
    raise exception 'importacao invalida: formato';
  end if;
  begin
    v_paginas := (p_plano->>'paginas')::integer;
    v_n_paginas := jsonb_array_length(p_paginas);
    if v_paginas is null or v_n_paginas <> v_paginas then
      raise exception 'importacao invalida: numero de paginas';
    end if;
    if exists (select 1 from plano where arquivo_sha256 = p_plano->>'arquivo_sha256') then
      raise exception 'plano ja importado';
    end if;

    insert into plano (titulo, candidato, cargo, ano_eleicao, fonte_url, arquivo_sha256, paginas)
    values (
      p_plano->>'titulo', p_plano->>'candidato', p_plano->>'cargo', (p_plano->>'ano_eleicao')::smallint,
      p_plano->>'fonte_url', p_plano->>'arquivo_sha256', v_paginas
    )
    returning id into v_id;

    insert into plano_pagina (plano_id, numero, texto)
    select v_id, t.n::integer, t.texto
      from jsonb_array_elements_text(p_paginas) with ordinality as t(texto, n);

    -- Candidata de pagina inexistente ou com citacao que nao esta na pagina: o gatilho guardar_candidata recusa
    -- e a transacao inteira e desfeita.
    insert into promessa_candidata (plano_id, pagina, citacao, titulo_sugerido, tema_sugerido, concretude, motivo_concretude, modelo, versao_prompt)
    select v_id, (c->>'pagina')::integer, c->>'citacao', c->>'titulo_sugerido', c->>'tema_sugerido',
           coalesce((c->>'concretude')::concretude_promessa, 'intermediaria'), c->>'motivo_concretude',
           c->>'modelo', c->>'versao_prompt'
      from jsonb_array_elements(p_candidatas) as c;
    get diagnostics v_n_candidatas = row_count;
  exception
    -- importacao simultanea do mesmo arquivo: a chave unica do sha256 decide, com a mesma mensagem estavel.
    when unique_violation then
      raise exception 'plano ja importado';
    -- numero fora da faixa, enum invalido, campo obrigatorio ausente.
    when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'importacao invalida: formato';
  end;

  return jsonb_build_object('plano_id', v_id, 'paginas', v_n_paginas, 'candidatas', v_n_candidatas);
end;
$$;
revoke execute on function importar_plano(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function importar_plano(jsonb, jsonb, jsonb) to service_role;

-- =====================================================================
-- PARTE B: funcoes do cadastro (editor autenticado)
-- Padrao das funcoes do editor: is_editor() primeiro; flag app.revisando; linha alvo travada com for update;
-- mensagens minusculas sem acento (src/lib/editorial/erros.ts depende delas).
-- =====================================================================

create or replace function aceitar_candidata(p_candidata_id uuid, p_titulo text, p_tema_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c promessa_candidata%rowtype;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_fonte text;
  v_id uuid;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_c from promessa_candidata where id = p_candidata_id for update;
  if not found then
    raise exception 'candidata nao encontrada';
  end if;
  if v_c.estado <> 'pendente' then
    raise exception 'candidata ja decidida';
  end if;
  if v_titulo = '' or p_tema_id is null or not exists (select 1 from tema where id = p_tema_id) then
    raise exception 'titulo e tema sao obrigatorios';
  end if;
  if length(v_titulo) > 140 then
    raise exception 'titulo acima do limite';
  end if;

  select fonte_url into v_fonte from plano where id = v_c.plano_id;

  insert into promessa (plano_id, tema_id, titulo, texto_original, pagina, fonte_url, status, estado)
  values (v_c.plano_id, p_tema_id, v_titulo, v_c.citacao, v_c.pagina, v_fonte, 'nao_iniciada', 'rascunho')
  returning id into v_id;

  update promessa_candidata
     set estado = 'aceita', promessa_id = v_id, decidido_por = auth.uid(), decidido_em = now()
   where id = p_candidata_id;

  return v_id;
end;
$$;

create or replace function descartar_candidata(p_candidata_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c promessa_candidata%rowtype;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_c from promessa_candidata where id = p_candidata_id for update;
  if not found then
    raise exception 'candidata nao encontrada';
  end if;
  if v_c.estado <> 'pendente' then
    raise exception 'candidata ja decidida';
  end if;

  update promessa_candidata
     set estado = 'descartada', decidido_por = auth.uid(), decidido_em = now()
   where id = p_candidata_id;
end;
$$;

-- Desfaz um descarte: a candidata volta a pendente. Candidata aceita nao volta (ja virou promessa).
create or replace function reabrir_candidata(p_candidata_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c promessa_candidata%rowtype;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_c from promessa_candidata where id = p_candidata_id for update;
  if not found then
    raise exception 'candidata nao encontrada';
  end if;
  if v_c.estado <> 'descartada' then
    raise exception 'so e possivel reabrir candidata descartada';
  end if;

  update promessa_candidata
     set estado = 'pendente', decidido_por = null, decidido_em = null
   where id = p_candidata_id;
end;
$$;

create or replace function editar_promessa(p_promessa_id uuid, p_titulo text, p_tema_id uuid, p_nota text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes promessa%rowtype;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_antes from promessa where id = p_promessa_id for update;
  if not found then
    raise exception 'promessa nao encontrada';
  end if;
  if v_antes.estado = 'retirada' then
    raise exception 'promessa retirada nao pode ser alterada';
  end if;
  if v_titulo = '' or p_tema_id is null or not exists (select 1 from tema where id = p_tema_id) then
    raise exception 'titulo e tema sao obrigatorios';
  end if;
  if length(v_titulo) > 140 then
    raise exception 'titulo acima do limite';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'nota acima do limite';
  end if;
  if v_antes.estado = 'publicada' and v_nota is null then
    raise exception 'nota e obrigatoria para alterar promessa publicada';
  end if;
  if v_titulo = v_antes.titulo and p_tema_id = v_antes.tema_id then
    return;
  end if;

  -- Publicada: e uma correcao, que aparece no site ("Corrigido em ..."). Rascunho: sem nota publica.
  update promessa
     set titulo = v_titulo,
         tema_id = p_tema_id,
         correcao_nota = case when v_antes.estado = 'publicada' then v_nota else null end,
         corrigido_em = case when v_antes.estado = 'publicada' then now() else null end
   where id = p_promessa_id;

  insert into revisao_promessa (promessa_id, editor_id, decisao, status_antes, status_depois, nota, valores_antes, valores_depois)
  values (
    p_promessa_id, auth.uid(), 'alterou_texto', v_antes.status, v_antes.status, v_nota,
    to_jsonb(v_antes),
    (select to_jsonb(p) from promessa p where p.id = p_promessa_id)
  );
end;
$$;

create or replace function publicar_promessa(p_promessa_id uuid, p_nota text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes promessa%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_antes from promessa where id = p_promessa_id for update;
  if not found then
    raise exception 'promessa nao encontrada';
  end if;
  if v_antes.estado = 'publicada' then
    raise exception 'promessa ja publicada';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'nota acima do limite';
  end if;
  -- ja esteve no ar antes (foi retirada): voltar exige nota.
  if v_antes.publicada_em is not null and v_nota is null then
    raise exception 'nota e obrigatoria para republicar';
  end if;

  -- Publicar (primeira vez ou de novo) nao e correcao: zera a nota de correcao.
  update promessa
     set estado = 'publicada', publicada_em = coalesce(publicada_em, now()),
         correcao_nota = null, corrigido_em = null
   where id = p_promessa_id;

  insert into revisao_promessa (promessa_id, editor_id, decisao, status_antes, status_depois, nota, valores_antes, valores_depois)
  values (
    p_promessa_id, auth.uid(),
    case when v_antes.publicada_em is null then 'publicou'::decisao_promessa else 'republicou'::decisao_promessa end,
    v_antes.status, v_antes.status, v_nota,
    to_jsonb(v_antes),
    (select to_jsonb(p) from promessa p where p.id = p_promessa_id)
  );
end;
$$;

create or replace function retirar_promessa(p_promessa_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes promessa%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_antes from promessa where id = p_promessa_id for update;
  if not found then
    raise exception 'promessa nao encontrada';
  end if;
  if v_antes.estado = 'retirada' then
    raise exception 'promessa ja retirada';
  end if;
  if v_nota is null then
    raise exception 'nota e obrigatoria para retirar';
  end if;
  if length(v_nota) > 500 then
    raise exception 'nota acima do limite';
  end if;

  -- Retirar nao e correcao: zera a nota de correcao (o motivo fica em revisao_promessa).
  update promessa set estado = 'retirada', correcao_nota = null, corrigido_em = null where id = p_promessa_id;

  insert into revisao_promessa (promessa_id, editor_id, decisao, status_antes, status_depois, nota, valores_antes, valores_depois)
  values (
    p_promessa_id, auth.uid(), 'retirou', v_antes.status, v_antes.status, v_nota,
    to_jsonb(v_antes),
    (select to_jsonb(p) from promessa p where p.id = p_promessa_id)
  );
end;
$$;

-- Privilegios: o Supabase da execute a anon/authenticated/service_role em funcoes novas; tiramos de todos
-- e devolvemos so a authenticated (a funcao ainda confere is_editor()).
revoke execute on function aceitar_candidata(uuid, text, uuid) from public, anon, service_role;
revoke execute on function descartar_candidata(uuid) from public, anon, service_role;
revoke execute on function reabrir_candidata(uuid) from public, anon, service_role;
revoke execute on function editar_promessa(uuid, text, uuid, text) from public, anon, service_role;
revoke execute on function publicar_promessa(uuid, text) from public, anon, service_role;
revoke execute on function retirar_promessa(uuid, text) from public, anon, service_role;
grant execute on function aceitar_candidata(uuid, text, uuid) to authenticated;
grant execute on function descartar_candidata(uuid) to authenticated;
grant execute on function reabrir_candidata(uuid) to authenticated;
grant execute on function editar_promessa(uuid, text, uuid, text) to authenticated;
grant execute on function publicar_promessa(uuid, text) to authenticated;
grant execute on function retirar_promessa(uuid, text) to authenticated;

-- =====================================================================
-- PARTE C: evidencias, decisao de status, propostas e vinculos (telas no Plano 2B)
-- =====================================================================

create or replace function registrar_evidencia(
  p_promessa_id uuid,
  p_tipo tipo_evidencia,
  p_fonte_url text,
  p_descricao text,
  p_data_fato date,
  p_ato_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado estado_publicacao;
  v_desc text := btrim(coalesce(p_descricao, ''));
  v_url text := nullif(btrim(coalesce(p_fonte_url, '')), '');
  v_data date := p_data_fato;
  v_ato ato%rowtype;
  v_id uuid;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select estado into v_estado from promessa where id = p_promessa_id for update;
  if not found then
    raise exception 'promessa nao encontrada';
  end if;
  if v_estado <> 'publicada' then
    raise exception 'promessa nao publicada';
  end if;
  if p_tipo is null then
    raise exception 'tipo de evidencia obrigatorio';
  end if;
  if v_desc = '' then
    raise exception 'descricao obrigatoria';
  end if;
  if length(v_desc) > 500 then
    raise exception 'descricao acima do limite';
  end if;

  if p_tipo = 'ato_dou' then
    select * into v_ato from ato where id = p_ato_id;
    if not found then
      raise exception 'ato nao encontrado';
    end if;
    -- Evidencia de ato: SEMPRE o link e a data do proprio ato; p_fonte_url e p_data_fato do chamador sao ignorados
    -- (senao um ato de 2026 passaria pela data de corte). Mesma regra de confirmar_vinculo.
    v_url := v_ato.url_dou;
    v_data := v_ato.data_dou;
    if exists (select 1 from evidencia where promessa_id = p_promessa_id and ato_id = p_ato_id and retirada_em is null) then
      raise exception 'evidencia ja registrada';
    end if;
  elsif p_ato_id is not null then
    raise exception 'ato so vale para evidencia do tipo ato_dou';
  end if;

  if v_url is null or v_url !~ '^https://' then
    raise exception 'fonte deve ser https';
  end if;
  if v_data is null or v_data < date '2027-01-01' then
    raise exception 'data do fato anterior a 2027-01-01';
  end if;
  if v_data > hoje_sp() then
    raise exception 'data do fato no futuro';
  end if;

  insert into evidencia (promessa_id, tipo, ato_id, fonte_url, descricao, data_fato, criado_por)
  values (p_promessa_id, p_tipo, case when p_tipo = 'ato_dou' then p_ato_id end, v_url, v_desc, v_data, auth.uid())
  returning id into v_id;

  if p_tipo = 'ato_dou' then
    insert into vinculo_ato_promessa (ato_id, promessa_id, origem, estado, justificativa, decidido_por, decidido_em)
    values (p_ato_id, p_promessa_id, 'editor', 'confirmado', v_desc, auth.uid(), now())
    on conflict (ato_id, promessa_id) do update
      set estado = 'confirmado', decidido_por = excluded.decidido_por, decidido_em = excluded.decidido_em;
  end if;

  return v_id;
end;
$$;

-- Retratacao: a evidencia sai do site e das decisoes, mas fica gravada com quem, quando e por que.
-- Se veio de um ato, o vinculo volta a 'rejeitado'. O status NAO muda sozinho: o editor decide depois.
create or replace function retirar_evidencia(p_evidencia_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ev evidencia%rowtype;
  v_promessa promessa%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_pid uuid;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  -- Ordem de travas igual em todas as funcoes: PROMESSA primeiro, depois evidencia/vinculo (evita deadlock).
  select promessa_id into v_pid from evidencia where id = p_evidencia_id;
  if not found then
    raise exception 'evidencia nao encontrada';
  end if;
  select * into v_promessa from promessa where id = v_pid for update;
  select * into v_ev from evidencia where id = p_evidencia_id for update;
  if v_ev.retirada_em is not null then
    raise exception 'evidencia ja retirada';
  end if;
  if v_nota is null then
    raise exception 'nota e obrigatoria para retirar evidencia';
  end if;
  if length(v_nota) > 500 then
    raise exception 'nota acima do limite';
  end if;

  update evidencia
     set retirada_em = now(), retirada_por = auth.uid(), retirada_nota = v_nota
   where id = p_evidencia_id;

  if v_ev.ato_id is not null then
    update vinculo_ato_promessa
       set estado = 'rejeitado', decidido_por = auth.uid(), decidido_em = now()
     where ato_id = v_ev.ato_id and promessa_id = v_ev.promessa_id;
  end if;

  -- Proposta pendente que cita a evidencia retirada perdeu o fundamento (flag ligada: o gatilho permite).
  update proposta_status
     set estado = 'substituida', decidido_por = auth.uid(), decidido_em = now()
   where promessa_id = v_ev.promessa_id and estado = 'pendente' and p_evidencia_id = any(evidencia_ids);

  insert into revisao_promessa (promessa_id, editor_id, decisao, status_antes, status_depois, nota, valores_antes, valores_depois)
  values (
    v_ev.promessa_id, auth.uid(), 'retirou_evidencia', v_promessa.status, v_promessa.status, v_nota,
    jsonb_build_object('evidencia', to_jsonb(v_ev)),
    jsonb_build_object('evidencia', (select to_jsonb(e) from evidencia e where e.id = p_evidencia_id))
  );
end;
$$;

create or replace function decidir_status(
  p_promessa_id uuid,
  p_status status_promessa,
  p_evidencia_ids uuid[],
  p_nota text,
  p_confirmou_fonte boolean default false,
  p_proposta_id uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes promessa%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_ids uuid[] := coalesce(p_evidencia_ids, '{}');
  v_pedidas integer;
  v_validas integer;
  v_prop proposta_status%rowtype;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_antes from promessa where id = p_promessa_id for update;
  if not found then
    raise exception 'promessa nao encontrada';
  end if;
  if v_antes.estado <> 'publicada' then
    raise exception 'promessa nao publicada';
  end if;
  if p_status is null then
    raise exception 'status obrigatorio';
  end if;
  if p_status = v_antes.status then
    raise exception 'status igual ao atual';
  end if;
  if v_nota is null then
    raise exception 'nota e obrigatoria para mudar status';
  end if;
  if length(v_nota) > 1000 then
    raise exception 'nota acima do limite';
  end if;

  -- Toda mudanca exige evidencia ativa, exceto a correcao de volta a nao_iniciada (so com nota).
  if cardinality(v_ids) = 0 and p_status <> 'nao_iniciada' then
    raise exception 'evidencia obrigatoria';
  end if;
  if cardinality(v_ids) > 0 then
    if array_position(v_ids, null) is not null then
      raise exception 'evidencia invalida';
    end if;
    select count(distinct x) into v_pedidas from unnest(v_ids) as x;
    select count(*) into v_validas from evidencia e
     where e.id = any(v_ids) and e.promessa_id = p_promessa_id and e.retirada_em is null
       and e.fonte_url ~ '^https://' and e.data_fato >= date '2027-01-01';
    if v_validas <> v_pedidas then
      raise exception 'evidencia invalida';
    end if;
  end if;

  if p_status in ('cumprida', 'abandonada') and p_confirmou_fonte is not true then
    raise exception 'confirmacao de fonte obrigatoria';
  end if;

  if p_proposta_id is not null then
    select * into v_prop from proposta_status where id = p_proposta_id for update;
    if not found or v_prop.promessa_id <> p_promessa_id or v_prop.estado <> 'pendente' then
      raise exception 'proposta invalida';
    end if;
  end if;

  update promessa set status = p_status, status_atualizado_em = now() where id = p_promessa_id;

  -- A proposta usada conta como aprovada so se o editor escolheu o mesmo status; senao, recusada.
  if p_proposta_id is not null then
    update proposta_status
       set estado = case when p_status = v_prop.status_proposto then 'aprovada'::estado_proposta else 'recusada'::estado_proposta end,
           decidido_por = auth.uid(), decidido_em = now(), nota_decisao = v_nota
     where id = p_proposta_id;
  end if;
  -- Qualquer outra proposta ainda pendente perdeu o objeto.
  update proposta_status
     set estado = 'substituida', decidido_por = auth.uid(), decidido_em = now()
   where promessa_id = p_promessa_id and estado = 'pendente';

  insert into revisao_promessa (
    promessa_id, editor_id, decisao, status_antes, status_depois, proposta_id, confirmou_fonte, nota, valores_antes, valores_depois
  ) values (
    p_promessa_id, auth.uid(), 'mudou_status', v_antes.status, p_status, p_proposta_id, coalesce(p_confirmou_fonte, false), v_nota,
    to_jsonb(v_antes),
    (select to_jsonb(p) from promessa p where p.id = p_promessa_id) || jsonb_build_object('evidencia_ids', to_jsonb(v_ids))
  );
end;
$$;

create or replace function recusar_proposta(p_proposta_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop proposta_status%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_prop from proposta_status where id = p_proposta_id for update;
  if not found or v_prop.estado <> 'pendente' then
    raise exception 'proposta invalida';
  end if;
  if v_nota is null then
    raise exception 'nota e obrigatoria para recusar';
  end if;
  if length(v_nota) > 1000 then
    raise exception 'nota acima do limite';
  end if;

  update proposta_status
     set estado = 'recusada', decidido_por = auth.uid(), decidido_em = now(), nota_decisao = v_nota
   where id = p_proposta_id;
end;
$$;

-- Confirmar exige a descricao escrita pelo editor: a justificativa da IA nunca vira texto publico.
create or replace function confirmar_vinculo(p_vinculo_id uuid, p_confirmar boolean, p_descricao text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_v vinculo_ato_promessa%rowtype;
  v_estado estado_publicacao;
  v_ato ato%rowtype;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_id uuid;
  v_pid uuid;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  if p_confirmar is null then
    raise exception 'decisao do vinculo obrigatoria';
  end if;

  -- Ordem de travas: PROMESSA primeiro, depois o vinculo (igual a registrar_evidencia e retirar_evidencia).
  select promessa_id into v_pid from vinculo_ato_promessa where id = p_vinculo_id;
  if not found then
    raise exception 'vinculo nao encontrado';
  end if;
  select estado into v_estado from promessa where id = v_pid for update;
  select * into v_v from vinculo_ato_promessa where id = p_vinculo_id for update;
  if v_v.estado <> 'sugerido' then
    raise exception 'vinculo ja decidido';
  end if;

  if not p_confirmar then
    update vinculo_ato_promessa
       set estado = 'rejeitado', decidido_por = auth.uid(), decidido_em = now()
     where id = p_vinculo_id;
    return null;
  end if;

  if v_desc is null then
    raise exception 'descricao obrigatoria';
  end if;
  if length(v_desc) > 500 then
    raise exception 'descricao acima do limite';
  end if;
  if v_estado is distinct from 'publicada' then
    raise exception 'promessa nao publicada';
  end if;
  select * into v_ato from ato where id = v_v.ato_id;
  if v_ato.data_dou < date '2027-01-01' then
    raise exception 'data do fato anterior a 2027-01-01';
  end if;
  if v_ato.data_dou > hoje_sp() then
    raise exception 'data do fato no futuro';
  end if;

  update vinculo_ato_promessa
     set estado = 'confirmado', decidido_por = auth.uid(), decidido_em = now()
   where id = p_vinculo_id;

  select id into v_id from evidencia
   where promessa_id = v_v.promessa_id and ato_id = v_v.ato_id and retirada_em is null;
  if v_id is null then
    insert into evidencia (promessa_id, tipo, ato_id, fonte_url, descricao, data_fato, criado_por)
    values (v_v.promessa_id, 'ato_dou', v_ato.id, v_ato.url_dou, v_desc, v_ato.data_dou, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function registrar_evidencia(uuid, tipo_evidencia, text, text, date, uuid) from public, anon, service_role;
revoke execute on function retirar_evidencia(uuid, text) from public, anon, service_role;
revoke execute on function decidir_status(uuid, status_promessa, uuid[], text, boolean, uuid) from public, anon, service_role;
revoke execute on function recusar_proposta(uuid, text) from public, anon, service_role;
revoke execute on function confirmar_vinculo(uuid, boolean, text) from public, anon, service_role;
grant execute on function registrar_evidencia(uuid, tipo_evidencia, text, text, date, uuid) to authenticated;
grant execute on function retirar_evidencia(uuid, text) to authenticated;
grant execute on function decidir_status(uuid, status_promessa, uuid[], text, boolean, uuid) to authenticated;
grant execute on function recusar_proposta(uuid, text) to authenticated;
grant execute on function confirmar_vinculo(uuid, boolean, text) to authenticated;
