---
name: cid-oftalmologia
description: >
  Documenta o fluxo de cadastro de CID no prontuário SHOSP, a implementação
  técnica do handler searchCid no content script, e a lista completa de CIDs
  oftalmológicos (H00–H59). Use esta skill quando houver problemas com a injeção
  de CID (campo não encontrado, dropdown não aparece, item não selecionado),
  quando precisar ajustar seletores do SHOSP, ou quando a lógica de busca/seleção
  precisar ser alterada. Também use para consultar qual código CID corresponde a
  um diagnóstico oftalmológico.
---

# Cadastro de CID no Prontuário SHOSP

## Fluxo de usuário (comportamento esperado do SHOSP)

1. Clicar em **C.I.D.** no menu lateral esquerdo do prontuário
2. Aparecer campo com placeholder **"Digite o código ou nome do CID..."**
3. Digitar o código ou nome (ex: `H010` ou `blefarite`)
4. Dropdown abre com sugestões — inclui seção **"Últimos CIDs selecionados"**
5. Clicar no item correto (ex: `H010 - BLEFARITE`)
6. SHOSP exibe toast **"Registro adicionado com sucesso."** no canto superior direito

> ⚠️ **O passo 4 é a armadilha central desta integração.** O painel de resultados
> mostra o histórico de CIDs recentes da clínica junto (ou antes) dos resultados
> da busca. Ler o painel sem checar se ele contém o código PEDIDO faz a extensão
> tratar o histórico como resultado. Foi a causa raiz da instabilidade de
> 2026-07-30 — ver "Instabilidade 2026-07-30" no fim deste documento.

---

## Como o cadastro é acionado pela extensão

**Arquivo:** `scripts/sidepanel-injection.js` → `handleSearchCid(field)`

- Lê o conteúdo do campo `diagnosticoField` (ou `diagnosticoRetornoField`)
- Separa múltiplos diagnósticos por `\n`, `,` ou `;` (a IA usa `\n` como separador padrão)
- O Gemini gera os diagnósticos no formato **`"H010 - Blefarite bilateral"`** — a função extrai só o código (`H010`) com regex `/^([A-Z]\d+(?:\.\d+)?)\s*[-–]/` antes de enviar ao SHOSP
- Se o campo não tiver código CID (texto livre antigo), usa o texto completo como fallback
- Envia `{ action: 'searchCid', term }` para o content script via `sendToTab` com apenas o código
- Após sucesso, atualiza o campo com os termos restantes (joined por `\n`) e **auto-encadeia** o próximo termo com delay de 1800ms — sem necessidade de clique manual

**Arquivo:** `src/content.js` → `case 'searchCid':` (não existe `dist/` — o
`manifest.json` carrega `src/content.js` direto)

---

## Implementação técnica — handler `searchCid`

### Passo 1 — Localizar o campo de busca

```js
document.querySelector('#formCadProntuario #nomeCid') || document.getElementById('nomeCid')
```
Sem o campo, responde `success: false` imediatamente. (Não há navegação de aba
aqui: quando este handler roda, a seção C.I.D. já está montada.)

### Passo 2 — Construir as variantes de BUSCA

> ⚠️ **O formato da plataforma é SEM PONTO.** Confirmado pelo médico em
> 2026-07-30 e visível nas próprias linhas de resultado do SHOSP
> (`H522ASTIGMATISMO.`, `H010BLEFARITE.`). Vale para **todos** os CIDs.
>
> Até essa data o painel fazia o inverso: `handleSearchCid` convertia `H400` em
> `H40.0` antes de buscar, "para compatibilidade com o autocomplete". Não
> quebrava porque o content script tentava a variante sem ponto primeiro — o
> ponto era posto no painel e tirado no content script — mas o log mentia sobre
> o que fora buscado (`[SearchCid] termo="H52.1"` para um campo que dizia
> `H521`). Hoje o painel normaliza para sem ponto na origem
> (`termToSearch.replace(/\./g, '')`) e o OCR emite `H521 - Miopia`, igual ao
> agente de entrevista. Testes `[CIDDOT-1..5]`.

As variantes ampliam a consulta. A **sem ponto vem sempre primeiro**; a com ponto
é rede de segurança e só roda depois que a primeira não retornou nada:

| Termo pedido | Variantes buscadas |
|---|---|
| `H520` | `H520`, `H52.0`, `H52` |
| `H010` | `H010`, `H01.0`, `H01` |
| `blefarite` | `blefarite` |

