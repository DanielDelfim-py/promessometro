import AdmZip from 'adm-zip';

export interface EntradaXml {
  dia: string;
  secao: 'DO1' | 'DO1E';
  nome: string;
  conteudo: string;
}

export async function baixarZip(url: string, fetchFn: typeof fetch = fetch): Promise<Buffer> {
  const r = await fetchFn(url, { headers: { 'user-agent': 'Mozilla/5.0 (promessometro-coletor)' } });
  if (r.status !== 200) throw new Error(`download do ZIP respondeu ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export function lerEntradas(zip: Buffer, dias: Set<string>): EntradaXml[] {
  const saida: EntradaXml[] = [];
  for (const e of new AdmZip(zip).getEntries()) {
    if (e.isDirectory) continue;
    const m = /^(\d{8})\/(DO1E?)\/([^/]+\.xml)$/.exec(e.entryName);
    if (!m || !dias.has(m[1])) continue;
    saida.push({
      dia: m[1],
      secao: m[2] as 'DO1' | 'DO1E',
      nome: m[3],
      conteudo: e.getData().toString('utf8'),
    });
  }
  return saida;
}
