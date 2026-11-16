# MINHO11

### O futebol começa aqui.

MINHO11 é uma plataforma independente para acompanhar o futebol de formação do Alto Minho: resultados, classificações, calendário, marcadores e a análise de cada equipa. Começa pelo **Torneio Distrital Benjamins Gomes Ribeiro — Sub-11 (2026/2027)**, com duas fases e seis séries em cada uma.

![Identidade visual do MINHO11](assets/social.png)

**Estado (16/11/2026):** a leitura da nova fonte, o painel de gestão e a gravação no Excel estão implementados e testados localmente sobre cópias do ficheiro. A publicação em produção aguarda dois passos do responsável: a conta de alojamento e a autorização de servidor no Google Drive ([ver «Produção»](#produção)). A integração Zerozero aguarda acesso developer.

## O produto

- **Duas fases.** Séries A–F da 1.ª fase em curso. A 2.ª fase aparece como «por definir» até as equipas serem indicadas no Excel. Placeholders `0` nunca viram clubes nem jogos.
- **Classificações** calculadas com as mesmas regras das fórmulas do Excel: pontos, diferença de golos, golos marcados e, por fim, a ordem de inscrição na folha.
- **Centro de jogo** com os marcadores de cada lado, autogolos (a favor da equipa, sem crédito individual) e golos ainda por identificar.
- **Bota de Ouro** da 1.ª fase, da 2.ª fase e acumulada, sem contar golos duas vezes, com posições partilhadas em caso de empate, filtros por fase e série e pesquisa sem acentos.
- **Clubes e equipas.** As equipas A e B do mesmo clube ficam sob um perfil comum, mas com séries, resultados e estatísticas próprios.
- **Análise da equipa:** forma recente, aproveitamento, casa/fora com os denominadores corretos, golos por jogo, gráfico de golos marcados e sofridos por jornada, pontos acumulados, comparação com a média da série e contributo dos marcadores. Só conta jogos concluídos.
- **Gestão de resultados (`/admin`)** para quem atualiza a competição, no telemóvel, com uma palavra-passe partilhada. A pessoa escolhe o jogo, escreve o resultado e os marcadores e carrega em **«Gravar resultado»**. A plataforma grava no Excel oficial, relê-o para confirmar e só então atualiza o site.
- Temas claro e escuro, navegação móvel, URLs próprias para cada página e estados vazios honestos.

## Como funciona

```text
Excel oficial (Google Drive, XLSX)  ← fonte de verdade
        │  ler (Drive API, conta de serviço)         ▲ gravar o mesmo ficheiro
        ▼                                            │ (só células de introdução)
lib/competition.js ── motor equivalente às fórmulas ──┤
        │                                            │
        ├─► projeção pública (nomes conforme a política) ──► /data/competition.json ──► site
        └─► painel /admin ── palavra-passe, sessão, validação, bloqueio, cópia de segurança
```

- O Excel continua a ser editável por pessoas: o MINHO11 não o substitui por uma base de dados.
- **As fórmulas não são substituídas por valores.** O motor (`lib/excel-engine.js`) reproduz as fórmulas das classificações e das tabelas automáticas de marcadores. Na fonte real, os 151 968 valores calculados guardados pelo Excel coincidem com os recalculados (`npm run verify:source`).
- Ao gravar um resultado mudam quatro células de introdução. Os valores em cache das fórmulas afetadas são atualizados e o ficheiro fica marcado para recálculo completo quando for aberto no Excel.
- Os nomes das crianças **não entram no Git nem nas páginas HTML pré-renderizadas**. Chegam apenas na projeção ao vivo, que respeita `config/publication.json`, incluindo pedidos de retirada.

Os pormenores, as alternativas consideradas e os limites estão em [ARCHITECTURE.md](ARCHITECTURE.md). A análise da fonte está em [docs/DATA-SOURCE.md](docs/DATA-SOURCE.md).

## Stack

| Camada | Implementação |
| --- | --- |
| Interface | HTML semântico, CSS com camadas e tokens claro/escuro, módulos ES sem framework |
| Domínio | `src/domain.js`, partilhado pelo build, pelo navegador e pelo servidor |
| Fonte | `lib/xlsx.js` (OpenXML com `fflate`), `lib/excel-engine.js`, `lib/competition.js`, `lib/writer.js` |
| Servidor | `server/` (Web Request/Response, Node), adaptador Netlify Functions + Netlify Blobs |
| Testes | `node:test` com um XLSX sintético que tem as mesmas fórmulas e nomes fictícios; GitHub Actions |

Dependências de execução: `fflate` (zip) e `@netlify/blobs` (armazenamento do servidor).

## Começar

Requisitos: **Node.js 22.12+** (o CI usa Node 24).

```bash
git clone https://github.com/Rodrigodantas04/AFViana-Sub11.git
cd AFViana-Sub11
npm ci
npm run dev        # build + http://127.0.0.1:4173
```

Um checkout público funciona com o snapshot versionado, que não tem nomes. Não é preciso o Excel.

```bash
npm run check          # sintaxe dos módulos do navegador
npm test               # motor, importador, escritor, servidor e vistas (dados fictícios)
npm run build          # dist/ (importa data/source.xlsx se existir)
npm run verify:source  # só local: verifica o Excel real em data/source.xlsx
```

### Testar a gestão localmente (sem tocar no Excel real)

```bash
cp data/source.xlsx data/dev-source.xlsx
npm run admin:password -- --env
echo "MINHO11_DEV_SOURCE=data/dev-source.xlsx" >> .env
npm run dev
```

O comando `admin:password` pede a palavra-passe sem a mostrar e grava o hash no `.env` (ignorado pelo Git). Depois de `npm run dev`, abre http://127.0.0.1:4173/admin. O servidor local recusa usar `data/source.xlsx` diretamente.

## Produção

Escolha: **Netlify** (plano gratuito, subdomínio `*.netlify.app`). As páginas são estáticas e uma função Node serve `/data/competition.json` e `/api/admin/*`. Ver os motivos em ARCHITECTURE.md.

Passos que dependem do responsável:

1. Criar o site na Netlify a partir deste repositório.
2. Criar uma conta de serviço Google com a Drive API ativa e partilhar **apenas** o ficheiro Excel com o email dessa conta, como Editor. A partilha pública não muda.
3. Definir na Netlify (Environment variables, nunca no código) `GOOGLE_SERVICE_ACCOUNT_JSON`, `ADMIN_PASSWORD_HASH` e `ADMIN_SESSION_SECRET`. Os dois últimos vêm de `npm run admin:password`.

Sem estas variáveis, o site público funciona com o snapshot e o `/admin` explica que a gestão ainda não está configurada.

## Limitações conhecidas

- O Google Drive não oferece compare-and-swap para ficheiros binários. O servidor verifica a versão antes de gravar e relê depois. Se alguém gravar o Excel por cima no mesmo instante (por exemplo, com o Excel aberto no computador), a perda é detetada e mostrada no painel, mas não pode ser impedida. Ver ARCHITECTURE.md.
- A folha só lê **10 nomes por célula** de marcadores e parte os nomes com uma janela de 200 caracteres. O painel não deixa gravar listas que o Excel leria mal.
- O painel lança e corrige resultados, mas não apaga um resultado já lançado. Para isso é preciso editar o Excel.
- Os gráficos usam só o que a fonte tem (resultados e marcadores). Não há minutos, assistências, remates nem posse.
- Plantéis, treinadores e fotografias aguardam uma fonte autorizada (Zerozero). Os estados vazios são intencionais.

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md): decisões, modelo, sincronização, segurança e privacidade.
- [CHANGELOG.md](CHANGELOG.md): o que foi entregue e o que está pendente.
- [docs/DATA-SOURCE.md](docs/DATA-SOURCE.md): inventário da fonte de 16/11/2026 e valores de controlo.
- [docs/VERIFICATION.md](docs/VERIFICATION.md): verificações executadas.
- [docs/ZEROZERO.md](docs/ZEROZERO.md): estado da integração de plantéis.
