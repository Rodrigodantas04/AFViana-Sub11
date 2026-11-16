# Histórico de alterações

## Em preparação (fim de semana)

- Contacto do projeto para pedidos de privacidade: minho11.contacto@gmail.com (página /privacidade e README).

## 0.2.0 — 2026-11-16 · Nova fonte, duas fases e gestão de resultados

### Entregue
- **Nova fonte oficial** (Drive, `10NzITORyeANQY2prYW9YHF4zJmxDAAqd`): leitura das 15 folhas, das duas fases e das três tabelas automáticas de marcadores. O link antigo da Google Sheet deixou de ser usado.
- **Motor equivalente às fórmulas** (`lib/excel-engine.js`): classificações e marcadores calculados com a mesma lógica do Excel. Na fonte real, os 151 968 valores em cache coincidem (0 divergências).
- **Importador em JavaScript** (`lib/competition.js`), que substitui o importador Python. Uma só implementação para o build e o servidor.
- **Modelo com fases** (schema 2): séries `1a…2f`, equipas com identidade estável entre fases, IDs de jogo da 1.ª fase preservados (150/150) e redirecionamento dos URLs antigos das séries.
- **Marcadores:** detalhe por jogo, autogolos sem crédito individual, golos por identificar e rankings da 1.ª fase, da 2.ª fase e acumulado, com posições partilhadas, filtros e pesquisa.
- **Qualidade dos dados:** avisos para resultado com data futura (Série D J7, 21/11), lista de marcadores possivelmente copiada (Série A, J5 Guilhadeses = J6 Atlético Arcos), grafias diferentes, homónimos entre equipas e golos sem marcador (11).
- **Gestão `/admin`:** palavra-passe partilhada (PBKDF2), sessão HttpOnly revogável, limite de tentativas, proteção de origem, idempotência, bloqueio de gravação, cópia de segurança, conflito sem perda do que foi escrito, aviso de gravações sobrepostas e «Gravar resultado» com confirmação real.
- **Escritor de XLSX** (`lib/writer.js`): altera só as células de introdução e atualiza as caches das fórmulas afetadas. Fórmulas e estilos ficam intactos, com `fullCalcOnLoad` e verificação por releitura.
- **Servidor** independente do alojamento, com adaptador Netlify Functions + Blobs e servidor local sobre uma cópia do Excel.
- **Análise da equipa:** forma, aproveitamento, casa/fora, gráficos de golos por jogo e de pontos acumulados, comparação com a média da série e contributo dos marcadores.
- **Privacidade:** nomes fora do Git e do HTML estático, com retirada a pedido (`excludedScorerIds`) e página `/privacidade`.
- **Testes** com um XLSX sintético que tem as mesmas fórmulas e nomes fictícios: 29 testes (motor, importador, escritor, servidor, vistas e garantia de que o snapshot versionado não tem nomes).

### Pendente
- Criar o site na Netlify e configurar `GOOGLE_SERVICE_ACCOUNT_JSON`, `ADMIN_PASSWORD_HASH` e `ADMIN_SESSION_SECRET`, depois de partilhar o Excel com a conta de serviço.
- Confirmar com a organização os desempates oficiais (a folha usa pontos, DF, GM e a ordem de inscrição).
- Rever na fonte: data da Série D J7, marcadores da Série A J6 e os 11 golos por identificar.
- Desativar o Site antigo (ChatGPT Sites), que não foi atualizado.
- Plantéis e fotografias: aguardam o acesso Zerozero.

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