Se o termo vier com descrição, as palavras com >3 letras entram como variantes finais.

> **Variante ≠ critério de aceitação.** Buscar por `H52` é legítimo; aceitar
> `H52.4` quando o pedido era `H52.0` não é. Ver Passo 4.

### Passo 3 — Preencher e disparar a busca (`fillAndSearch`)

- Limpa `innerHTML` dos contêineres de resultado
- Aguarda **150ms**, `focus()`, define o valor via `nativeSetter` (React/Angular)
  e dispara `input` + `change`
- Aguarda **200ms** e limpa os contêineres de novo (derruba o histórico que
  aparece ao focar)
- Clica no botão: `#btnBuscaCidProntuario` → `#btn_buscaCidProntuario` →
  `a|button[onclick*='buscaCidProntuario']` → botão vizinho ao campo.
  Sem botão, dispara `Enter` (`keydown`+`keyup`) no campo.

A limpeza é **melhor-esforço**, não garantia: o SHOSP re-renderiza o histórico
de forma assíncrona. A correção real está no Passo 4.

### Passo 4 — Esperar a linha PEDIDA (`waitForCidRow` + `_pickCidRow`)

`collectRows()` junta as linhas `tr[onclick]` de **todos** os contêineres
(`[id*="ResultadoBuscaCid"], [id*="resultadoCid"], #divResultadoBuscaPadraoCid`)
— não só do primeiro não-vazio.

`waitForCidRow` faz *poll* a cada 300ms até **4s** e só retorna quando
`_pickCidRow` acha a linha do código pedido. Um render que não contém o código
não encerra a espera — é provavelmente o histórico enquanto o AJAX está em voo.
Saída antecipada por **estabilidade**: conteúdo idêntico por 3 ciclos *e* já
passados **2s** ⇒ é a resposta final do SHOSP (código ausente do subset), sai sem
queimar o timeout inteiro.

> O piso de 2s é conservador, **não medido**: as linhas `[SearchCid]` do console
> não têm timestamp, então a latência real do AJAX não é extraível do log. Custo
> de um código ausente: ~2,4s por variante (~7s nas 3) — o mesmo já observado
> para o H04.1 em 2026-07-30, então a margem não deixou a falha mais lenta.

`_pickCidRow(rows, term)` — **matcher estrito**, sobre `onclick` + texto,
normalizados (maiúsculas, sem ponto):

1. Código **igual** ao pedido, com bordas não-alfanuméricas
   (`(?<![A-Z0-9])H400(?![A-Z0-9])` — impede que `H40.0` case `H40.00`)
2. **Só se o pedido for uma categoria de 3 chars** (`H46` Neurite óptica, `H55`
   Nistagmo — códigos que só existem nessa forma): aceita a subcategoria `H46\d`
3. Termo **sem código** (texto livre): casa a linha que contém **todas** as
   palavras >3 letras

Sem match ⇒ **falha explícita**. Não existe fallback que aceite outro código.

### Passo 5 — Verificar, clicar e responder

- Extrai `normCode` do `onclick` da linha; se divergir do pedido, **aborta antes
  do clique** (linha divergente envenenaria o Set de dedup)
- Guards de dedup: `__shospInjectedCids` (por paciente) e
  `_isRedundantUnspecifiedRefraction` (pula `H52.9` se já há `H52.0–H52.4`)
- `targetRow.click()` → 500ms → procura o código **fora** dos painéis de busca
  (`_findCidOutsideSearchPanels`) e responde `{ success: true, _landed }`

> `success: true` significa "cliquei na linha certa". `_landed` vazio no log ⇒ o
> SHOSP pode ter recusado o registro; é o sinal a investigar.

---

## Diagnóstico de falhas comuns

