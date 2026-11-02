import type { TipoAto } from './tipos';

const normaliza = (s: string) => s.trim().replace(/\s+/g, ' ');

export function classificarTipo(artType: string, artCategory: string, texto: string): TipoAto | null {
  const t = normaliza(artType);
  if (t === 'Decreto numerado' || t === 'Decreto não numerado') return 'decreto';
  if (t === 'Medida Provisória') return 'mp';
  if (t === 'Lei' || t === 'Lei Complementar') return 'lei';
  if (t === 'Decreto Legislativo') return 'decreto_legislativo';
  if (t === 'Emenda Constitucional') return 'emenda_constitucional';
  if (t.startsWith('Portaria')) return 'portaria';
  if (t === 'Mensagem' && /Despachos do Presidente da República/i.test(artCategory) && /\bveto/i.test(texto)) {
    return 'veto';
  }
  return null;
}

export function extrairNumero(identifica: string): string | null {
  const m = /N[º°]\s*([\d.]*\d)/i.exec(identifica);
  return m ? m[1] : null;
}
