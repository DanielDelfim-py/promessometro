import { XMLParser } from 'fast-xml-parser';
import type { AtoBruto } from './tipos';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function dataIso(pubDate: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(pubDate.trim());
  if (!m) throw new Error(`pubDate invalida: ${pubDate}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseAto(xml: string, edicaoExtra: boolean): AtoBruto {
  const doc = parser.parse(xml.replace(/^﻿/, ''));
  const art = doc?.xml?.article;
  if (!art) throw new Error('XML sem <article>');

  for (const attr of ['@_idMateria', '@_artType', '@_pubDate']) {
    if (!str(art[attr])) throw new Error(`XML sem ${attr.slice(2)}`);
  }

  const urlDou = str(art['@_pdfPage']).replace(/^http:/, 'https:');
  if (!urlDou.startsWith('https://')) throw new Error('XML sem pdfPage https valido');

  const body = art.body ?? {};
  const artCategory = str(art['@_artCategory']);
  return {
    douId: str(art['@_idMateria']),
    artType: str(art['@_artType']),
    artCategory,
    orgao: artCategory.split('/')[0].trim(),
    dataDou: dataIso(str(art['@_pubDate'])),
    edicao: str(art['@_editionNumber']),
    pagina: str(art['@_numberPage']),
    edicaoExtra,
    urlDou,
    identifica: str(body.Identifica) || str(art['@_name']),
    ementa: str(body.Ementa),
    texto: str(body.Texto),
  };
}