| Sintoma | Causa provável | O que verificar |
|---|---|---|
| "Campo #nomeCid não encontrado" | Seletor mudou no SHOSP | Inspecionar o input no DevTools |
| `motivo: 'sem-resultado'` — "Nenhum resultado no SHOSP para o CID: X" | Nenhuma variante devolveu linha alguma | Esperado — entrada manual. **Não** remover o código do prompt |
| `motivo: 'ausente-no-subset'` — "a variante ampla "H25" devolveu só outros códigos" | A busca do código deu zero e só a **categoria** respondeu, com os irmãos | Ausência do subset da clínica. Entrada manual, **sem** mexer no prompt |
| `motivo: 'matching'` — "SHOSP retornou resultados **para o próprio código**" | Só aqui há bug a caçar. Se as descartadas forem sempre as mesmas 6 linhas ⇒ é o **histórico**, não resultado | Ler o `_dump` e `_attempts` da resposta: qual contêiner tem os resultados de verdade |
| CID errado lançado | Fallback permissivo (corrigido em 2026-07-30) | Rodar `CIDPICK-2`/`CIDPICK-3`; conferir se algum fallback voltou |
| `_landed: []` no log | Clique não aterrissou na ficha | Ver se o SHOSP exibiu o toast de erro |

---

## Instabilidade 2026-07-30 — causa raiz e correção

**Sintoma:** injeção de CID intermitente — "às vezes dá certo, às vezes injeta
alguns códigos e não todos".

**Prova no log:** as duas falhas do dia (`H04.1` às 12:03 e `T15.0` às 12:24,
20 minutos de intervalo) descartaram a **mesma lista de 6 linhas**:
`H010 BLEFARITE | H524 PRESBIOPIA | H522 ASTIGMATISMO | H521 MIOPIA |
H251 CATARATA SENIL NUCLEAR | H110 PTERIGIO`. Duas buscas diferentes não
retornam resultados idênticos — aquilo eram os **"Últimos CIDs selecionados"**
(passo 4 do fluxo de usuário, documentado desde sempre nesta skill).

**Duas falhas somadas:**

1. `waitForRows` devolvia as linhas do **primeiro contêiner não-vazio** e parava.
   Sem checar se o código pedido estava ali, o histórico virava "resultado".
2. `pickRow`/`tryPickFromRows` tinham **4 caminhos** que aceitavam código
   diferente do pedido: prefixo no `onclick`, prefixo no texto, qualquer linha da
   mesma categoria de 3 chars, e `rows.length === 1`.

**Como isso produzia os três sintomas:**

| Código pedido | O que acontecia com o histórico na tela |
|---|---|
| Está no histórico (H01.0, H52.2, H52.4) | Acertava **por sorte** |
| Mesma categoria de um do histórico (H52.0, H52.9) | Clicava **em outro código** (H52.4 Presbiopia) e respondia `success` |
| Categoria ausente (H04.1, T15.0, H35.0) | Falhava |

O caso do meio é o mais grave: CID errado no prontuário, sem aviso. E ele
envenenava o Set `__shospInjectedCids` — registrado `H524`, um H52.4 legítimo
depois seria pulado como "já injetado", e `_isRedundantUnspecifiedRefraction`
descartaria o H52.9 em seguida.

**Correção:** matcher estrito (`_pickCidRow`) + espera pela linha pedida
(`waitForCidRow`) + varredura de todos os contêineres + abort em divergência +
dumps de diagnóstico. Testes `CIDPICK-1..10` em `utils/integration-test.js`.

**Princípio:** num prontuário, **CID faltando é melhor que CID errado**. A falha
vira aviso persistente via `_surfaceFailedCids()` e o médico lança à mão.

### Efeito colateral esperado da correção

Códigos que só "funcionavam" porque caíam num vizinho do histórico passam a
**falhar visivelmente**. Isso é a correção operando, não uma regressão nova — o
CID já não estava sendo lançado corretamente antes.

### ✅ RESOLVIDO 2026-07-30 — `H52.9` não existe; o inespecífico é `H52.7`

Verificado na própria plataforma (busca real, sem clicar em nenhuma linha):

| Busca | Resultado |
|---|---|
| `H520` | `H520 HIPERMETROPIA` ✅ |
| `H527` | `H527 TRANSTORNO NAO ESPECIFICADO` ✅ |
| `H529` | **zero linhas** ❌ |
| `H162` | `H162 CERATOCONJUNTIVITE` ✅ (o "rejeitado" de 21/07 sempre esteve lá) |

Trocado para `H527` em `gemini-interview-agent.js`, `_isRedundantUnspecifiedRefraction`
e `_dropUnspecifiedRefraction` — o `H529` legado continua sendo descartado, porque
saída antiga da IA ainda pode trazê-lo. Testes `[CIDNE-1..3]`.

