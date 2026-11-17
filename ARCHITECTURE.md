# Arquitetura

## 1. Princípios

1. **O Excel no Google Drive é a fonte de verdade.** Pessoas e plataforma editam o mesmo ficheiro. Tudo o resto (JSON público, cache, páginas) é uma projeção descartável.
2. **Não inventar dados.** Placeholders (`0`, células vazias) não criam equipas, jogos ou atletas. Golos sem nome ficam «por identificar». Resultados com data futura são preservados e sinalizados.
3. **Os miúdos primeiro.** Os nomes só aparecem onde é preciso e nunca entram no Git nem no HTML estático. Existe retirada a pedido.
4. **Falhar fechado.** Se a estrutura ou as fórmulas do Excel mudarem, a importação para e a última versão válida continua publicada.

## 2. A fonte (16/11/2026)

`AFVC_Torneio_Benjamins_Gomes_Ribeiro_Sub11_Completo.xlsx`, ID `10NzITORyeANQY2prYW9YHF4zJmxDAAqd`, XLSX binário (não é uma Google Sheet). Tem 15 folhas visíveis, sem nomes definidos, tabelas, desenhos nem folhas ocultas:

| Folhas | Conteúdo |
| --- | --- |
| `1ª Fase - Série 1`, `1.ª Fase - Série 2…6` | Séries A–F (o título diz «SÉRIE 1 (SÉRIE A)»). Classificação em A5:J11, auxiliares M:W, programa de jogos a partir da linha 13 |
| `Marcadores 1ª Fase` | Tabela automática (A4:D604) e auxiliares G:R, com 3000 linhas de tokens (300 células × 10) |
| `2ª Fase - Série A…F` | Equipas por preencher em M6:M11. As equipas dos jogos são fórmulas `IF(M6="","",M6)` |
| `Marcadores 2ª Fase`, `Marcadores Totais` | Mesma lógica: só a 2.ª fase, ou as duas fases (6600 linhas) |

Programa de jogos: `A` jornada, `B` data (texto dd/mm/aaaa), `C` casa, `D` golos da casa, `F` golos de fora, `G` fora. Na linha seguinte, `C`/`G` têm os marcadores de cada equipa (`Nome (2), Outro, Adversário (PB)`).

### Lógica das fórmulas (reproduzida em `lib/excel-engine.js`)

- **Classificação:** J/V/E/D/GM/GS por `COUNTIFS`/`SUMPRODUCT`/`SUMIFS` sobre as linhas 14..fim. A chave é `Pts·10⁶ + DF·10³ + GM − k·0,01`, e `RANK` ordena por pontos, diferença, golos marcados e, por fim, a ordem em M6:M11. Uma equipa com «Desistiu» no nome vai para o fim. `INDEX` de uma célula vazia devolve `0`, por isso as séries de 5 equipas mostram uma linha `0`, que não é uma equipa.
- **Marcadores:** `TRIM(MID(SUBSTITUTE(célula,","," "×200),(k−1)·200+1,200))` lê até 10 nomes por célula. `(n)` dá n golos, `(PB)` dá 0 golos ao nome (o golo conta no resultado, mas não é creditado) e qualquer outro parêntese dá 1 golo, por isso `(AG)` contaria como golo do jogador. A chave nome|equipa é comparada **sem distinguir maiúsculas** (`COUNTIF`/`SUMIFS`). Os empates no ranking ficam pela ordem de primeira aparição.

Os desempates acima são os da folha. Não foram confirmados contra o regulamento oficial da AF Viana do Castelo.

## 3. Modelo de dados (schema 2)

```
competition ── phases[fase-1, fase-2] ── groups[1a…1f, 2a…2f] ── standings
teams (uma identidade por equipa, entre fases) ── clubs (AD Barroselas A/B → um clube, duas equipas)
matches { id, phaseId, groupId, round, date, homeId, awayId, homeGoals, awayGoals, status, scoring{home,away} }
scorers { fase-1:[…], fase-2:[…], total:[…] }   ← cada registo é «nome numa equipa», não uma pessoa
```

- **IDs de jogo.** Na 1.ª fase mantêm-se os IDs publicados antes (`m-` + SHA-256 do JSON Python `[competição, letra, jornada, equipaCasa, equipaFora]` com IDs antigos), e os 150 coincidem. Na 2.ª fase o hash inclui `fase-2`, para não colidir com jogos da mesma série e jornada. Os URLs antigos `/competicoes/<slug>/serie-a` redirecionam (301) para `/fase-1/serie-a`.
- **Equipas.** O ID é o slug do nome sem «(Desistiu)». A mesma equipa mantém a identidade na 2.ª fase, e a mudança de série não perde o histórico.
- **Estados.** `finished` (os dois golos preenchidos; um 0–0 é um resultado), `incomplete` (só um lado), `scheduled`, `withdrawn` (equipa desistente, sem resultado). O estado `unconfirmed` é derivado na vista quando a data já passou e ainda não há resultado; nunca se escreve «adiado».
- **Rastreabilidade.** O modelo interno guarda folha e linha de cada jogo e o hash da fonte. A projeção pública remove-os.

