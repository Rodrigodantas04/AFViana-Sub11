# Verificação da versão 0.5.0

Executada localmente em 17/11/2026 (macOS, Node 24).

## 0.5.0 · A minha equipa

- `npm test`: 43 testes, 0 falhas. Os novos cobrem a corrida aos pontos (a última jornada é igual à classificação oficial em todas as séries), os próximos jogos e a contagem de dias, a página (seletor, equipa guardada, rival, linha destacada, atalho na página inicial), o iCalendar (linhas ≤ 75 octetos, um evento por jogo com data, sem nomes de jogadores) e a rota `/calendario/<equipa>.ics` (`text/calendar`, 404 para equipa desconhecida).
- Dados reais: `pointsRace` coincide com a classificação nas 33 equipas (pontos e lugar), 0 divergências.
- Browser (Playwright, 390 px e 1280 px, claro e escuro): sem scroll horizontal; procurar e escolher equipa guarda a escolha e abre a página; trocar de rival mantém o scroll e o foco; atalho na página inicial com o próximo jogo; ligações de calendário (`webcal://`, Google, `.ics`) e o ficheiro servido como `text/calendar`; sem erros na consola. Menu com «A minha equipa» cabe a 900 px.

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