**A causa raiz das falhas de CID era outra e maior:** a busca do SHOSP só executa
com a seção C.I.D. **visível**. Oculta, `buscaCidProntuario()` retorna sem buscar e
o painel segue mostrando "Últimos CIDs selecionados" — as 6 linhas do histórico,
que eram lidas como resultado. Por isso só entravam códigos já usados
recentemente. `searchCid` agora ativa `#tdCadastro-cid` antes de buscar e falha
explicitamente se a seção não ficar visível. Testes `[CIDVIS-1..2]`.

### Correção 2026-07-30 (tarde) — o discriminador da falha existia só no nome

Caso: `H250 - Catarata senil incipiente AO` recusado. As variantes de `H250` são
`["H250", "H25.0", "H25"]` — as duas primeiras são o **código pedido**, a terceira
apenas **amplia** a consulta. Quando um código não está no subset, as exatas dão
zero e a categoria devolve os **irmãos** (`H251`, `H259`…). O `sawAnyRows` era
marcado por qualquer variante ⇒ toda ausência do subset saía como "SHOSP retornou
resultados mas nenhum correspondeu — **verifique matching**", que é exatamente o
outro diagnóstico. O sinal criado pela correção da manhã mandava caçar bug de
matching justamente no caso em que não há nada a corrigir no código.

`_classifyCidFailure(term, attempts)` separa os três motivos (`sem-resultado`,
`ausente-no-subset`, `matching`) usando a marca `exato` de cada variante, e a
resposta passa a levar `motivo` e `_attempts`. Testes `[CIDCLS-1..5]`.

> Isso é diagnóstico, não injeção: nenhum CID passa a entrar por causa dele. O que
> muda é que a mensagem para de apontar para o lugar errado.

### Registro histórico — a suspeita original

`src/gemini-interview-agent.js:552` instrui a IA a emitir `H529 = Refração NE`,
mas a tabela CID-10 desta skill lista **`H52.7`** como "Transtorno da refração,
não especificado" — não há `H52.9` na CID-10 (H52 vai de `.0` a `.7`).

Suspeita: `H52.9` nunca foi aceito pelo SHOSP; ele "funcionava" caindo no
fallback de categoria e clicando um `H52.x` do histórico. Isso explicaria o bug
"H52.9 duplicado" de 2026-07-21 como sintoma da **mesma** causa raiz.

**Verificação:** a busca por `H52.9` às 13:06 do log 2026-07-30 respondeu
`success` — abrir aquele prontuário e conferir se o que entrou foi *Presbiopia*.
Se foi, trocar `H529` → `H527` em `gemini-interview-agent.js:552,565,571` e nos
guards `_dropUnspecifiedRefraction` / `_isRedundantUnspecifiedRefraction`.
Decisão clínica — não alterar sem confirmação.

---

## Múltiplos CIDs

`handleSearchCid` processa um diagnóstico por vez (o primeiro da lista separada por `\n`, `,` ou `;`).
Após cada CID cadastrado com sucesso, a função remove o termo processado do campo e
**auto-encadeia** a próxima chamada via `setTimeout(handleSearchCid, 1800)` — não requer clique manual.
Quando todos os termos são processados e nenhum campo tem pendências, `audioFieldsContainer` é ocultado.

---

## CIDs Oftalmológicos — Referência Completa (H00–H59)

Formato de saída: `"H00.0 - Descrição"` — sempre use o código exato abaixo.

### H00–H06 Pálpebra, aparelho lacrimal e órbita

| Código | Descrição |
|--------|-----------|
| H00.0 | Hordéolo e outras inflamações profundas da pálpebra |
| H00.1 | Calázio |
| H01.0 | Blefarite |
| H01.1 | Dermatose não infecciosa da pálpebra |
| H01.8 | Outras inflamações especificadas da pálpebra |
| H01.9 | Inflamação da pálpebra, não especificada |
| H02.0 | Entrópio e triquíase da pálpebra |
| H02.1 | Ectrópio da pálpebra |
| H02.2 | Lagoftalmo |
| H02.3 | Blefarocalásia |
| H02.4 | Ptose da pálpebra |
| H02.5 | Outros transtornos que afetam a função da pálpebra |
| H02.6 | Xantelasma da pálpebra |
| H02.7 | Outros transtornos degenerativos da pálpebra e área periocular |
| H02.8 | Outros transtornos especificados da pálpebra |
| H02.9 | Transtorno da pálpebra, não especificado |
| H04.0 | Dacrioadenite |
| H04.1 | Outros transtornos da glândula lacrimal |
| H04.2 | Epífora |
| H04.3 | Inflamação aguda e não especificada das vias lacrimais |
| H04.4 | Inflamação crônica das vias lacrimais |
| H04.5 | Estenose e insuficiência das vias lacrimais |
| H04.6 | Outros transtornos das vias lacrimais |
| H04.8 | Outros transtornos do aparelho lacrimal |
| H04.9 | Transtorno do aparelho lacrimal, não especificado |
| H05.0 | Inflamação aguda da órbita |
| H05.1 | Transtornos inflamatórios crônicos da órbita |
| H05.2 | Condições exoftálmicas |
| H05.3 | Deformidade da órbita |
| H05.4 | Enoftálmo |
| H05.5 | Corpo estranho retido após penetração da órbita |
| H05.8 | Outros transtornos da órbita |
| H05.9 | Transtorno da órbita, não especificado |
| H06.2 | Exoftálmo distireoidiano |

