-- Conferencia da importacao do plano de governo (Task 19 do plano 2A).
-- Abra este arquivo, copie TUDO (Ctrl+A e depois Ctrl+C), cole numa nova consulta do Editor de SQL do
-- Supabase e execute. O resultado e UMA linha sobre o plano importado mais recente.
-- Esperado para o plano real: planos_importados = 1, paginas_no_pdf = 84, paginas_gravadas = 84 e candidatas > 0.
-- Se a migracao 0003 nao foi aplicada, as contagens mostram 0 (sem erro).
-- Esta consulta so le; nao altera nada.
with x as (
  select case when to_regclass('public.plano') is null then null
    else query_to_xml($q$
      select
        (select count(*) from public.plano) as planos_importados,
        p.titulo,
        p.paginas as paginas_no_pdf,
        (select count(*) from public.plano_pagina pp where pp.plano_id = p.id) as paginas_gravadas,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id) as candidatas,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id and c.concretude = 'concreta') as concretas,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id and c.concretude = 'intermediaria') as intermediarias,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id and c.concretude = 'generica') as genericas,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id and c.estado = 'aceita') as aceitas,
        (select count(*) from public.promessa_candidata c where c.plano_id = p.id and c.estado = 'descartada') as descartadas,
        (select count(*) from public.promessa pr where pr.plano_id = p.id and pr.estado = 'publicada') as publicadas
      from (select 1) as um
      left join lateral (select * from public.plano order by criado_em desc limit 1) as p on true
    $q$, false, true, '') end as d
)
select
  coalesce(t.planos_importados, 0) as planos_importados,
  t.titulo,
  t.paginas_no_pdf,
  coalesce(t.paginas_gravadas, 0) as paginas_gravadas,
  coalesce(t.candidatas, 0) as candidatas,
  coalesce(t.concretas, 0) as concretas,
  coalesce(t.intermediarias, 0) as intermediarias,
  coalesce(t.genericas, 0) as genericas,
  coalesce(t.aceitas, 0) as aceitas,
  coalesce(t.descartadas, 0) as descartadas,
  coalesce(t.publicadas, 0) as publicadas
from (select 1) as um
left join x on true
left join lateral xmltable('/row' passing x.d columns
  planos_importados int path 'planos_importados',
  titulo text path 'titulo',
  paginas_no_pdf int path 'paginas_no_pdf',
  paginas_gravadas int path 'paginas_gravadas',
  candidatas int path 'candidatas',
  concretas int path 'concretas',
  intermediarias int path 'intermediarias',
  genericas int path 'genericas',
  aceitas int path 'aceitas',
  descartadas int path 'descartadas',
  publicadas int path 'publicadas') as t on true;
