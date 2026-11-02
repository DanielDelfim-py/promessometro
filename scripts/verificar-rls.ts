import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const anon = createClient(url, chave, { auth: { persistSession: false } });

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome} ${detalhe}`);
  if (!ok) falhas++;
}

const ato = await anon.from('ato').select('id').limit(1);
conferir('anon nao le ato', !!ato.error || (ato.data?.length ?? 0) === 0, JSON.stringify(ato.error?.message ?? 'sem linhas'));

const publico = await anon.from('ato_publico').select('id').limit(1);
conferir('anon le ato_publico', !publico.error, publico.error?.message ?? '');

const tema = await anon.from('tema').select('slug');
conferir('anon le temas', !tema.error && (tema.data?.length ?? 0) >= 13, `${tema.data?.length} temas`);

const rev = await anon.from('revisao').select('id').limit(1);
conferir('anon nao le revisao', !!rev.error || (rev.data?.length ?? 0) === 0);

const ins = await anon.from('ato').insert({ dou_id: 'x' });
conferir('anon nao insere ato', !!ins.error);

const rpc = await anon.rpc('revisar_ato', {
  p_ato_id: '00000000-0000-0000-0000-000000000000',
  p_decisao: 'aprovou',
  p_titulo: 'x',
  p_resumo: 'x',
  p_tema_id: '00000000-0000-0000-0000-000000000000',
});
conferir('anon nao executa revisar_ato', !!rpc.error, rpc.error?.message ?? '');

process.exit(falhas ? 1 : 0);
