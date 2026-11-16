# Arquitetura do MINHO11

## Problema e decisão

A base recebida tinha um HTML único com CSS, dados renderizados por JavaScript e funções globais, acompanhado por um importador XLSX em Python. A competição é pequena, as atualizações dependem da publicação do Excel e não existem, nesta fase, contas de utilizador nem escrita pública de resultados.

Mantém-se uma aplicação estática. O frontend foi separado em módulos ES que também correm em Node para pré-renderizar as páginas. O importador continua independente e sem dependências externas. Next.js, PostgreSQL e Supabase acrescentariam serviços sem resolver uma necessidade atual de escrita ou de autenticação. Esta decisão pode ser revista quando houver administração autenticada, várias competições ou consultas que exijam armazenamento transacional.

## Fluxo dos dados

Quando disponível no ambiente autorizado, `data/source.xlsx` é lido pelo adaptador OpenXML. O parser reconhece os cabeçalhos das oito folhas, normaliza os registos e produz um relatório de validação. A transformação de publicação remove informação individual não autorizada. O snapshot público é versionado; o build Node valida o contrato e gera apenas as páginas e os recursos necessários em `dist/`.

O repositório GitHub é público e exclui o Excel original. `scripts/prepare-data.mjs` importa a fonte quando ela existe localmente. Sem a fonte, usa explicitamente o snapshot público versionado. A presença de um Excel inválido faz falhar a importação; não desencadeia um fallback silencioso. O teste público do adaptador gera um XLSX temporário a partir de uma fixture com nomes substituídos. Num ambiente com a fonte autorizada, os testes também verificam os dados originais.

Uma atualização da fonte passa pelo mesmo processo. O snapshot público só é substituído depois de o Excel, a configuração e o cache autorizado de plantéis terem sido processados com sucesso. A escrita JSON usa ficheiro temporário e substituição atómica. Um build Netlify falhado não deve substituir o deploy anterior.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `scripts/import_excel.py` | Leitura XLSX, normalização, validação, relatório interno e transformação pública |
| `scripts/rosters.py` | Contrato de fornecedor de plantéis e filtragem de pessoas/imagens |
| `src/domain.js` | Seleção de jogos, estados, pesquisa, rankings, totais e validação do snapshot |
| `src/components.js` | Componentes HTML partilhados e escape de texto |
| `src/views.js` | Composição das páginas, clubes, jogos, estatísticas e plantéis |
| `src/app.js` | Navegação, filtros, temas, diálogo de pesquisa e verificação de novas versões |
| `scripts/build.mjs` | Pré-renderização e cópia explícita dos recursos públicos |
| `scripts/serve.mjs` | Servidor local restrito a `dist/` |

## Entidades e identificadores

Uma competição tem época, fase e séries. Uma equipa pertence a uma série da competição; um clube pode ter várias equipas. A relação entre Barroselas A/B e Monção A/B está explícita em `config/competition.json`, em vez de ser inferida num fornecedor remoto. Os restantes nomes mantêm a identidade da fonte até existir um mapeamento externo confirmado.

Os identificadores de jogo derivam de competição, série, jornada, equipa visitada e visitante. Não incluem resultado, data ou posição na folha: corrigir um resultado/data não cria um jogo novo. Alterar o nome de uma equipa pode mudar o seu identificador derivado; essa mudança exige um alias/migração explícitos. Trocar equipas ou jornada pode representar outro jogo e é tratado como nova identidade.

Um registo da tabela de marcadores é um registo de origem, não uma identidade de pessoa. Nomes iguais não são fundidos. A autorização liga a linha e a impressão digital do nome, equipa, competição e linha. Reordenar a folha pode exigir renovar as autorizações, uma escolha que falha de forma restritiva para evitar autorizar outra criança por acidente.

Plantéis externos usam identificadores reais do fornecedor, equipa e época. Nunca são associados a uma criança apenas pelo nome. O contrato TypeScript em `src/types.d.ts` documenta a fronteira futura; o frontend atual é JavaScript modular, sem compilador TypeScript.

## Regras da competição e qualidade

As classificações da fonte são preservadas, incluindo a ordem em empate. O diagnóstico independente usa a hipótese de 3 pontos por vitória e 1 por empate, com regras/desempates ainda por confirmar. Divergências são descritas em `data/internal/validation.json` e não alteram a fonte.

Resultados parciais ficam com estado incompleto e não entram nos jogos realizados. Valores de golos negativos, fracionários ou desconhecidos provocam erro explícito. Notas de desistência vêm da folha. Jogos passados sem resultado não são automaticamente classificados como adiados. Os estados de data usam Europe/Lisbon.

