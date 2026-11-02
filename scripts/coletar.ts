import { coletar } from '@/lib/coleta/coletar';
import { criarClienteAdmin } from '@/lib/supabase/admin';

const dias = Number(process.argv[2] ?? 3);
if (!Number.isInteger(dias) || dias < 0 || dias > 120) {
  console.error('uso: npm run coletar -- <dias retroativos, 0..120>');
  process.exit(2);
}

const r = await coletar({ supabase: criarClienteAdmin(), diasRetroativos: dias });
console.log(`lidos=${r.lidos} relevantes=${r.relevantes} novos=${r.novos} falhas=${r.falhas}`);
