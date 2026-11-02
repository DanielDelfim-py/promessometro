export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const BASE = 'https://www.in.gov.br';
const CABECALHOS = { 'user-agent': 'Mozilla/5.0 (promessometro-coletor)' };

export interface LinkZip {
  nome: string;
  url: string;
  t: number;
}

export function extrairLinksSecao1(html: string, mes: number, ano: number, base = BASE): LinkZip[] {
  const sufixo = `${String(mes + 1).padStart(2, '0')}${ano}`;
  const vistos = new Set<string>();
  const links: LinkZip[] = [];
  for (const m of html.matchAll(/\/documents\/\d+\/\d+\/(S01\d{6}[^/"'<>\s]*\.zip)\/[^"'<>\s]+/g)) {
    const nome = m[1];
    if (nome.slice(3, 9) !== sufixo) continue;
    const url = base + m[0].replaceAll('&amp;', '&');
    if (vistos.has(url)) continue;
    vistos.add(url);
    const t = Number(/[?&]t=(\d+)/.exec(url)?.[1] ?? 0);
    links.push({ nome, url, t });
  }
  return links;
}

export function escolherLink(links: LinkZip[]): LinkZip | null {
  if (links.length === 0) return null;
  return links.reduce((melhor, l) => (l.t > melhor.t ? l : melhor));
}

export async function descobrirLinkMes(
  ano: number,
  mes: number,
  fetchFn: typeof fetch = fetch,
): Promise<LinkZip | null> {
  const url = `${BASE}/acesso-a-informacao/dados-abertos/base-de-dados?ano=${ano}&mes=${encodeURIComponent(MESES[mes])}`;
  const r = await fetchFn(url, { headers: CABECALHOS });
  if (!r.ok) throw new Error(`listagem do DOU respondeu ${r.status}`);
  return escolherLink(extrairLinksSecao1(await r.text(), mes, ano));
}
