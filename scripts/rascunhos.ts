import Anthropic from '@anthropic-ai/sdk';
import { gerarRascunho, salvarRascunho, type AtoParaIA } from '@/lib/ia/gerarRascunho';
import { criarClienteAdmin } from '@/lib/supabase/admin';

const MODELO = process.env.IA_MODELO ?? 'claude-haiku-5-5';
const MAX = Number(process.env.IA_MAX_POR_EXECUCAO ?? 40);

const supabase = criarClienteAdmin();
const cliente = new Anthropic();

const { data: temas, error: e1 } = await supabase.from('tema').select('slug, nome');
if (e1 || !temas) throw new Error(`temas: ${e1?.message}`);

const { data: atos, error: e2 } = await supabase
  .from('ato')
  .select('id, tipo, numero, orgao, titulo_original, ementa, texto_original')
  .eq('status', 'coletado')
  .neq('tipo', 'portaria')
  .order('data_dou', { ascending: false })
  .limit(MAX);
if (e2 || !atos) throw new Error(`atos: ${e2?.message}`);

let ok = 0;
let falhas = 0;
for (const a of atos) {
  try {
    const r = await gerarRascunho(cliente, a as AtoParaIA, temas, MODELO);
    await salvarRascunho(supabase, a.id, r, MODELO);
    ok++;
  } catch (e) {
    falhas++;
    console.error(`ato ${a.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`rascunhos gerados=${ok} falhas=${falhas} (limite ${MAX}, modelo ${MODELO})`);
if (atos.length > 0 && ok === 0) process.exit(1);
