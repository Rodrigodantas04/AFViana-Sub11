# Verificação da versão 0.1.0

Verificações executadas localmente em 16/11/2026.

## Comandos

`npm run check`, `npm run build` e `npm test` concluíram com sucesso. Foram executados 29 testes Python e 12 testes Node, sem falhas. O build gerou 194 páginas pré-renderizadas a partir da competição fornecida.

Os testes cobrem leitura das folhas, cabeçalhos desconhecidos, dados em falta, resultados incompletos, valores de golos inválidos, duplicados, desistências, correções com identidade estável, autogolos, erros Excel e preservação do último snapshot válido. Também verificam autorização/revogação de nomes e imagens, contratos de plantel, pesquisas, rankings empatados, renderização, ligações e ausência de informação individual não autorizada nos HTML/JSON publicados.

## Navegador

- Servidor local respondeu HTTP 200.
- Pesquisa de LANHESES com série B e estado finalizado apresentou quatro jogos no snapshot fornecido.
- Abertura de um jogo, retroceder e atualização da página mantiveram o URL e os filtros.
- Alternância de tema e atualização da página preservaram a preferência.
- Menu móvel, pesquisa em diálogo e fecho por Escape funcionaram.
- Perfil de UD Lanheses apresentou classificação, estatísticas e secções de plantel/equipa técnica, com estados sem dados.
- Página inicial sem transbordo horizontal a 320, 375, 390, 430, 768, 1024 e 1440 px.
- Jogos, série F, clubes, perfil de clube, marcadores e estatísticas sem transbordo horizontal a 320 e 1440 px.
- Revisão visual e capturas nos temas claro e escuro, incluindo o perfil móvel.
- Sem avisos ou erros na consola durante os percursos verificados.

## Limites

Não foram executados Lighthouse, auditoria WCAG independente, testes em dispositivos físicos ou validação de produção Netlify. Os estados de erro de dados são cobertos por testes de contrato e preservação do snapshot; não foi simulada uma falha de rede no navegador. A integração Zerozero e o carregamento de fotografias reais não podem ser verificados enquanto não houver acesso aprovado, dados autorizados e direitos de utilização.
