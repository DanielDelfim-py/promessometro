export type AcaoEditorial = 'aprovou-ou-ajustou' | 'descartou' | 'corrigiu' | 'despublicou';

const ACOES: Record<string, AcaoEditorial> = {
  publicar: 'aprovou-ou-ajustou',
  descartar: 'descartou',
  corrigir: 'corrigiu',
  despublicar: 'despublicou',
};

export function decidirAcao(acao: string): AcaoEditorial | null {
  return Object.hasOwn(ACOES, acao) ? ACOES[acao] : null;
}
