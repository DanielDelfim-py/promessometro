# Promessômetro

Plataforma apartidária de acompanhamento do governo federal: o que foi prometido, o que foi feito e o que circula sobre isso, sempre com o documento original ao lado.

## Status

Fase 1 em construção: linha do tempo de atos oficiais do Diário Oficial da União (coleta diária, resumo por IA e aprovação por editor humano antes de publicar).

## Princípios

- Fonte primária sempre: cada ato aponta para o texto original no DOU.
- Nada é publicado sem aprovação de um editor identificado.
- Mesma régua para qualquer governo.

## Segredos

Chaves e senhas nunca entram no repositório. Ficam em variáveis de ambiente e em *secrets* do GitHub.

## Operação

O workflow `Coletar DOU` (`.github/workflows/coletar.yml`) roda todo dia às 19:00 (Brasília). Ele executa a coleta dos atos do DOU (`npm run coletar`, por padrão 3 dias retroativos) e depois gera os rascunhos de resumo por IA (`npm run rascunhos`).

Carga inicial: em **Actions → Coletar DOU → Run workflow**, preencher `dias` com `30` e rodar.

Secrets necessários (em **Settings → Secrets and variables → Actions**; nunca no repositório):

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SECRET_KEY`: chave secreta do Supabase (somente servidor).
- `ANTHROPIC_API_KEY`: chave da API da Anthropic.

Pontos de atenção:

- **Desativação por inatividade:** o GitHub desativa workflows agendados de repositórios públicos após 60 dias sem atividade no repositório. Se a coleta parar, abrir a aba Actions e reativar o workflow, ou fazer qualquer commit.
- **Rascunhos mesmo com falha na coleta:** a etapa de rascunhos roda mesmo quando a coleta falha, para não travar os atos já coletados. A execução continua marcada como falha.
- **"ZIP desatualizado":** nos primeiros dias do mês, a execução pode falhar com essa mensagem até a Imprensa Nacional publicar o ZIP do mês novo. A execução diária seguinte se recupera sozinha.
- **Supabase free:** o projeto é pausado após cerca de 7 dias sem atividade. A execução diária mantém o projeto ativo.

## Como rodar localmente

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher. O arquivo `.env.local` nunca deve ser commitado.
3. `npm run dev` para subir o site.
4. `npm test` para rodar os testes.