### H10–H13 Conjuntiva

| Código | Descrição |
|--------|-----------|
| H10.0 | Conjuntivite mucopurulenta |
| H10.1 | Conjuntivite atópica aguda |
| H10.2 | Outras conjuntivites agudas |
| H10.3 | Conjuntivite aguda, não especificada |
| H10.4 | Conjuntivite crônica |
| H10.5 | Blefaroconjuntivite |
| H10.8 | Outras conjuntivites |
| H10.9 | Conjuntivite, não especificada |
| H11.0 | Pterígio |
| H11.1 | Degenerações e depósitos conjuntivais |
| H11.2 | Cicatrizes conjuntivais |
| H11.3 | Hemorragia conjuntival (hipósfagma) |
| H11.4 | Outros transtornos vasculares e cistos conjuntivais |
| H11.8 | Outros transtornos especificados da conjuntiva |
| H11.9 | Transtorno da conjuntiva, não especificado |
| H13.1 | Conjuntivite em doenças infecciosas classificadas em outra parte |

### H15–H22 Esclera, córnea, íris e corpo ciliar

| Código | Descrição |
|--------|-----------|
| H15.0 | Esclerite |
| H15.1 | Episclerite |
| H15.8 | Outros transtornos da esclera |
| H15.9 | Transtorno da esclera, não especificado |
| H16.0 | Úlcera de córnea |
| H16.1 | Outras ceratites superficiais sem conjuntivite |
| H16.2 | Ceratoconjuntivite |
| H16.3 | Ceratite intersticial e profunda |
| H16.4 | Neovascularização da córnea |
| H16.8 | Outras ceratites |
| H16.9 | Ceratite, não especificada |
| H17.0 | Leucoma aderente |
| H17.1 | Outras opacidades centrais da córnea |
| H17.8 | Outras opacidades e cicatrizes da córnea |
| H17.9 | Opacidade e cicatriz da córnea, não especificadas |
| H18.0 | Pigmentações e depósitos na córnea |
| H18.1 | Ceratopatia bolhosa |
| H18.2 | Outros edemas da córnea |
| H18.3 | Alterações nas membranas da córnea |
| H18.4 | Degenerações da córnea |
| H18.5 | Distrofias hereditárias da córnea |
| H18.6 | Ceratocone |
| H18.7 | Outros transtornos deformantes da córnea |
| H18.8 | Outros transtornos especificados da córnea |
| H18.9 | Transtorno da córnea, não especificado |
| H20.0 | Iridociclite aguda e subaguda (uveíte anterior aguda) |
| H20.1 | Iridociclite crônica (uveíte anterior crônica) |
| H20.2 | Iridociclite induzida pelo cristalino |
| H20.8 | Outras iridociclites |
| H20.9 | Iridociclite, não especificada |
| H21.0 | Hifema |
| H21.1 | Outros transtornos vasculares da íris e do corpo ciliar |
| H21.2 | Degenerações da íris e do corpo ciliar |
| H21.3 | Cistos da íris, do corpo ciliar e da câmara anterior |
| H21.4 | Membranas pupilares |
| H21.5 | Outras aderências e roturas da íris e do corpo ciliar |
| H21.8 | Outros transtornos especificados da íris e do corpo ciliar |
| H21.9 | Transtorno da íris e do corpo ciliar, não especificado |

### H25–H28 Cristalino

