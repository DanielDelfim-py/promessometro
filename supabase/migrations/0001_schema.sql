create type tipo_ato as enum ('decreto', 'mp', 'lei', 'veto', 'decreto_legislativo', 'emenda_constitucional', 'portaria');
create type status_ato as enum ('coletado', 'rascunho', 'publicado', 'descartado');
create type decisao_revisao as enum ('aprovou', 'ajustou', 'descartou', 'corrigiu');

create table tema (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  slug text not null unique
);

create table editor (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default 'editor' check (papel in ('editor', 'admin'))
);

create table ato (
  id uuid primary key default gen_random_uuid(),
  dou_id text not null unique,
  tipo tipo_ato not null,
  numero text,
  orgao text not null,
  data_dou date not null,
  secao smallint not null default 1,
  edicao_extra boolean not null default false,
  edicao text,
  pagina text,
  titulo_original text not null,
  ementa text,
  texto_original text not null,
  url_dou text not null,
  status status_ato not null default 'coletado',
  tema_id uuid references tema (id),
  titulo_publico text,
  resumo_publico text,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint publicado_completo check (
    status <> 'publicado'
    or (titulo_publico is not null and resumo_publico is not null and tema_id is not null and publicado_em is not null)
  )
);
create index ato_status_data on ato (status, data_dou desc);
create index ato_tipo on ato (tipo);

create table rascunho_ia (
  id uuid primary key default gen_random_uuid(),
  ato_id uuid not null references ato (id) on delete cascade,
  titulo_sugerido text not null,
  resumo_sugerido text not null,
  tema_sugerido text not null,
  observacao text,
  modelo text not null,
  versao_prompt text not null,
  criado_em timestamptz not null default now()
);
create index rascunho_ia_ato on rascunho_ia (ato_id, criado_em desc);

create table revisao (
  id uuid primary key default gen_random_uuid(),
  ato_id uuid not null references ato (id),
  editor_id uuid not null references editor (id),
  decisao decisao_revisao not null,
  valores_antes jsonb not null,
  valores_depois jsonb not null,
  nota text,
  criado_em timestamptz not null default now()
);

create table execucao_coleta (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  status text not null check (status in ('ok', 'erro')),
  qtd_atos integer not null default 0,
  erro text,
  criado_em timestamptz not null default now()
);

-- Segurança: RLS em tudo; o público não lê nenhuma tabela diretamente.
alter table tema enable row level security;
alter table editor enable row level security;
alter table ato enable row level security;
alter table rascunho_ia enable row level security;
alter table revisao enable row level security;
alter table execucao_coleta enable row level security;

create or replace function is_editor() returns boolean
language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from editor where id = auth.uid());
$$;
revoke execute on function is_editor() from public, anon;
grant execute on function is_editor() to authenticated;

create policy tema_leitura on tema for select to anon, authenticated using (true);
create policy editor_proprio on editor for select to authenticated using (id = auth.uid());
create policy ato_editor on ato for select to authenticated using (is_editor());
create policy rascunho_editor on rascunho_ia for select to authenticated using (is_editor());
create policy revisao_editor on revisao for select to authenticated using (is_editor());
create policy execucao_editor on execucao_coleta for select to authenticated using (is_editor());

-- Privilégios explícitos (não dependem dos grants padrão do Supabase).
-- service_role ignora RLS, por isso os triggers abaixo protegem publicação e revisao.
revoke all on tema, editor, ato, rascunho_ia, revisao, execucao_coleta from anon, authenticated, service_role;
grant select on tema to anon, authenticated;
grant select on editor, ato, rascunho_ia, revisao, execucao_coleta to authenticated;
grant select, insert, update, delete on tema, ato, rascunho_ia, execucao_coleta, editor to service_role;
-- revisao é somente inserção, inclusive para service_role.
grant select, insert on revisao to service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Publicação só pela função revisar_ato (vale também para service_role).
create or replace function guardar_publicacao() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_publica boolean;
begin
  if NEW.status is distinct from 'publicado' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    v_publica := true;
  else
    v_publica := OLD.status is distinct from 'publicado'
      or NEW.titulo_publico is distinct from OLD.titulo_publico
      or NEW.resumo_publico is distinct from OLD.resumo_publico
      or NEW.tema_id is distinct from OLD.tema_id
      or NEW.publicado_em is distinct from OLD.publicado_em;
  end if;

  if v_publica and current_setting('app.revisando', true) is distinct from 'on' then
    raise exception 'publicacao so e permitida pela funcao revisar_ato' using errcode = '42501';
  end if;

  return NEW;
