export interface CamposXml {
  id: string;
  idMateria: string;
  artType: string;
  artCategory: string;
  pubDate: string;
  numberPage: string;
  editionNumber: string;
  pdfPage: string;
  identifica: string;
  ementa: string;
  texto: string;
}

const PADRAO: CamposXml = {
  id: '51956551',
  idMateria: '24538211',
  artType: 'Resolução',
  artCategory: 'Entidades de Fiscalização do Exercício das Profissões Liberais/Conselho Federal de Psicologia',
  pubDate: '29/10/2026',
  numberPage: '210',
  editionNumber: '205',
  pdfPage: 'http://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=29/10/2026&amp;jornal=515&amp;pagina=210',
  identifica: 'Resolução Nº 14, DE 16 DE outubro DE 2026',
  ementa: 'Altera a Resolução CFP nº 2, de 01 de abril de 2021.',
  texto: '<p class="identifica">Resolução Nº 14</p><p>Art. 1º Esta Resolução altera a anterior.</p>',
};

export function xmlAto(parcial: Partial<CamposXml> = {}): string {
  const v = { ...PADRAO, ...parcial };
  return `﻿<xml><article id="${v.id}" name="x" idOficio="1" pubName="DO1" artType="${v.artType}" pubDate="${v.pubDate}" artClass="00071" artCategory="${v.artCategory}" artSize="12" artNotes="" numberPage="${v.numberPage}" pdfPage="${v.pdfPage}" editionNumber="${v.editionNumber}" highlightType="" highlightPriority="" highlight="" highlightimage="" highlightimagename="" idMateria="${v.idMateria}">
  <body>
    <Identifica><![CDATA[ ${v.identifica}]]></Identifica>
    <Data><![CDATA[]]></Data>
    <Ementa><![CDATA[ ${v.ementa}]]></Ementa>
    <Titulo />
    <SubTitulo />
    <Texto><![CDATA[${v.texto}]]></Texto>
  </body>
</article></xml>`;
}
