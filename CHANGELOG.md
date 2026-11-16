# Histórico de alterações

## Preparação do repositório público — 2026-11-16

- README reestruturado para apresentar o produto, a arquitetura, a execução e os limites atuais.
- Excel original excluído do Git e do histórico enviado ao GitHub.
- Fixture de testes com nomes substituídos e geração temporária de XLSX para verificar o adaptador num checkout público.
- Build público a partir do snapshot validado, com importação automática quando existe fonte privada local.

## 0.1.0 — 2026-11-16

### Interface e experiência

- Redesenho do início com a identidade navy/lima da base original.
- Temas claro e escuro, preferência persistente e adaptação móvel.
- URLs próprias para competição, séries, jogos e clubes.
- Pesquisa sem distinguir maiúsculas ou acentos e filtros no URL.
- Páginas de estatísticas e de clubes com equipas A/B separadas.
- Estrutura para plantel completo, técnicos, posições, camisolas e fotografias autorizadas.
- Bota de Ouro com posições empatadas e apresentação condicionada às autorizações.

### Dados e engenharia

- Importador independente das oito folhas do XLSX, sem dependências externas.
- Classificações preservadas e comparação independente com os resultados.
- Identificadores de jogo que resistem a correções do resultado e da data.
- Diagnósticos de golos sem identificação, autogolos, nomes ambíguos e erros de fórmulas.
- Separação entre fonte privada, auditoria interna e snapshot público.
- Atualização periódica por versão sem reiniciar os filtros.
- Pré-renderização estática, validação de dados, testes Python/Node e configuração CI/Netlify.
- README, arquitetura, auditoria e plano de integração Zerozero.

### Pendente

- Aprovação developer, documentação completa, cobertura da competição e direitos de imagens Zerozero.
- Integração efetiva da API e correspondência confirmada de clubes/equipas.
- Nomes e fotografias de menores até confirmação das autorizações.
- Emblemas oficiais, cartões exportáveis de jogador e painel de administração.
- Publicação de produção e medições Lighthouse/Core Web Vitals.

## Base recebida — 2026-11-15

ZIP `MINHO11-modern-UI-netlify.zip`: aplicação HTML/CSS/JavaScript com temas, resultados, classificação, marcadores, filtros, diálogos nativos, importador Excel e configuração Netlify. Esta data corresponde à versão documentada no ZIP, não a um commit recuperado do fixo.
