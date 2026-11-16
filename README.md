# MINHO11

### Futebol de formação do Alto Minho

MINHO11 é uma plataforma independente para acompanhar competições de futebol jovem: resultados, classificações, calendário, marcadores e perfis de clubes. O projeto começa pelo **Torneio Distrital Benjamins Gomes Ribeiro — Sub-11**, com uma experiência pensada para jogadores, famílias e clubes.

![Identidade visual do MINHO11](assets/social.png)

**Estado:** versão inicial funcional, em desenvolvimento. A integração Zerozero aguarda aprovação de acesso. Não existe uma publicação de produção verificada.

## O produto

- **Competições e séries:** classificações da fonte, resultados e calendário por jornada.
- **Centro de jogo:** página própria para cada encontro, com equipas, resultado, data e marcadores autorizados.
- **Clubes:** perfis com estatísticas e distinção entre as várias equipas do mesmo clube.
- **Plantéis e equipa técnica:** estrutura preparada para jogadores, posições, camisolas, treinadores e fotografias autorizadas.
- **Bota de Ouro:** pesquisa, filtros e posições partilhadas em caso de empate.
- **Estatísticas:** golos, jogos realizados, médias e comparação entre séries.
- **Experiência de utilização:** temas claro e escuro, navegação móvel, pesquisa sem distinção de acentos e ligações diretas para as páginas.

Plantéis, nomes individuais e fotografias só são apresentados quando existem dados e autorizações de publicação. A estrutura disponível não equivale a uma integração externa já ativa.

## Abordagem técnica

O MINHO11 usa **JavaScript modular, pré-renderização estática e um importador Python independente**. Esta arquitetura permite servir páginas completas sem um servidor de aplicação, manter custos operacionais baixos e atualizar a competição a partir de uma fonte validada.

| Camada | Implementação |
| --- | --- |
| Interface | HTML semântico, CSS com tokens de tema e módulos ES |
| Domínio | Funções partilhadas entre o build e o navegador |
| Importação | Python e OpenXML, com bibliotecas padrão |
| Publicação | Snapshot JSON filtrado e páginas HTML pré-renderizadas |
| Qualidade | Testes Python/Node, validação de contratos e GitHub Actions |
| Alojamento previsto | Netlify, com configuração incluída |

Não são necessários pacotes npm ou Python externos para executar a versão atual. A escolha de uma aplicação estática e os limites da solução estão documentados em [ARCHITECTURE.md](ARCHITECTURE.md).

## Começar

Requisitos: **Node.js 20+** e **Python 3.9+**. A configuração de CI usa Node 24 e Python 3.11.

```bash
git clone https://github.com/Rodrigodantas04/AFViana-Sub11.git
cd AFViana-Sub11
npm run dev
```

Abrir **http://127.0.0.1:4173**. Um checkout público funciona com o snapshot validado incluído no repositório. Não é necessário ter o Excel original para explorar a aplicação.

```bash
npm run check     # Verificar a sintaxe dos módulos
npm run build     # Preparar os dados e gerar dist/
npm test          # Executar os testes depois do build
npm run preview   # Servir uma compilação existente
```

Após alterações ao código ou aos dados, executar novamente o build e atualizar o navegador. A variável `PORT` permite escolher outra porta.

## Dados e atualização

O Excel da competição é a fonte de referência dos resultados e classificações. O original contém informação individual e **não faz parte deste repositório público**.

O fluxo de atualização é:

```text
Excel privado → Importação → Validação → Filtro de publicação
                                           ↓
                                  Snapshot público
                                           ↓
                              GitHub → Build → Website
```

Para atualizar os dados, o responsável autorizado coloca o ficheiro em `data/source.xlsx`, executa `npm run import` e revê `data/internal/validation.json`. Depois, versiona apenas o snapshot público gerado. Os ficheiros privados estão excluídos pelo `.gitignore`.

Quando o Excel está disponível localmente, `npm run build` executa a importação antes de compilar. Sem esse ficheiro, compila o snapshot versionado e indica explicitamente que não foi feita uma nova importação. Um erro num Excel presente interrompe o build, em vez de substituir silenciosamente os dados por uma versão anterior.

As páginas abertas verificam novas versões publicadas a cada 45 segundos. Esta atualização depende de uma nova publicação dos dados; não corresponde a relato em direto nem à leitura contínua do computador do organizador.

As classificações do Excel são preservadas. Cálculos independentes servem para diagnosticar divergências, sem alterar a fonte. O importador utiliza os resultados calculados guardados no XLSX; não recalcula fórmulas Excel.

## Privacidade

A separação entre dados internos e públicos faz parte do processo de importação:

- Excel original, relatórios internos e credenciais ficam fora do Git e de `dist/`.
- Os nomes individuais estão desativados por omissão e exigem autorização por registo.
- Fotografias exigem autorização específica de publicação e direitos de utilização da imagem.
- A compilação copia apenas os recursos públicos necessários.
- Os testes públicos usam uma fixture com nomes substituídos, sem identificar os jogadores da fonte.

O processo de autorização e remoção está descrito em [ARCHITECTURE.md](ARCHITECTURE.md). As configurações não substituem a confirmação das permissões pelo responsável do projeto.

## Integração Zerozero

A fronteira para receber clubes, plantéis e equipa técnica está definida. A ligação real à API depende da aprovação developer, da documentação disponibilizada, da cobertura Sub-11 e das condições de utilização de dados e imagens.

Nenhuma credencial ou endpoint de plantéis presumido está incluído. As futuras chamadas serão feitas no build ou num backend, mantendo a chave fora do navegador. Ver [docs/ZEROZERO.md](docs/ZEROZERO.md).

## Qualidade e publicação

A versão inicial foi verificada com **41 testes automáticos** e percursos no navegador em desktop e telemóvel. Os testes incluem importação, dados inválidos, identidade dos jogos, autorizações, rankings empatados, ligações e proteção da compilação pública. O registo de verificações e os limites encontram-se em [docs/VERIFICATION.md](docs/VERIFICATION.md).

Para publicar no Netlify, importar este repositório. O `netlify.toml` define `npm run build` e `dist` como diretório de publicação. `SITE_URL`, ou a variável `URL` fornecida pelo Netlify, permite gerar canonical e sitemap com o domínio de produção. A versão atual não exige chaves de API.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [Arquitetura](ARCHITECTURE.md) | Decisões técnicas, modelo de dados e limites |
| [Histórico](CHANGELOG.md) | Melhorias e evolução por versão |
| [Auditoria](docs/AUDIT.md) | Análise da aplicação e da fonte recebidas |
| [Verificação](docs/VERIFICATION.md) | Testes executados e verificações no navegador |
| [Zerozero](docs/ZEROZERO.md) | Preparação e requisitos da integração |

Os próximos passos são a integração autorizada de plantéis e técnicos, a inclusão de emblemas e fotografias licenciados e a validação de uma publicação de produção.

---

MINHO11 é um projeto independente. Não é uma plataforma oficial da AF Viana do Castelo nem do Zerozero.
