# Verificação da versão 0.7.0

Executada localmente em 18/11/2026 (macOS, Node 24).

## 0.7.0 · App, símbolo e polimento

- `npm test`: 48 testes, 0 falhas (inclui o símbolo único, o manifesto/service worker, os `:hover` só em `@media (hover:hover)`, o aviso de dados antigos e o verde reservado).
- App: Chrome (`Page.getInstallabilityErrors`) sem erros para `/` e `/admin/`; offline, `/jogos` mostra os 150 jogos e o aviso «Sem rede…»; com o servidor a falhar (503) aparece «Não foi possível atualizar…»; online o aviso fica escondido.
- Zonas de toque (Playwright, 390 px, ecrã tátil, `elementFromPoint` a partir do centro de cada alvo) em 9 páginas e no painel: todos os alvos com ≥ 44 px, exceto um link dentro de uma frase (`.nm-before`). Nas linhas dos marcadores, a metade de cima abre o jogador (44 px) e a de baixo a equipa.
- Paridade computador/telemóvel (15 páginas): igual à 0.5.0 — só os links que no telemóvel estão no «Mais» e as colunas da classificação detalhada (a pedido).
- Sem scroll horizontal em 9 páginas a 390 e 1280 px, claro e escuro; 0 erros na consola.
- Painel (390 px, cópia `data/dev-source.xlsx`, sem gravar): login, Dia de jogo, abrir jogo, preencher resultado e marcadores, separadores Por série/Jogadores/2.ª fase/Privacidade/Histórico.

# Verificação da versão 0.5.0

Executada localmente em 17/11/2026 (macOS, Node 24).

## 0.5.0 · A minha equipa

- `npm test`: 44 testes, 0 falhas. Os novos cobrem a corrida aos pontos (a última jornada é igual à classificação oficial em todas as séries), os próximos jogos e a contagem de dias, e a página: seletor, equipa guardada, rival, linha destacada, atalho na página inicial, calendário da época com um sábado por jogo e nenhuma ligação a calendários externos.
- Dados reais: `pointsRace` coincide com a classificação nas 33 equipas (pontos e lugar), 0 divergências. Os 150 jogos com data são todos ao sábado.
- Browser (Playwright, 390 px e 1280 px, claro e escuro): sem scroll horizontal. Procurar e escolher a equipa guarda a escolha e abre a página. Trocar de rival mantém o scroll e o foco. A página inicial mostra o atalho com o próximo jogo e o calendário marca «Próximo» e «de manhã». Sem erros na consola. O menu com «A minha equipa» cabe a 900 px. Barra do telemóvel: os separadores navegam e marcam a página atual; «Mais» abre e fecha (link, botão, Esc); a equipa escolhida aparece ao centro; escondida no computador. Gráficos: eixo Y com valores, cartão da jornada ao passar o cursor (computador) e ao tocar (telemóvel), com data, pontos/lugar e o jogo; a coluna ativa fica por cima das vizinhas.
- Paridade computador/telemóvel (15 páginas, 1280 vs 390 px, script Playwright): todos os links, botões, filtros e colunas do computador existem no telemóvel. As páginas fora da barra estão no «Mais»; a classificação abre sempre simples; a detalhada (só ao tocar no botão, não fica guardada) mostra as 10 colunas em 352 px sem scroll.

## 0.4.0

Executada localmente em 16/11/2026 (macOS, Node 24).

## Automática (CI público, dados fictícios)

- `npm run check`: sem erros.
- `npm test`: 37 testes, 0 falhas (inclui juntar nomes, sugestões, perfil e a sua privacidade, as operações 2.ª fase/data/apagar, ocultar nomes, histórico, emblemas e comparação). Cobrem o motor (tokens, `(n)`, `(PB)`, `(AG)`, 10 nomes, chaves sem maiúsculas, empates, desempates, desistente, wildcards), o importador (duas fases, placeholders, A/B, desistências, rankings sem dupla contagem), as projeções (sem nomes no repositório, retirada a pedido), o escritor (partes alteradas, fórmulas intactas, releitura sem divergências, recusas), o servidor (palavra-passe, origem, sessão revogada, limite de tentativas, gravação confirmada, idempotência, conflito, bloqueio, fallback) e as vistas (fases, URL antigo, autogolos, escaping).
- `npm run build`: 204 páginas pré-renderizadas a partir do snapshot sem nomes.

## Fonte real (local, `npm run verify:source`)

- 15 folhas, 152 328 valores calculados comparados (inclui as equipas dos jogos da 2.ª fase), **0 divergências**, leitura em ~230 ms.
- Totais iguais aos valores de controlo (150 / 81 / 510; 218 registos, 494 golos individuais, 5 PB, 11 por identificar).
- Ensaio de gravação em memória: ~0,9 s, 4 partes alteradas (workbook, série, marcadores da fase, totais), fórmulas e estilos intactos.

## Percurso completo (local, cópia `data/dev-source.xlsx`)

Feito no browser, num viewport de 375×812:

1. `/admin` mostra só a palavra-passe. Pedidos sem `Origin` válido e palavra-passe errada são recusados.
2. Série A J6 (por preencher) → 3–2, um marcador e um autogolo → «Resultado gravado». O ficheiro relido tem `Atleta Teste, Autogolo (PB)`, a classificação passa a 12 pontos para a AD Ponte Barca e `/data/competition.json` foi atualizado. Ficou uma cópia de segurança.
3. Alteração externa do ficheiro com o jogo aberto → 409. O formulário manteve 4–2 e os nomes, apareceu o aviso «resultado gravado aqui já não está no Excel» e, depois de «Atualizar jogo», a gravação passou e o aviso desapareceu.
4. Páginas públicas sem scroll horizontal a 375 px. A análise da ADC Anha bate certo (29/30 golos identificados).

## Não verificado

- Gravação real no Google Drive: falta a conta de serviço. O cliente Drive (`server/sources.js`) segue a API documentada, mas não foi exercitado contra o Drive.
- Publicação na Netlify: falta a conta.

## Interface (0.3.0)

Capturas com Chromium (Playwright) de todas as páginas públicas e do painel a 375 px e 1280 px, em claro e escuro: sem transbordo horizontal em nenhuma página. No painel (375×812): login, Dia de jogo, 2.ª fase (equipas gravadas, 12 jogos criados), ocultar nome (desaparece de `/data/competition.json`), mudar data, gravar e apagar resultado, histórico.
