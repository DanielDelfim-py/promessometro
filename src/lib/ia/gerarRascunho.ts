import type { SupabaseClient } from '@supabase/supabase-js';
import { htmlParaTexto } from './texto';

export const VERSAO_PROMPT = 'v1';
const MAX_TEXTO = 12_000;
const MAX_TITULO = 140;
const MAX_RESUMO = 600;

export interface AtoParaIA {
  tipo: string;
  numero: string | null;
  orgao: string;
  titulo_original: string;
  ementa: string | null;
  texto_original: string;
}
export interface Tema {
  slug: string;
  nome: string;
}
export interface RascunhoGerado {
  titulo: string;
  resumo: string;
  tema: string;
  observacao: string | null;
}
export interface ClienteIA {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: { create(args: any): Promise<{ content: any[] }> };
}

const SISTEMA = `Você prepara rascunhos de resumo de atos oficiais do Diário Oficial da União para uma plataforma apartidária de acompanhamento do governo federal. Um editor humano revisa tudo antes de publicar.

Regras:
1. Use apenas fatos presentes no texto do ato. Não acrescente contexto, opinião, previsão nem julgamento.
2. Nenhum adjetivo valorativo (nada de "importante", "polêmico", "histórico").
3. Linguagem simples, frases curtas, para quem não é especialista.
4. O resumo diz o que muda, para quem e a partir de quando, em até três linhas (máximo ${MAX_RESUMO} caracteres). Se o texto não informar algum desses pontos, não o mencione.
5. O título descreve o assunto do ato em até 90 caracteres, sem repetir o número do ato.
6. Escolha exatamente um tema da lista. Se nenhum servir, use "outros".
7. Se o ato for um veto, informe qual projeto de lei e quais dispositivos foram vetados, sem avaliar o mérito.
8. Use o campo observacao apenas para avisar o editor de dúvidas (por exemplo: "o texto não parece tratar de veto"). Deixe vazio se não houver.`;

function ferramenta(slugs: string[]) {
  return {
    name: 'registrar_rascunho',
    description: 'Registra o rascunho de título, resumo e tema do ato.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        resumo: { type: 'string' },
        tema: { type: 'string', enum: slugs },
        observacao: { type: 'string', description: 'Dúvidas ou ressalvas para o editor; vazio se não houver.' },
      },
      required: ['titulo', 'resumo', 'tema'],
    },
  };
}

function montarMensagem(ato: AtoParaIA, temas: Tema[]): string {
  const texto = htmlParaTexto(ato.texto_original).slice(0, MAX_TEXTO);
  return [
    `Tipo: ${ato.tipo}${ato.numero ? ` nº ${ato.numero}` : ''}`,
    `Órgão: ${ato.orgao}`,
    `Identificação: ${ato.titulo_original}`,
    ato.ementa ? `Ementa: ${ato.ementa}` : '',
    `Temas disponíveis: ${temas.map((t) => `${t.slug} (${t.nome})`).join(', ')}`,
    '',
    'Texto do ato:',
    texto,
  ].join('\n');
}

function validar(input: unknown, slugs: string[]): RascunhoGerado {
  const o = (input ?? {}) as Record<string, unknown>;
  const titulo = typeof o.titulo === 'string' ? o.titulo.trim() : '';
  const resumo = typeof o.resumo === 'string' ? o.resumo.trim() : '';
  if (!titulo) throw new Error('rascunho sem titulo');
  if (!resumo) throw new Error('rascunho sem resumo');
  if (titulo.length > MAX_TITULO || resumo.length > MAX_RESUMO) throw new Error('rascunho acima do limite de tamanho');
  const tema = typeof o.tema === 'string' && slugs.includes(o.tema) ? o.tema : 'outros';
  const obs = typeof o.observacao === 'string' ? o.observacao.trim() : '';
  return { titulo, resumo, tema, observacao: obs || null };
}

export async function gerarRascunho(
  cliente: ClienteIA,
  ato: AtoParaIA,
  temas: Tema[],
  modelo: string,
): Promise<RascunhoGerado> {
  const slugs = temas.map((t) => t.slug);
  const resp = await cliente.messages.create({
    model: modelo,
    max_tokens: 700,
    system: SISTEMA,
    tools: [ferramenta(slugs)],
    tool_choice: { type: 'tool', name: 'registrar_rascunho' },
    messages: [{ role: 'user', content: montarMensagem(ato, temas) }],
  });
  const bloco = resp.content.find((b) => b.type === 'tool_use' && b.name === 'registrar_rascunho');
  if (!bloco) throw new Error('resposta sem tool_use registrar_rascunho');
  return validar(bloco.input, slugs);
}

export async function salvarRascunho(
  supabase: SupabaseClient,
  atoId: string,
  r: RascunhoGerado,
  modelo: string,
): Promise<void> {
  const ins = await supabase.from('rascunho_ia').insert({
    ato_id: atoId,
    titulo_sugerido: r.titulo,
    resumo_sugerido: r.resumo,
    tema_sugerido: r.tema,
    observacao: r.observacao,
    modelo,
    versao_prompt: VERSAO_PROMPT,
  });
  if (ins.error) throw new Error(`falha ao salvar rascunho: ${ins.error.message}`);
  const up = await supabase.from('ato').update({ status: 'rascunho' }).eq('id', atoId).eq('status', 'coletado');
  if (up.error) throw new Error(`falha ao atualizar status: ${up.error.message}`);
}