## 4. Projeções e privacidade

| Projeção | Onde | Nomes |
| --- | --- | --- |
| `repository` | `data/public/competition.json` (Git), páginas HTML estáticas | Nunca. Só contagens |
| `public` | `/data/competition.json` ao vivo (função) e preview local | Conforme `config/publication.json` (`scorerNames: public`, `excludedScorerIds`) |
| interna | `data/internal/` (local) e resposta do `/admin` com sessão | Sim, com referências à fonte |

A política publica apenas nome (como escrito na ficha), equipa e golos. Não há perfis pessoais nem fusão de homónimos: 15 nomes aparecem em mais de uma equipa e ficam separados, e grafias que só diferem em maiúsculas ficam juntas como faz o Excel, com aviso interno. Uma retirada usa o ID `s-…` do registo e aplica-se aos rankings e aos jogos, sem mexer no resultado.

## 5. Escrita no Excel

`lib/writer.js` aplica quatro operações, todas sobre **células de introdução**: `result` (D/F e marcadores C/G da linha seguinte), `clear` (as mesmas, vazias), `date` (B, texto dd/mm/aaaa) e `teams` (M6:M11 de uma série da 2.ª fase; recusada se a série já tem resultados, se a equipa está noutra série da fase ou desistiu — a ordem define o calendário gerado pelas fórmulas). Para todas:

1. Valida o pedido: inteiros 0–99, nomes só com letras, espaço, apóstrofo, hífen ou ponto (sem `=+@`, vírgulas, parênteses ou dígitos), soma dos marcadores ≤ resultado, ≤10 tokens, e o Excel tem de conseguir ler a descrição sem a partir.
2. Escreve quatro **células de introdução**: `D`/`F` da linha do jogo e `C`/`G` da linha de marcadores (como inline string). Recusa escrever por cima de uma fórmula.
3. Volta a avaliar o livro e atualiza **apenas o valor em cache** das fórmulas cujo resultado mudou (série afetada, marcadores da fase e totais). A fórmula, o estilo, as fórmulas partilhadas, a formatação condicional, a calcChain e as outras partes do pacote mantêm-se byte a byte.
4. Define `fullCalcOnLoad="1"`, para que o Excel recalcule ao abrir.
5. Relê o próprio resultado e exige: zero divergências entre as caches e as fórmulas, o jogo com os valores pedidos e nenhum outro jogo alterado.

Recalcular no servidor evita que o Drive, o Excel e o site mostrem números diferentes até alguém abrir o ficheiro. Não se usa a Sheets API, porque o ficheiro não é uma Google Sheet, nem se converte o ficheiro, para não mudar o ID, as permissões e o histórico.

## 6. Servidor

`server/app.js` é independente do alojamento (Request → Response). Rotas: `/data/competition.json` e `/api/admin/*`. Os adaptadores são `netlify/functions/minho11.mjs` (produção) e `scripts/serve.mjs` (local, com uma cópia do Excel).

**Leitura pública.** A cache em Netlify Blobs é refrescada no máximo a cada 60 s. Primeiro faz um pedido barato de metadados ao Drive e só descarrega o ficheiro se a versão mudou. Se o Drive falhar, serve a última projeção válida (`X-MINHO11-Source: stale`) ou o snapshot do repositório. Nunca serve dados por validar.

**Gravação (`PUT /api/admin/matches/:id`):**

1. Exige sessão válida, `Origin` igual ao site e `Content-Type: application/json`.
2. A idempotência usa `operationId`: um reenvio igual devolve «já gravado», e um ID repetido com outros dados é recusado.
3. Um bloqueio com expiração (CAS em Blobs, `onlyIfNew`/`onlyIfMatch`) serializa as gravações da aplicação.
4. O servidor lê a fonte. Se o hash não coincidir com a revisão que o painel tinha, responde 409 e o painel mantém o formulário.
5. Guarda uma cópia de segurança privada (`backups/…xlsx`) antes de substituir o ficheiro. O Drive mantém também o seu histórico de versões.
6. Volta a confirmar a versão no Drive, faz `PATCH` ao mesmo ficheiro (`uploadType=media`), relê-o e compara o SHA-256 (e o md5 do Drive).
7. Reimporta, atualiza a projeção pública e responde. Só então o painel diz «Resultado gravado».

**Limite real de concorrência.** O Drive não suporta compare-and-swap em uploads binários. Entre a última verificação de versão e o `PATCH` há uma janela pequena em que uma gravação externa (por exemplo, o Excel no computador com sincronização do Drive) pode ganhar. O servidor guarda o último valor que gravou em cada jogo e, sempre que o painel abre, avisa se o Excel já não o tem. A perda é detetada e mostrada, mas não é impedida. Recomendação operacional: depois de começar a usar o painel, não ter o Excel aberto a editar ao mesmo tempo.

## 6.1 Jogadores: identidade e perfis

