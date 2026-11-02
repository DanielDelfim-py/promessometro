export const MENSAGENS_ERRO: Record<string, string> = {
  'ato-ja-revisado': 'Este ato já foi revisado por outra pessoa.',
  'sem-permissao': 'Você não tem permissão para esta ação.',
  'dados-invalidos': 'Título, resumo e tema são obrigatórios para publicar.',
  'nota-obrigatoria': 'A nota é obrigatória para corrigir ou despublicar.',
  'ato-nao-publicado': 'Este ato não está publicado.',
  'acao-invalida': 'Ação inválida.',
  'texto-longo': 'Texto acima do limite de tamanho.',
  'falha-ia': 'Não foi possível gerar o resumo com a IA. Tente novamente.',
  'ato-invalido': 'Ato inválido.',
  erro: 'Não foi possível concluir a ação. Tente novamente.',
};

export function codigoDeErro(mensagem: string | undefined | null): string {
  const m = mensagem ?? '';
  if (m.includes('ato ja revisado')) return 'ato-ja-revisado';
  if (m.includes('sem permissao')) return 'sem-permissao';
  if (m.includes('nota e obrigatoria')) return 'nota-obrigatoria';
  if (m.includes('so e possivel corrigir') || m.includes('so e possivel despublicar')) return 'ato-nao-publicado';
  if (m.includes('obrigatorios')) return 'dados-invalidos';
  return 'erro';
}

export function mensagemDeErro(codigo: string | undefined): string | null {
  if (!codigo) return null;
  return Object.hasOwn(MENSAGENS_ERRO, codigo) ? MENSAGENS_ERRO[codigo] : MENSAGENS_ERRO.erro;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: string): boolean => UUID.test(v);
