import { CabecalhoPublico } from '@/components/CabecalhoPublico';
import { ATUALIZADO_EM, EMAIL_CONTATO, NOME_EDITOR, NOME_PLATAFORMA } from '@/lib/site';

export const metadata = {
  title: 'Como trabalhamos',
  description: 'As regras, o processo editorial e as informações de transparência do projeto.',
};

export default function ComoTrabalhamos() {
  return (
    <div className="pagina">
      <CabecalhoPublico ativo="como-trabalhamos" />
      <main className="conteudo-texto">
        <h1>Como trabalhamos</h1>
        <p>
          O {NOME_PLATAFORMA} é uma plataforma independente e apartidária que mostra o que o governo federal publica no Diário Oficial da União, em linguagem simples e sempre com o link para o documento original. Esta página explica as nossas regras. Elas valem para qualquer governo, partido ou autor.
        </p>

        <h2>O que fazemos hoje</h2>
        <p>Nesta primeira fase, acompanhamos os atos oficiais publicados na Seção 1 do Diário Oficial da União: decretos, medidas provisórias, leis, vetos, decretos legislativos, emendas constitucionais e portarias.</p>
        <p>As portarias são milhares por mês. Por isso, só aparecem aqui as que o editor escolhe resumir, e o site as deixa escondidas por padrão: você pode incluí-las no filtro.</p>
        <p>Ainda não temos o acompanhamento de promessas, a verificação de boatos nem o painel de dados. Eles virão em fases seguintes.</p>

        <h2>Nossas regras</h2>
        <ol>
          <li><strong>Fonte primária sempre.</strong> Todo item tem o link &quot;Texto original no DOU&quot;. Notícia de imprensa é contexto, não prova.</li>
          <li><strong>Mesma régua para todos.</strong> Os critérios valem para qualquer governo, partido ou autor. Evitamos adjetivos: o resumo diz o que mudou, para quem e a partir de quando, quando o texto informa.</li>
          <li><strong>Revisão humana assinada.</strong> Nenhum item é publicado sem a aprovação de um editor identificado. Cada decisão fica registrada, com quem decidiu e quando.</li>
          <li><strong>Correções visíveis.</strong> Quando um erro é corrigido, o item mostra uma nota com a data da correção. Se um item não puder ser mantido, ele sai do ar e o motivo fica registrado internamente.</li>
          <li><strong>Transparência.</strong> Esta página diz quem edita, quem paga e quais vínculos existem.</li>
        </ol>

        <h2>Como um ato chega ao site</h2>
        <ol>
          <li>Coletamos os atos publicados no Diário Oficial da União a partir dos dados abertos da Imprensa Nacional.</li>
          <li>Um modelo de inteligência artificial (Claude, da Anthropic) lê o texto dos atos de maior alcance e prepara um rascunho: título, resumo e tema.</li>
          <li>O editor lê o rascunho ao lado do texto original, corrige o que for preciso e decide: publicar, ajustar ou descartar.</li>
          <li>Só o que o editor aprova aparece no site. A inteligência artificial nunca publica sozinha.</li>
        </ol>
        <p className="aviso-pagina">
          <strong>A IA pode errar.</strong> O resumo é um guia e não substitui o documento oficial: confira sempre o texto original no DOU. Em atos muito longos, o resumo pode cobrir apenas as partes principais.
        </p>

        <h2>Como pedir uma correção</h2>
        <p>
          Encontrou um erro, ou discorda de como um ato foi resumido? Escreva para <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>, indicando o título e a data do item e o que está incorreto. Quando o erro for confirmado, corrigimos o item com uma nota datada.
        </p>

        <h2>Quem edita</h2>
        <p>Editor responsável: {NOME_EDITOR}.</p>

        <h2>Financiamento</h2>
        <p>O projeto é filantrópico. Não tem receita, anúncios nem patrocinadores. Os custos de funcionamento, principalmente o uso de inteligência artificial, são pagos pelo editor. Se isso mudar, informaremos aqui.</p>

        <h2>Conflitos de interesse</h2>
        <p>O editor não tem filiação partidária nem vínculo com governos ou campanhas eleitorais. Se isso mudar, informaremos aqui.</p>

        <h2>Avisos</h2>
        <p>Este site não é um canal oficial do governo. Os atos publicados no Diário Oficial são documentos públicos da Imprensa Nacional; os resumos e os títulos escritos aqui são do {NOME_PLATAFORMA}. Página atualizada em {ATUALIZADO_EM}.</p>
      </main>
    </div>
  );
}