Um jogador é **«nome numa equipa», tal como escrito nas fichas** (a mesma chave das fórmulas). Não há identidades inferidas: homónimos em equipas diferentes ficam separados. Grafias diferentes do mesmo miúdo resolvem-se **no Excel** com a operação `rename` (separador Jogadores): o nome é corrigido em todas as descrições dessa equipa, golos do mesmo nome somam-se, e a verificação garante que os golos da equipa e todos os resultados ficam iguais. O painel sugere grafias que só diferem em maiúsculas, acentos ou espaços; juntar nomes diferentes («Rafa» e «Rafael Costa») é sempre decisão humana. Quando houver acesso Zerozero, cada nome poderá ser ligado ao identificador do fornecedor (decisão humana nos casos ambíguos).

O perfil público (`/jogadores/<id>`) é renderizado só com a projeção ao vivo: o HTML estático é uma página genérica com `noindex` (cabeçalho e meta), `robots.txt` exclui `/jogadores/`, e um nome oculto devolve «Perfil indisponível».

## 6.2 A minha equipa

A equipa escolhida vive só em `localStorage` (`minho11-team`) e chega às vistas por `prefs` (`src/views.js`); o HTML estático não a conhece e mostra o seletor. Não há conta nem cookie. Os gráficos de comparação usam `pointsRace` (`src/domain.js`), que reconstrói a tabela jornada a jornada com os mesmos desempates da folha (pontos, diferença, golos marcados, ordem da folha, desistentes no fim); um teste garante que a última jornada coincide com a classificação oficial. O radar escala cada eixo entre a pior e a melhor equipa da série.

O calendário da época é uma vista do site (todos os sábados entre o primeiro e o último jogo da equipa, agrupados por mês). O Excel só tem a data; o horário habitual vem de `config/competition.json` (`schedule`, sábado de manhã) e aparece como texto, nunca como hora exata. Por decisão dos responsáveis não há exportação `.ics` nem ligação a calendários pessoais.

## 6.3 Ocultar nomes e histórico

O pedido de retirada de um nome é aplicado no painel (**Privacidade**). A lista de registos ocultos vive no armazenamento do servidor (`privacy/hidden`, escrita com CAS) e é somada a `excludedScorerIds` da configuração na projeção pública: o nome desaparece dos rankings e dos jogos; o Excel e os golos não mudam. Todas as operações (incluindo ocultar/mostrar) ficam no histórico do painel com o antes e o depois.

## 7. Autenticação

- Uma palavra-passe partilhada, guardada só como `pbkdf2-sha256$600000$sal$hash` na variável `ADMIN_PASSWORD_HASH`. A comparação é feita em tempo constante.
- Limite de 5 tentativas falhadas por cliente em cada 15 minutos (chave com hash do IP).
- Sessão de 8 h: token assinado com HMAC (`ADMIN_SESSION_SECRET`, ≥32 caracteres) num cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/admin`, e registo no servidor para que **«Sair» revogue a sessão de facto**.
- Todas as leituras privadas e escritas são autorizadas no servidor. Saber o URL `/admin` não dá acesso. A página do painel é estática e não contém dados.

## 8. Alojamento: porquê Netlify

| Opção | Avaliação |
| --- | --- |
| Netlify (escolhida) | Plano gratuito, subdomínio estável, funções Node sem limite de 10 ms de CPU (ler e gravar o XLSX demora ~0,3–0,9 s), Blobs com escrita condicional, configuração já existente no repositório |
| Cloudflare Workers | O plano gratuito limita o CPU a 10 ms por pedido, insuficiente para descomprimir 16 MB de XML. Exigiria plano pago |
| Site anterior (ChatGPT Sites, `minho11-futebol-formacao…`) | Sem ferramentas para o gerir a partir deste ambiente e com o endpoint antigo `/internal/sync`. Não foi reutilizado nem publicado. Fica por desativar pelo responsável |
| Apps Script / Sheets | Obrigaria a converter o XLSX ou a duplicar a fonte |

O limite de 4 KB das variáveis de ambiente das funções comporta a chave da conta de serviço (~2,4 KB) e os dois segredos.

## 9. Estrutura

```
lib/        xlsx.js · excel-engine.js · competition.js · writer.js · projection.js · rosters.js
server/     app.js · auth.js · sources.js (Drive / ficheiro) · storage.js (Blobs / memória / ficheiro) · runtime.js
netlify/functions/minho11.mjs
src/        domain.js · views.js · components.js · app.js · styles.css · admin.{html,css,js}
scripts/    import.mjs · prepare-data.mjs · build.mjs · serve.mjs · verify-source.mjs · admin-password.mjs
tests/      *.test.mjs + fixtures/workbook.mjs (XLSX sintético com as mesmas fórmulas)
```

O importador Python da versão 0.1 foi substituído por JavaScript para existir **uma só implementação** da fonte, usada pelo build e pelo servidor. Com duas implementações, os números do site e os da gravação poderiam divergir.

## 10. Plantéis e Zerozero

`lib/rosters.js` mantém a fronteira da versão anterior: a cache normalizada `data/internal/rosters-source.json`, a autorização por registo com fingerprint e as fotografias com direitos próprios e hash. Nenhum endpoint Zerozero é suposto ou chamado. Ver docs/ZEROZERO.md. Quando houver dados, os resultados continuam a vir só do Excel.
