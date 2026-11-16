# Auditoria da base recebida

Análise de 16 de novembro de 2026, a partir do ZIP `MINHO11-modern-UI-netlify.zip` e do Excel fornecido separadamente. A pasta de trabalho do fixo não foi recuperada; esta evolução parte da base entregue no ZIP.

## O que existia

Um frontend num único HTML, com CSS e JavaScript embutidos, temas navy/lima e claro, resultados, séries, classificação, marcadores, pesquisa e diálogos de jogo/clube. O importador Python lia OpenXML sem pacotes externos. O Netlify publicava `public/` após gerar JSON a partir do Excel. A verificação de novos dados ocorria a cada 45 segundos.

## Pontos encontrados e resposta

| Observação | Resposta nesta versão |
| --- | --- |
| Funções globais, HTML monolítico e handlers inline | Separação entre domínio, componentes, vistas e controlador |
| Mudança de secção usava `replaceState`, sem histórico completo | URLs pré-renderizadas e navegação com retroceder/avançar |
| Rankings apresentavam posições sequenciais mesmo em empate | Ranking de competição com posições iguais para totais iguais |
| Todos os nomes individuais saíam no JSON público | Transformação pública com aprovação por registo |
| Clube/equipa tratados por nome | Registo de clubes e múltiplas equipas por clube |
| Jogos passados sem resultado ficavam como agendados | Estado “Resultado por confirmar” |
| Atualização voltava a renderizar secções e seletores | Versão validada, estado no URL e foco preservados |
| Nota de desistência vinha de uma condição para a série F | Nota extraída do Excel e equipa desistente explícita |
| Folha de estatística era exigida, mas os erros de fórmulas não eram diagnosticados | Relatório interno com origem e linha |

## Conferência da fonte

Os dois Excel têm tamanho e hash diferentes, mas o conteúdo desportivo normalizado comparado é igual. O snapshot analisado tem 6 séries, 33 equipas inscritas (32 em prova após a desistência), 150 jogos, 71 resultados completos, 433 golos e 199 registos de marcadores.

As classificações do snapshot coincidem com o diagnóstico dos resultados usando 3 pontos por vitória e 1 por empate. A ordem da fonte continua a prevalecer e os desempates oficiais não foram confirmados.

O relatório inicial contém 10 avisos: 2 diferenças entre contagem de golos descritos e resultado, 5 totais individuais sem correspondência exata nos eventos elegíveis e 3 células `#NAME?` na estatística geral. A fonte não foi alterada para eliminar avisos. O detalhe com linhas encontra-se no relatório interno gerado.

A verificação de datas acrescentou um aviso em 16/11/2026: o resultado GD Areosense–GD Meadela encontra-se associado a 21/11/2026, uma data futura. Ambos os valores foram preservados e o detalhe do jogo assinala a informação por confirmar. Este aviso deixa de ser temporalmente aplicável quando a data passar, sem alterar o resultado da fonte.

## Limites da auditoria

Não foram recuperados commits ou alterações posteriores do computador de casa. Não se verificaram dados oficiais externos, direitos de publicação individuais ou uma implantação de produção. A folha Excel continua a ser a referência entregue pelo responsável.
