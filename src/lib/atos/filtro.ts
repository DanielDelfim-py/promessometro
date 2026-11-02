import type { TipoAto } from '@/lib/dou/tipos';

export const ORDEM_FILTRO: TipoAto[] = [
  'decreto', 'mp', 'lei', 'veto', 'decreto_legislativo', 'emenda_constitucional', 'portaria',
];
export const TIPOS_PADRAO: TipoAto[] = ORDEM_FILTRO.filter((t) => t !== 'portaria');

export const ROTULO_TIPO: Record<TipoAto, string> = {
  decreto: 'Decreto',
  mp: 'Medida provisória',
  lei: 'Lei sancionada',
  veto: 'Veto',
  decreto_legislativo: 'Decreto legislativo',
  emenda_constitucional: 'Emenda constitucional',
  portaria: 'Portaria',
};
export const ROTULO_FILTRO: Record<TipoAto, string> = {
  decreto: 'Decretos',
  mp: 'Medidas provisórias',
  lei: 'Leis sancionadas',
  veto: 'Vetos',
  decreto_legislativo: 'Decretos legislativos',
  emenda_constitucional: 'Emendas constitucionais',
  portaria: 'Portarias',
};

export interface FiltroAtos {
  tipos: TipoAto[];
  tema: string | null;
}

export interface AtoPublico {
  id: string;
  tipo: TipoAto;
  numero: string | null;
  orgao: string;
  data_dou: string;
  secao: number;
  edicao_extra: boolean;
  titulo: string;
  resumo: string;
  url_dou: string;
  publicado_em: string;
  tema_nome: string;
  tema_slug: string;
}

type Params = Record<string, string | string[] | undefined>;

export function lerFiltro(sp: Params): FiltroAtos {
  const submetido = sp.f === '1';
  const bruto = sp.tipo === undefined ? [] : Array.isArray(sp.tipo) ? sp.tipo : [sp.tipo];
  const tipos = submetido ? bruto.filter((t): t is TipoAto => ORDEM_FILTRO.includes(t as TipoAto)) : TIPOS_PADRAO;
  const tema = typeof sp.tema === 'string' && sp.tema !== '' ? sp.tema : null;
  return { tipos, tema };
}