| Código | Descrição |
|--------|-----------|
| H25.0 | Catarata senil incipiente |
| H25.1 | Catarata senil nuclear |
| H25.2 | Catarata senil, tipo morgagniana |
| H25.8 | Outras cataratas senis |
| H25.9 | Catarata senil, não especificada |
| H26.0 | Catarata infantil, juvenil e pré-senil |
| H26.1 | Catarata traumática |
| H26.2 | Catarata complicada |
| H26.3 | Catarata induzida por drogas |
| H26.4 | Após-catarata (catarata secundária) |
| H26.8 | Outras cataratas especificadas |
| H26.9 | Catarata, não especificada |
| H27.0 | Afacia |
| H27.1 | Deslocamento do cristalino (luxação/subluxação) |
| H27.8 | Outros transtornos especificados do cristalino |
| H27.9 | Transtorno do cristalino, não especificado |
| H28.0 | Catarata diabética |
| H28.1 | Catarata em outras doenças endócrinas, nutricionais e metabólicas |
| H28.2 | Catarata em outras doenças classificadas em outra parte |

### H30–H36 Coróide e retina

| Código | Descrição |
|--------|-----------|
| H30.0 | Inflamação coriorretiniana focal |
| H30.1 | Inflamação coriorretiniana disseminada |
| H30.2 | Ciclite posterior (uveíte posterior) |
| H30.8 | Outras inflamações coriorretinianas |
| H30.9 | Inflamação coriorretiniana, não especificada |
| H31.0 | Cicatrizes coriorretinianas |
| H31.1 | Degeneração coroidal |
| H31.2 | Distrofia hereditária da coróide |
| H31.3 | Hemorragia e rotura coroidal |
| H31.4 | Descolamento da coróide |
| H31.8 | Outros transtornos especificados da coróide |
| H31.9 | Transtorno da coróide, não especificado |
| H33.0 | Descolamento de retina com ruptura retiniana |
| H33.1 | Retinosquise e cistos retinianos |
| H33.2 | Descolamento de retina seroso |
| H33.3 | Rupturas retinianas sem descolamento |
| H33.4 | Descolamento de retina tracional |
| H33.5 | Outros descolamentos da retina |
| H34.0 | Oclusão arterial retiniana transitória |
| H34.1 | Oclusão da artéria central da retina |
| H34.2 | Outras oclusões da artéria retiniana |
| H34.8 | Outras oclusões vasculares retinianas (oclusão de ramo) |
| H34.9 | Oclusão vascular retiniana, não especificada |
| H35.0 | Retinopatias de fundo e alterações vasculares retinianas |
| H35.1 | Retinopatia da prematuridade |
| H35.2 | Outras retinopatias proliferativas |
| H35.3 | Degeneração da mácula e do pólo posterior (DMRI) |
| H35.4 | Degenerações periféricas da retina |
| H35.5 | Distrofias retinianas hereditárias |
| H35.6 | Hemorragia retiniana |
| H35.7 | Separação das camadas retinianas |
| H35.8 | Outros transtornos especificados da retina |
| H35.9 | Transtorno retiniano, não especificado |
| H36.0 | Retinopatia diabética |
| H36.8 | Outros transtornos retinianos em doenças classificadas em outra parte |

### H40–H42 Glaucoma

| Código | Descrição |
|--------|-----------|
| H40.0 | Suspeita de glaucoma |
| H40.1 | Glaucoma primário de ângulo aberto |
| H40.2 | Glaucoma primário de ângulo fechado |
| H40.3 | Glaucoma secundário a traumatismo ocular |
| H40.4 | Glaucoma secundário a inflamação ocular |
| H40.5 | Glaucoma secundário a outros transtornos oculares |
| H40.6 | Glaucoma secundário a drogas |
| H40.8 | Outro glaucoma |
| H40.9 | Glaucoma, não especificado |
| H42.0 | Glaucoma em doenças endócrinas, nutricionais e metabólicas |
| H42.8 | Glaucoma em outras doenças classificadas em outra parte |

### H43–H45 Vítreo e globo ocular

