-- 0002: corrigir e despublicar atos ja publicados.
-- Aplicar UMA vez, no SQL Editor do Supabase, ANTES de publicar o codigo novo.
-- A migration 0001 ja deve estar aplicada. Nao edite a 0001.

-- 1) Nova decisao de revisao. Este e o unico lugar do arquivo que cria o valor;
--    ele so e USADO dentro do corpo plpgsql de revisar_ato (item 4), que e compilado
--    de forma preguicosa (na primeira chamada), entao nao ha uso do valor novo na
--    mesma transacao em que ele foi criado.
alter type decisao_revisao add value if not exists 'despublicou';

-- 2) Nota e data da ultima correcao (ou da despublicacao, mantida como trilha).
alter table ato
  add column if not exists correcao_nota text,
  add column if not exists corrigido_em timestamptz;

-- 3) View publica: mesmas colunas e ordem da 0001, mais as duas novas ao final.
-- Esta view e propositalmente com direitos do dono (nao usa security_invoker):
-- assim anon nunca precisa de privilegio em ato. NAO troque para security_invoker,
-- pois a pagina publica deixaria de funcionar. O aviso do advisor do Supabase e esperado.
create or replace view ato_publico as
select
  a.id, a.tipo, a.numero, a.orgao, a.data_dou, a.secao, a.edicao_extra,
  a.titulo_publico as titulo, a.resumo_publico as resumo, a.url_dou, a.publicado_em,
  t.nome as tema_nome, t.slug as tema_slug,
  a.correcao_nota, a.corrigido_em
from ato a
join tema t on t.id = a.tema_id
where a.status = 'publicado';
grant select on ato_publico to anon, authenticated;

-- 4) revisar_ato: mesma assinatura da 0001; acrescenta 'corrigiu' com nota e 'despublicou'.
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
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
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
  elsif p_decisao = 'despublicou' then
    if v_antes.status <> 'publicado' then
      raise exception 'so e possivel despublicar ato publicado';
    end if;
    v_novo := 'descartado';
  else
    if v_antes.status not in ('coletado', 'rascunho') then
      raise exception 'ato ja revisado';
    end if;
    v_novo := case when p_decisao = 'descartou' then 'descartado' else 'publicado' end;
  end if;

  if p_decisao in ('corrigiu', 'despublicou') and v_nota is null then
    raise exception 'nota e obrigatoria para corrigir ou despublicar';
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
    publicado_em = case when v_novo = 'publicado' then coalesce(publicado_em, now()) else publicado_em end,
    correcao_nota = case when p_decisao in ('corrigiu', 'despublicou') then v_nota else correcao_nota end,
    corrigido_em = case when p_decisao in ('corrigiu', 'despublicou') then now() else corrigido_em end
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
