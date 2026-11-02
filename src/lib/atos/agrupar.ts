import type { AtoPublico } from './filtro';

const br = (iso: string) => iso.split('-').reverse().join('/');

export function agruparPorData(atos: AtoPublico[], hoje: string): { rotulo: string; atos: AtoPublico[] }[] {
  const grupos: { rotulo: string; atos: AtoPublico[] }[] = [];
  for (const a of atos) {
    const rotulo = a.data_dou === hoje ? `Hoje · ${br(a.data_dou)}` : br(a.data_dou);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.rotulo === rotulo) ultimo.atos.push(a);
    else grupos.push({ rotulo, atos: [a] });
  }
  return grupos;
}
