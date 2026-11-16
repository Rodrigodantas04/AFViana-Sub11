# Integração Zerozero

## Estado

O responsável indicou em 16/11/2026 que o pedido de acesso developer aguarda validação. Não há chave nem contrato de endpoints de plantéis disponível no projeto. Nenhuma chamada à API está ativa.

A página informativa oficial descreve módulos de dados de jogadores, equipas, clubes e treinadores, incluindo plantéis com jogadores e equipa técnica. Os planos developer são anunciados como em preparação. A cobertura efetiva depende da informação existente e do plano contratado. A página não estabelece, por si, a licença de reutilização de retratos de crianças.

Fontes verificadas em 16/11/2026:

- [Página oficial da API](https://api.zerozero.pt/).
- [Anúncio oficial do lançamento](https://www.zerozero.pt/noticias/api-para-clubes-e-media-zerozero-apresenta-nova-funcionalidade-na-expofut/1226890).

## Preparação implementada

- Clube, equipa de competição e pessoa têm identidades distintas.
- A/B não são fundidas numa única equipa ao abrir um clube.
- Perfis contêm secções de plantel e equipa técnica por equipa/época.
- Cartões suportam nome autorizado, posição, camisola, função técnica e fotografia autorizada.
- `lib/rosters.js` valida um cache normalizado e aplica as autorizações antes da publicação.
- `src/types.d.ts` define a interface independente do fornecedor para clube e plantel.
- Nomes e imagens estão desativados por omissão; não há fotografias fictícias nem associação de crianças só pelo nome.

## O que confirmar quando o acesso for aprovado

1. Documentação real, autenticação, limites de chamadas e condições de cache.
2. Disponibilidade do Torneio Gomes Ribeiro Sub-11 e da época 2026/2027.
3. IDs de clubes e das equipas/escalões que correspondem às entradas do Excel.
4. Endpoints e resposta de plantel, incluindo técnicos e distinção entre plantel completo e incompleto.
5. Campo de imagem, acesso aos ficheiros, crédito obrigatório e direitos de mostrar/cachear/redistribuir imagens.
6. Autorizações de publicação dos nomes e retratos dos menores, e processo de correção/remoção.

Não assumir que um retrato visível no Zerozero pode ser republicado. A autorização de acesso à API e a autorização de fotografia são requisitos distintos deste projeto.

## Contrato de aquisição

O futuro adaptador corre no build ou num backend. Usa `ZEROZERO_API_KEY` apenas no ambiente protegido, aplica os limites confirmados e atualiza `data/internal/rosters-source.json`. O navegador recebe somente o snapshot público. A integração não substitui resultados/classificações do Excel.

Começar pelo esquema em `config/rosters.example.json`. Cada equipa tem `teamId` interno confirmado, `complete`, `players` e `staff`. Cada pessoa exige `externalId` real e `name`; `position`, `role` e `jerseyNumber` são opcionais. O cache inclui `sourceAuthorizationReference` e a época correta. Nascimento, morada, contactos e outros dados desnecessários não fazem parte do contrato público.

Depois do build, `data/internal/rosters-reviewed.json` contém `recordId` e `fingerprint`. A publicação é configurada em `rosterRecords` com impressão digital e referência interna de autorização. Uma fotografia só é publicada se os bytes locais corresponderem ao hash autorizado, existir referência de direitos da imagem e autorização específica do retrato.

O adaptador HTTP, a recolha de imagens e o mapeamento de IDs só serão implementados depois de disponíveis a documentação e as permissões reais. Não existe scraping, tentativa de contornar o acesso ou endpoints presumidos.
