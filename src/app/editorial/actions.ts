'use server';
import Anthropic from '@anthropic-ai/sdk';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decidir } from '@/lib/editorial/decidir';
import { gerarRascunho, salvarRascunho } from '@/lib/ia/gerarRascunho';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { exigirEditor } from '@/lib/supabase/servidor';

export async function revisarAto(formData: FormData) {
  const { supabase } = await exigirEditor();
  const atoId = String(formData.get('ato_id'));
  const acao = String(formData.get('acao'));
  const titulo = String(formData.get('titulo') ?? '');
  const resumo = String(formData.get('resumo') ?? '');
  const temaId = String(formData.get('tema_id') ?? '');
  const nota = String(formData.get('nota') ?? '').trim() || null;

  let decisao: 'aprovou' | 'ajustou' | 'descartou';
  if (acao === 'descartar') {
    decisao = 'descartou';
  } else {
    const { data: r } = await supabase
      .from('rascunho_ia')
      .select('titulo_sugerido, resumo_sugerido, tema_sugerido')
      .eq('ato_id', atoId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    let sugerido = null;
    if (r) {
      const { data: t } = await supabase.from('tema').select('id').eq('slug', r.tema_sugerido).maybeSingle();
      sugerido = { titulo: r.titulo_sugerido, resumo: r.resumo_sugerido, temaId: t?.id ?? null };
    }
    decisao = decidir({ titulo, resumo, temaId }, sugerido);
  }

  const { error } = await supabase.rpc('revisar_ato', {
    p_ato_id: atoId,
    p_decisao: decisao,
    p_titulo: titulo,
    p_resumo: resumo,
    p_tema_id: temaId || null,
    p_nota: nota,
  });
  if (error) redirect(`/editorial/ato/${atoId}?erro=${encodeURIComponent(error.message)}`);

  revalidatePath('/editorial');
  revalidatePath('/atos');
  redirect('/editorial');
}

export async function gerarResumoPortaria(formData: FormData) {
  await exigirEditor();
  const atoId = String(formData.get('ato_id'));
  const admin = criarClienteAdmin();
  const modelo = process.env.IA_MODELO ?? 'claude-haiku-5-5';

  const { data: ato } = await admin
    .from('ato')
    .select('id, tipo, numero, orgao, titulo_original, ementa, texto_original, status')
    .eq('id', atoId)
    .single();
  const { data: temas } = await admin.from('tema').select('slug, nome');
  if (!ato || !temas || ato.status !== 'coletado') redirect('/editorial?aba=portarias');

  try {
    const r = await gerarRascunho(new Anthropic(), ato, temas, modelo);
    await salvarRascunho(admin, ato.id, r, modelo);
  } catch (e) {
    redirect(`/editorial/ato/${atoId}?erro=${encodeURIComponent(e instanceof Error ? e.message : 'falha na IA')}`);
  }
  redirect(`/editorial/ato/${atoId}`);
}