end;
$$;

create trigger ato_guardar_publicacao
  before insert or update on ato
  for each row execute function guardar_publicacao();

-- revisao é append-only: nem service_role altera, apaga ou trunca.
create or replace function bloquear_alteracao_revisao() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'revisao e somente insercao' using errcode = '42501';
  return null;
end;
$$;

create trigger revisao_somente_insercao
  before update or delete on revisao
  for each row execute function bloquear_alteracao_revisao();

create trigger revisao_sem_truncate
  before truncate on revisao
  for each statement execute function bloquear_alteracao_revisao();

create view ato_publico as
select
  a.id, a.tipo, a.numero, a.orgao, a.data_dou, a.secao, a.edicao_extra,
  a.titulo_publico as titulo, a.resumo_publico as resumo, a.url_dou, a.publicado_em,
  t.nome as tema_nome, t.slug as tema_slug
from ato a
join tema t on t.id = a.tema_id
where a.status = 'publicado';
revoke all on ato_publico from anon, authenticated, service_role;
grant select on ato_publico to anon, authenticated;

create or replace function revisar_ato(
  p_ato_id uuid,
  p_decisao decisao_revisao,
  p_titulo text,
  p_resumo text,
  p_tema_id uuid,
  p_nota text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes ato%rowtype;
  v_novo status_ato;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  perform set_config('app.revisando', 'on', true);

  select * into v_antes from ato where id = p_ato_id for update;
  if not found then
    raise exception 'ato nao encontrado';
  end if;

  if p_decisao = 'corrigiu' then
    if v_antes.status <> 'publicado' then
      raise exception 'so e possivel corrigir ato publicado';
    end if;
    v_novo := 'publicado';
  else
    if v_antes.status not in ('coletado', 'rascunho') then
      raise exception 'ato ja revisado';
    end if;
    v_novo := case when p_decisao = 'descartou' then 'descartado' else 'publicado' end;
  end if;

  if v_novo = 'publicado' and (
    coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_resumo), '') = '' or p_tema_id is null
  ) then
    raise exception 'titulo, resumo e tema sao obrigatorios para publicar';
  end if;

  update ato set
    status = v_novo,
    titulo_publico = case when v_novo = 'publicado' then trim(p_titulo) else titulo_publico end,
    resumo_publico = case when v_novo = 'publicado' then trim(p_resumo) else resumo_publico end,
    tema_id = case when v_novo = 'publicado' then p_tema_id else tema_id end,
    publicado_em = case when v_novo = 'publicado' then coalesce(publicado_em, now()) else publicado_em end
  where id = p_ato_id;

  insert into revisao (ato_id, editor_id, decisao, valores_antes, valores_depois, nota)
  values (
    p_ato_id, auth.uid(), p_decisao,
    to_jsonb(v_antes) - 'texto_original',
    (select to_jsonb(a) - 'texto_original' from ato a where a.id = p_ato_id),
    p_nota
  );
end;
$$;
revoke execute on function revisar_ato(uuid, decisao_revisao, text, text, uuid, text) from public, anon;
grant execute on function revisar_ato(uuid, decisao_revisao, text, text, uuid, text) to authenticated;

insert into tema (nome, slug) values
  ('Administração pública', 'administracao-publica'),
  ('Assistência social', 'assistencia-social'),
  ('Economia', 'economia'),
  ('Educação', 'educacao'),
  ('Energia', 'energia'),
  ('Infraestrutura', 'infraestrutura'),
  ('Justiça', 'justica'),
  ('Meio ambiente', 'meio-ambiente'),
  ('Relações exteriores', 'relacoes-exteriores'),
  ('Saúde', 'saude'),
  ('Segurança', 'seguranca'),
  ('Trabalho e previdência', 'trabalho-previdencia'),
  ('Outros', 'outros');
