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
language sql security definer set search_path = public stable as $$
  select exists (select 1 from editor where id = auth.uid());
$$;

create policy tema_leitura on tema for select to anon, authenticated using (true);
create policy editor_proprio on editor for select to authenticated using (id = auth.uid());
create policy ato_editor on ato for select to authenticated using (is_editor());
create policy rascunho_editor on rascunho_ia for select to authenticated using (is_editor());
create policy revisao_editor on revisao for select to authenticated using (is_editor());
create policy execucao_editor on execucao_coleta for select to authenticated using (is_editor());

revoke all on ato, rascunho_ia, revisao, editor, execucao_coleta from anon;
-- revisao é somente inserção (feita pela função revisar_ato); ninguém altera nem apaga.
revoke insert, update, delete on revisao from anon, authenticated;
revoke insert, update, delete on ato, rascunho_ia, editor, execucao_coleta from anon, authenticated;

create view ato_publico as
select
  a.id, a.tipo, a.numero, a.orgao, a.data_dou, a.secao, a.edicao_extra,
  a.titulo_publico as titulo, a.resumo_publico as resumo, a.url_dou, a.publicado_em,
  t.nome as tema_nome, t.slug as tema_slug
from ato a
join tema t on t.id = a.tema_id
where a.status = 'publicado';
grant select on ato_publico to anon, authenticated;

create or replace function revisar_ato(
  p_ato_id uuid,
  p_decisao decisao_revisao,
  p_titulo text,
  p_resumo text,
  p_tema_id uuid,
  p_nota text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_antes ato%rowtype;
  v_novo status_ato;
begin
  if not is_editor() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

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
