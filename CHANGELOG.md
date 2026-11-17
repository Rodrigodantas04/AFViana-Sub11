# Histórico de alterações

## Por publicar

- **Emblemas dos 31 clubes** (`assets/crests/`, registados em `config/crests.json`): imagens do zerozero.pt descarregadas à mão pelo responsável, com o fundo branco exterior removido (preenchimento a partir das margens, o branco dentro do emblema fica), cortadas e normalizadas para WebP 200×200 transparente (≈ 15 KB cada, 464 KB os 31). Mostradas sem escudo nem fundo, com uma sombra leve para contraste nos dois temas; as iniciais coloridas ficam como alternativa. Publicação decidida pelo responsável; retira-se um emblema de imediato a pedido do clube.
- **Calendário da época por jornada:** cada linha é uma jornada (J1, J2…) com o sábado desse fim de semana, agrupada por fase e série; fins de semana sem jogo aparecem como separador; jogos sem data entram na sua jornada com «Data a confirmar». As fases já terminadas ficam fechadas.

## 0.5.0 — 2026-11-17 · A minha equipa

- **A minha equipa** (`/minha-equipa`): escolhe-se uma vez (fica guardada só no aparelho, sem conta) e o site mostra o **próximo jogo** com contagem decrescente, os dois lados frente a frente (lugar, pontos, golos por jogo, forma, resultado anterior), o **calendário da época** dentro do site (sábado a sábado, mês a mês, com resultado, folgas e o próximo jogo destacado; os jogos são ao sábado de manhã), um **resumo** automático (distância ao 1.º, melhor ataque/defesa, séries de vitórias, pontos ainda em jogo), os **marcadores da equipa** com o peso de cada um nos golos e a posição na Bota de Ouro, a análise da época e a classificação com a equipa destacada. Atalho na página inicial e no menu; link partilhável `?equipa=`.
- **Gráficos para comparar** com qualquer equipa da série (`&vs=`): **corrida aos pontos** e **lugar jornada a jornada** (as restantes equipas em fundo; o último ponto coincide com a classificação oficial, verificado nas 33 equipas) e **ADN da equipa**, um radar com ataque, defesa, pontos, forma e jogos sem sofrer, escalado entre a pior e a melhor equipa da série, com a média da série.
- **Horário habitual** em `config/competition.json` (`schedule`: sábado de manhã, indicado pelos responsáveis a 17/11/2026). O site diz «de manhã»; hora exata e campo combinam-se com o clube. Não há exportação para calendários pessoais (decisão: nada ligado às contas das pessoas).
- **Cores dos clubes** nas iniciais (31 clubes, `config/club-colors.json`, com origem e nível de confiança; a cor do texto é escolhida pelo contraste). A cache ao vivo é reconstruída quando muda a configuração (incluindo `competition.json`) ou o deploy.
- **Gráficos com eixos e o fim de semana à vista:** eixo vertical com valores (pontos, lugares, golos) e grelha alinhada, eixo «Jornada»; passar o cursor, focar com o teclado ou tocar numa jornada mostra uma linha guia e um cartão com a data, os pontos ou o lugar de cada equipa e o jogo dessa jornada («V 3–1 vs …»). Vale para a corrida aos pontos, o lugar jornada a jornada, os pontos acumulados e as barras de golos.
- **Nada se perde no telemóvel:** comparação automática computador vs telemóvel em 15 páginas. As classificações deixaram de esconder colunas: no telemóvel há «Ver classificação detalhada» (símbolos + J, V, E, D, GM, GS, DG, Pts, sem deslizar); abre sempre na simples e a detalhada só aparece quando se pede e, em tablets, todas as colunas com lugar e equipa fixos. As páginas que saíram do menu estão no «Mais».
- **Barra de navegação no telemóvel** (abaixo de 700 px), a flutuar e com cantos arredondados (estilo dock): Início, Jogos (com o número de jogos de hoje), a equipa favorita ao centro com o seu símbolo, Marcadores e Mais (folha com as restantes páginas, pesquisa e tema). Respeita as margens seguras do iPhone.
- Painel: botões «Adicionar marcador» e «Autogolo» em cima, «Já marcaram» por baixo.
- 44 testes.

## 0.4.0 — 2026-11-16 · Jogadores

- **Perfil do jogador** com golos por fase, jogos em que marcou e peso na equipa; ligações a partir da Bota de Ouro, dos jogos e dos clubes. Não indexado, só com dados ao vivo, respeita «Ocultar nome».
- **Painel · Jogadores:** lista de grafias por equipa, sugestões de duplicados (maiúsculas/acentos), juntar ou corrigir nomes com gravação no Excel (operação `rename`, verificada).
- **Lançar marcadores mais depressa:** botões «Já marcaram» por equipa (um toque acrescenta ou soma um golo) e sugestões enquanto se escreve, sem impedir nomes novos; Enter num nome já não grava o formulário.
- Servidor tolera uma chave Google malformada (site continua com o snapshot); comando de configuração confirma as variáveis na Netlify e não usa âmbitos pagos.
- 37 testes.

## 0.3.0 — 2026-11-16 · Painel completo e nova interface

- **Painel:** separadores Dia de jogo, Por série, 2.ª fase, Privacidade e Histórico; mudar data e apagar resultado (com confirmação); escolher as equipas da 2.ª fase; ocultar/mostrar nomes; histórico com antes/depois.
- **Escritor:** operações `clear`, `date` e `teams`, com as mesmas garantias (só células de introdução, caches recalculadas incluindo as equipas dos jogos da 2.ª fase, releitura, nenhum outro jogo alterado).
- **Interface:** tipografia em `rem` com mínimo legível (respeita a escala de texto do sistema, `meta text-scale`), contraste do tema claro, gráficos em HTML/CSS que ocupam a largura sem encolher o texto, comparação com barras, iniciais dos clubes com cor própria, transições suaves entre páginas, filtros de telemóvel em duas colunas. Revisão de todos os ecrãs a 375 px e 1280 px, em claro e escuro, guiada pelo Modern Web Guidance.
- **Comparar equipas** (`/comparar`) e **emblemas** dos clubes com registo de origem e autorização.
- **Contacto do projeto** para pedidos de privacidade: minho11.contacto@gmail.com.
- 34 testes.

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
- Abrir o site ao público (proteção de acesso da Netlify) e confirmar a gravação real no Drive.
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
