-- Conferencia da migracao 0003 (Task 7 do plano 2A).
-- Abra este arquivo, copie TUDO (Ctrl+A e depois Ctrl+C), cole numa nova consulta do Editor de SQL do
-- Supabase e execute. O resultado e UMA linha. Todas as colunas devem mostrar true.
-- Se a coluna migracao_aplicada mostrar false, a 0003 nao foi aplicada (e nada ficou pela metade).
-- Esta consulta SO LE: nao muda nada no banco. Se o Supabase mostrar um aviso de operacao
-- destrutiva, pode confirmar (os nomes dessas operacoes aparecem so como texto de conferencia).
select
  to_regtype('public.status_promessa') is not null as migracao_aplicada,
  (select count(*) = 8 from pg_tables
    where schemaname = 'public'
      and tablename in ('plano', 'plano_pagina', 'promessa_candidata', 'promessa', 'evidencia',
                        'vinculo_ato_promessa', 'proposta_status', 'revisao_promessa')) as oito_tabelas,
  (select count(*) = 8 from pg_tables
    where schemaname = 'public' and rowsecurity
      and tablename in ('plano', 'plano_pagina', 'promessa_candidata', 'promessa', 'evidencia',
                        'vinculo_ato_promessa', 'proposta_status', 'revisao_promessa')) as rls_ligada,
  case when to_regclass('public.promessa') is null then false
       else not has_table_privilege('service_role', 'public.promessa', 'UP' || 'DATE')
            and not has_table_privilege('service_role', 'public.promessa', 'INS' || 'ERT') end as chave_nao_muda_promessa,
  case when to_regclass('public.revisao_promessa') is null then false
       else not has_table_privilege('service_role', 'public.revisao_promessa', 'SELECT') end as chave_nao_le_historico,
  case when to_regclass('public.evidencia') is null then false
       else not has_table_privilege('service_role', 'public.evidencia', 'INS' || 'ERT') end as chave_nao_grava_evidencia,
  case when to_regclass('public.plano') is null then false
       else not has_table_privilege('service_role', 'public.plano', 'DEL' || 'ETE')
            and not has_table_privilege('service_role', 'public.plano', 'INS' || 'ERT')
            and not has_table_privilege('service_role', 'public.plano_pagina', 'INS' || 'ERT')
            and not has_table_privilege('service_role', 'public.promessa_candidata', 'INS' || 'ERT') end as chave_nao_grava_plano_direto,
  case when to_regclass('public.promessa') is null then false
       else not has_table_privilege('anon', 'public.promessa', 'SELECT') end as publico_nao_le_promessa,
  case when to_regclass('public.promessa_publica') is null then false
       else has_table_privilege('anon', 'public.promessa_publica', 'SELECT') end as publico_le_promessa_publica,
  case when to_regprocedure('public.publicar_promessa(uuid,text)') is null then false
       else not has_function_privilege('anon', 'public.publicar_promessa(uuid,text)', 'EXECUTE') end as publico_nao_publica,
  case when to_regprocedure('public.importar_plano(jsonb,jsonb,jsonb)') is null then false
       else has_function_privilege('service_role', 'public.importar_plano(jsonb,jsonb,jsonb)', 'EXECUTE')
            and not has_function_privilege('authenticated', 'public.importar_plano(jsonb,jsonb,jsonb)', 'EXECUTE')
            and not has_function_privilege('anon', 'public.importar_plano(jsonb,jsonb,jsonb)', 'EXECUTE') end as so_a_chave_importa,
  (select count(*) = 11 from pg_proc
    where pronamespace = 'public'::regnamespace and prosecdef
      and proname in ('aceitar_candidata', 'descartar_candidata', 'reabrir_candidata', 'editar_promessa',
                      'publicar_promessa', 'retirar_promessa', 'registrar_evidencia', 'retirar_evidencia',
                      'decidir_status', 'recusar_proposta', 'confirmar_vinculo')) as onze_funcoes_do_editor,
  coalesce((select a.attname = 'n_promessas' from pg_attribute a
             where a.attrelid = to_regclass('public.ato_publico') and a.attnum > 0
             order by a.attnum desc limit 1), false) as ato_publico_com_n_promessas,
  -- hoje_sp() comparada com a data real do servidor (tolerancia de um dia pela diferenca de fuso).
  -- query_to_xml executa a chamada so quando a funcao existe; sem a 0003 a coluna da false, sem erro.
  case when to_regprocedure('public.hoje_sp()') is null then false
       else query_to_xml('select (public.hoje_sp() between current_date - 1 and current_date + 1) as ok', false, true, '')::text
            like '%<ok>true</ok>%' end as hoje_sp_ok;
