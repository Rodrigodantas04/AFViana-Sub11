# Fonte de dados — inventário de 16/11/2026

- Pasta Drive privada: `1gKXXHvmW9FD3XlBzXUajNOmySfinwLS1`.
- Ficheiro: **AFVC_Torneio_Benjamins_Gomes_Ribeiro_Sub11_Completo.xlsx**, ID `10NzITORyeANQY2prYW9YHF4zJmxDAAqd`, XLSX binário de 1 851 330 bytes, modificado em 2026-11-16T12:03:28Z. A partilha não foi alterada.
- O link antigo `1yjxQxy4…` está substituído e não é usado.

## Pacote XLSX (inspeção bruta)

15 folhas visíveis, nenhuma oculta, sem `definedNames`, tabelas, desenhos, comentários nem ligações externas. Tem `calcChain.xml` e uma formatação condicional por folha, que destaca a AF Ponte Lima. A última gravação foi feita em Microsoft Excel por Rui Gonçalves (criado com openpyxl). Datas guardadas como texto `dd/mm/aaaa`.

| # | Folha | Notas |
| --- | --- | --- |
| 1–6 | `1ª Fase - Série 1`, `1.ª Fase - Série 2…6` | Nomes inconsistentes (`1ª` / `1.ª`). Letra da série no título A2. Séries de 6 equipas têm jogos nas linhas 14–72 e as de 5 equipas nas linhas 14–52 |
| 7 | `Marcadores 1ª Fase` | 300 células × 10 nomes → 3000 linhas auxiliares; ranking em 600 linhas |
| 8–13 | `2ª Fase - Série A…F` | M6:M11 por preencher. Jogos com fórmulas `IF(Mx="","",Mx)` e sem datas |
| 14 | `Marcadores 2ª Fase` | 360 células × 10 |
| 15 | `Marcadores Totais` | 660 células × 10 (1.ª e 2.ª fase) |

Introduzido por pessoas: M6:M11 (equipas, 1.ª fase e 2.ª fase), A/B/C/G das linhas de jogo (1.ª fase), D/F (golos) e C/G das linhas de marcadores. Todo o resto é calculado.

## Valores de controlo (recalculados e coincidentes com as caches do Excel)

| Série 1.ª fase | Jogos | Com resultado | Golos |
| --- | ---: | ---: | ---: |
| A (Série 1) | 30 | 17 | 118 |
| B (Série 2) | 20 | 12 | 73 |
| C (Série 3) | 30 | 17 | 97 |
| D (Série 4) | 30 | 16 | 102 |
| E (Série 5) | 20 | 12 | 61 |
| F (Série 6) | 20 | 7 | 59 |
| **Total** | **150** | **81** | **510** |

- 33 equipas (32 ativas; UD «Os Raianos» desistiu), uma página por equipa (Barroselas A e B e Monção A e B são quatro equipas independentes).
- 218 registos de marcador com golos, 494 golos individuais. As descrições somam 499 golos, dos quais 5 são autogolos (PB). Faltam 11 golos por identificar: Série B J6 (Freixo 1, Fachense 4), Série C J2 (Vila Fria 3), Série C J3 (Anha 1), Série C J6 (Darquense 2).
- A 2.ª fase não tem equipas, jogos nem golos. Rankings da 1.ª fase e acumulado idênticos (218 registos).

## Avisos para rever na fonte

1. Série D J7 tem resultado 1–4 (Areosense–Meadela) com data 21/11/2026, futura. Valor preservado.
2. Série A: os marcadores do Atlético Arcos na J6 são exatamente os do ARC Guilhadeses na J5 (7 nomes). Possível cópia.
3. Um nome do CC «Os Torreenses» aparece com maiúsculas diferentes em dois jogos: o Excel junta os registos (comparação sem maiúsculas).
4. 15 nomes aparecem em mais de uma equipa (incluindo Monção A/B). Ficam separados.

Verificação reproduzível, só local: `npm run verify:source`.
