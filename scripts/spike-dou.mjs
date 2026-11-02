const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const BASE = 'https://www.in.gov.br';
const headers = { 'user-agent': 'Mozilla/5.0 (promessometro-coletor)' };

const hoje = new Date();
const candidatos = [0, 1].map((voltar) => {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - voltar, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() };
});

let link = null;
for (const { ano, mes } of candidatos) {
  const url = `${BASE}/acesso-a-informacao/dados-abertos/base-de-dados?ano=${ano}&mes=${MESES[mes]}`;
  const r = await fetch(url, { headers });
  console.log('listagem', ano, MESES[mes], r.status);
  if (!r.ok) continue;
  const html = await r.text();
  const achados = [...html.matchAll(/\/documents\/\d+\/\d+\/(S01\d{6}[^/"'<>\s]*\.zip)\/[^"'<>\s]+/g)].map((m) => ({
    nome: m[1],
    href: m[0].replaceAll('&amp;', '&'),
  }));
  console.log('links S01:', achados.map((a) => a.nome));
  if (achados.length) {
    link = achados[0];
    break;
  }
}
if (!link) {
  console.error('FALHA: nenhum link S01 encontrado');
  process.exit(1);
}

const d = await fetch(BASE + link.href, { headers });
console.log('download', link.nome, d.status, 'content-length', d.headers.get('content-length'));
let bytes = 0;
for await (const pedaco of d.body) bytes += pedaco.length;
console.log('bytes baixados', bytes);
if (d.status !== 200 || bytes < 1_000_000) {
  console.error('FALHA: download incompleto');
  process.exit(1);
}
console.log('OK');
