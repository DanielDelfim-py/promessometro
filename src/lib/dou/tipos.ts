export type TipoAto =
  | 'decreto'
  | 'mp'
  | 'lei'
  | 'veto'
  | 'decreto_legislativo'
  | 'emenda_constitucional'
  | 'portaria';

export interface AtoBruto {
  douId: string;
  artType: string;
  artCategory: string;
  orgao: string;
  dataDou: string;
  edicao: string;
  pagina: string;
  edicaoExtra: boolean;
  urlDou: string;
  identifica: string;
  ementa: string;
  texto: string;
}

export interface AtoClassificado extends AtoBruto {
  tipo: TipoAto;
  numero: string | null;
}
