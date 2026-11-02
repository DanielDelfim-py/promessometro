'use server';
import Anthropic from '@anthropic-ai/sdk';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decidirAcao } from '@/lib/editorial/acoes';
import { codigoDeErro, ehUuid } from '@/lib/editorial/erros';
import { decidir } from '@/lib/editorial/decidir';
import { gerarRascunho, salvarRascunho } from '@/lib/ia/gerarRascunho';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { exigirEditor } from '@/lib/supabase/servidor';

export async function revisarAto(formData: FormData) {
  const { supabase } = await exigirEditor();
  const atoId = String(formData.get('ato_id'));
  if (!ehUuid(atoId)) redirect('/editorial?erro=ato-invalido');
  const acao = String(formData.get('acao'));
  const titulo = String(formData.get('titulo') ?? '');
  const resumo = String(formData.get('resumo') ?? '');
  const temaId = String(formData.get('tema_id') ?? '');
  const nota = String(formData.get('nota') ?? '').trim() || null;

  const tipoAcao = decidirAcao(acao);
  if (!tipoAcao) redirect(`/editorial/ato/${atoId}?erro=acao-invalida`);
  if (titulo.length > 140 || resumo.length > 600 || (nota?.length ?? 0) > 500) {
    redirect(`/editorial/ato/${atoId}?erro=texto-longo`);
  }
  if ((tipoAcao === 'corrigiu' || tipoAcao === 'despublicou') && !nota) {
    redirect(`/editorial/ato/${atoId}?erro=nota-obrigatoria`);
  }

  let decisao: 'aprovou' | 'ajustou' | 'descartou' | 'corrigiu' | 'despublicou';
  if (tipoAcao === 'aprovou-ou-ajustou') {
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
  } else {
    decisao = tipoAcao;
  }

  const { error } = await supabase.rpc('revisar_ato', {
    p_ato_id: atoId,
    p_decisao: decisao,
    // despublicar/descartar: a funcao ignora titulo/resumo/tema.
    p_titulo: decisao === 'despublicou' ? '' : titulo,
    p_resumo: decisao === 'despublicou' ? '' : resumo,
    p_tema_id: decisao === 'despublicou' ? null : temaId || null,
    p_nota: nota,
  });
  if (error) redirect(`/editorial/ato/${atoId}?erro=${codigoDeErro(error.message)}`);

  revalidatePath('/editorial');
  revalidatePath('/atos');
  redirect(
    decisao === 'corrigiu' || decisao === 'despublicou' ? '/editorial?aba=publicados' : '/editorial',
  );
}

export async function gerarResumoPortaria(formData: FormData) {
  const { supabase } = await exigirEditor();
  const atoId = String(formData.get('ato_id'));
  if (!ehUuid(atoId)) redirect('/editorial?erro=ato-invalido');
  const admin = criarClienteAdmin();
  const modelo = process.env.IA_MODELO ?? 'claude-haiku-5-5';

  const { data: ato } = await supabase
    .from('ato')
    .select('id, tipo, numero, orgao, titulo_original, ementa, texto_original, status')
    .eq('id', atoId)
    .single();
  const { data: temas } = await supabase.from('tema').select('slug, nome');
  if (!ato || !temas || ato.status !== 'coletado') redirect('/editorial?aba=portarias');

  try {
    const r = await gerarRascunho(new Anthropic(), ato, temas, modelo);
    await salvarRascunho(admin, ato.id, r, modelo);
  } catch (e) {
    console.error(`gerarResumoPortaria ${atoId}: ${e instanceof Error ? e.message : String(e)}`);
    redirect(`/editorial/ato/${atoId}?erro=falha-ia`);
  }
  redirect(`/editorial/ato/${atoId}`);
}