Notações de marcadores preservam a descrição original no conjunto interno. Autogolos não são associados ao jogador da equipa beneficiada. Comparações por nome exato são apenas diagnósticos e ignoram associações ambíguas. As estatísticas gerais com erros Excel ficam registadas no relatório, sem apresentar esses erros ao visitante.

O parser consome resultados calculados guardados no XLSX. Não recalcula fórmulas. Alterações de formato fora dos cabeçalhos reconhecidos exigem adaptar o importador e adicionar testes.

## Privacidade e publicação

`data/internal/` e `data/source.xlsx` não são servidos nem versionados no repositório público. A publicação inicial do código usa um histórico limpo, sem o commit local que continha o Excel. A fixture pública usa pseudónimos de teste e não identifica os jogadores. Um ambiente privado pode importar a fonte original sem a adicionar ao Git.

Para autorizar um marcador, um operador com fundamento de publicação confirmado coloca em `config/publication.json` uma entrada em `playerRecords` com a chave `id` encontrada no relatório interno. A entrada exige `fingerprint` coincidente e `authorizationReference` não vazia. Essa referência é um identificador interno de prova, não o documento de autorização; não guardar contactos, assinaturas ou documentos pessoais no Git. `excludedRecordIds` tem prioridade sobre a aprovação.

Para plantéis, `rosterRecords` usa `recordId`, com `fingerprint` e `authorizationReference`. A pessoa fica oculta se faltar algum requisito. `excludedRosterRecordIds` permite remoção. Nomes de técnicos também passam pela confirmação de utilização da fonte. Fotografias exigem adicionalmente `photoAuthorizationReference`, `photoHash` e a referência de direitos da imagem no cache. Só ficheiros locais raster com hash coincidente são copiados para `dist/media/`. Não se fazem pedidos a domínios externos no navegador para carregar fotografias.

Uma revogação exige retirar a aprovação, voltar a compilar e publicar. Não existe ainda painel de administração, servidor de consentimentos ou garantia de apagar cópias de terceiros. As autorizações são configuração operacional confirmada por uma pessoa, não uma validação jurídica automática.

Os marcadores de jogos só são apresentados quando há correspondência exata e única com um registo autorizado. Não se presume que a autorização de um ranking autorize fotografias. As páginas públicas de clubes e os metadados SEO não contêm nomes individuais por omissão.

## Navegação e atualização

Os mesmos componentes geram HTML inicial e atualizações no navegador. Cada jogo, clube e série possui um ficheiro HTML próprio, pelo que a atualização de uma ligação direta funciona sem depender de fallback SPA. Formulários GET e ligações continuam utilizáveis quando JavaScript está indisponível, embora filtros interativos exijam JavaScript para aplicar os parâmetros sobre o snapshot pré-renderizado.

Com JavaScript, navegação usa `pushState`, `replaceState` e `popstate`. Pesquisa não cria uma entrada por tecla; seleções de filtros ficam no URL. Os controlos de tema mantêm a chave original `minho11-theme`, com fallback à preferência do sistema. O script de tema é carregado antes da folha de estilos.

A verificação periódica valida o snapshot antes de trocar o estado, compara `version` e mantém os filtros, a vista e o foco. Erros distinguem versão inválida e ligação indisponível. O rodapé indica a última verificação e disponibiliza a data de importação. Não existe indicador de relato em direto.

## Desempenho e acessibilidade

Não há bibliotecas de interface, fontes remotas, rastreadores ou pedidos a terceiros. SVGs próprios representam ícones e grafismos; iniciais são substitutos identificáveis de emblemas, nunca emblemas oficiais inventados. CSS usa tokens semânticos e dois temas, com tabelas completas no desktop e estatísticas essenciais no telemóvel.

HTML semântico, foco visível, salto para o conteúdo, labels, diálogo nativo, estados textuais e respeito por movimento reduzido são implementados. Os testes de lógica e a revisão no navegador complementam-se; não constituem certificação WCAG nem medição de Core Web Vitals em produção.

## Deploy e evolução

Netlify recebe um build estático. `SITE_URL` ou `URL` fornece a origem real para canonical e sitemap. A política de cache força revalidação do JSON e dos módulos. A versão atual não requer segredos. Uma chave Zerozero futura ficará apenas no ambiente de build/backend, nunca no código do frontend ou no JSON público.

Uma fonte OneDrive/Drive pode substituir a aquisição do Excel antes do parser. Um adaptador Zerozero pode atualizar o cache normalizado de plantéis sem alterar resultados. Quando a aplicação precisar de escrita multiutilizador, a fronteira de domínio e os identificadores podem suportar um serviço e uma base de dados; não é uma migração já implementada.
