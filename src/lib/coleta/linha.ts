import type { AtoClassificado } from '@/lib/dou/tipos';

const semNulo = (s: string) => s.replaceAll('\u0000', '');

export function paraLinha(a: AtoClassificado) {
  return {
    dou_id: a.douId,
    tipo: a.tipo,
    numero: a.numero,
    orgao: a.orgao,
    data_dou: a.dataDou,
    secao: 1,
    edicao_extra: a.edicaoExtra,
    edicao: a.edicao,
    pagina: a.pagina,
    titulo_original: semNulo(a.identifica),
    ementa: semNulo(a.ementa),
    texto_original: semNulo(a.texto),
    url_dou: a.urlDou,
    status: 'coletado' as const,
  };
}