| Código | Descrição |
|--------|-----------|
| H43.0 | Prólapso do vítreo |
| H43.1 | Hemorragia vítrea |
| H43.2 | Depósitos cristalinos no vítreo |
| H43.3 | Outras opacidades vítreas |
| H43.8 | Outros transtornos do vítreo |
| H43.9 | Transtorno do vítreo, não especificado |
| H44.0 | Endoftalmite purulenta |
| H44.1 | Outras endoftalmites |
| H44.2 | Miopia degenerativa |
| H44.3 | Outros transtornos degenerativos do globo ocular |
| H44.4 | Hipotonia ocular |
| H44.5 | Corpos estranhos intra-oculares degenerativos antigos |
| H44.6 | Corpo estranho intra-ocular magnético retido |
| H44.7 | Corpo estranho intra-ocular não magnético retido |
| H44.8 | Outros transtornos do globo ocular |
| H44.9 | Transtorno do globo ocular, não especificado |

### H46–H48 Nervo óptico e vias ópticas

| Código | Descrição |
|--------|-----------|
| H46 | Neurite óptica |
| H47.0 | Transtornos do nervo óptico NCOP |
| H47.1 | Papiledema, não especificado |
| H47.2 | Atrofia óptica |
| H47.3 | Outros transtornos do disco óptico |
| H47.4 | Transtornos do quiasma óptico |
| H47.5 | Transtornos de outras vias ópticas |
| H47.6 | Transtornos do córtex visual |
| H47.7 | Transtornos das vias ópticas, não especificados |

### H49–H51 Músculos oculares e movimento binocular

| Código | Descrição |
|--------|-----------|
| H49.0 | Paralisia do 3º nervo (oculomotor) |
| H49.1 | Paralisia do 4º nervo (troclear) |
| H49.2 | Paralisia do 6º nervo (abducente) |
| H49.3 | Oftalmoplegia total (externa) |
| H49.4 | Oftalmoplegia externa progressiva |
| H49.8 | Outras estrabismos paralíticos |
| H49.9 | Estrabismo paralítico, não especificado |
| H50.0 | Esotropia concomitante |
| H50.1 | Exotropia concomitante |
| H50.2 | Estrabismo vertical |
| H50.3 | Heterotropia intermitente |
| H50.4 | Outras heterotropias e as não especificadas |
| H50.5 | Heteroforia |
| H50.6 | Estrabismo mecânico |
| H50.8 | Outros estrabismos especificados |
| H50.9 | Estrabismo, não especificado |
| H51.0 | Paralisia do olhar conjugado |
| H51.1 | Insuficiência de convergência |
| H51.2 | Oftalmoplegia internuclear |
| H51.8 | Outros transtornos dos movimentos binoculares |
| H51.9 | Transtorno do movimento binocular, não especificado |

### H52–H54 Refração, acomodação, distúrbios visuais e cegueira

| Código | Descrição |
|--------|-----------|
| H52.0 | Hipermetropia |
| H52.1 | Miopia |
| H52.2 | Astigmatismo |
| H52.3 | Anisometropia e aniseiconia |
| H52.4 | Presbiopia |
| H52.5 | Transtornos da acomodação |
| H52.6 | Outros transtornos da refração |
| H52.7 | Transtorno da refração, não especificado |
| H53.0 | Ambliopia ex-anopsia |
| H53.1 | Perturbações visuais subjetivas |
| H53.2 | Diplopia |
| H53.3 | Outros transtornos da visão binocular |
| H53.4 | Defeitos do campo visual |
| H53.5 | Anomalias da visão cromática (discromatopsia) |
| H53.6 | Cegueira noturna |
| H53.8 | Outras perturbações visuais |
| H53.9 | Perturbação visual, não especificada |
| H54.0 | Cegueira em ambos os olhos |
| H54.1 | Cegueira em um olho e visão subnormal no outro |
| H54.2 | Visão subnormal em ambos os olhos |
| H54.3 | Perda não qualificada da visão em ambos os olhos |
| H54.4 | Cegueira em um olho |
| H54.5 | Visão subnormal em um olho |
| H54.6 | Perda não qualificada da visão em um olho |
| H54.7 | Perda da visão, não especificada |

### H55–H59 Outros transtornos do olho e anexos

| Código | Descrição |
|--------|-----------|
| H55 | Nistagmo e outros movimentos oculares irregulares |
| H57.0 | Anomalias da função pupilar |
| H57.1 | Dor ocular |
| H57.8 | Outros transtornos especificados do olho e seus anexos |
| H57.9 | Transtorno do olho e seus anexos, não especificado |
| H59.0 | Ceratopatia bolhosa pós-operatória |
| H59.8 | Outros transtornos do olho pós-procedimentos |
| H59.9 | Transtorno do olho pós-procedimentos, não especificado |
