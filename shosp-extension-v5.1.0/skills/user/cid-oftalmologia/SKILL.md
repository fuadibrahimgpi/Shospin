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

---

## Como o cadastro é acionado pela extensão

**Arquivo:** `scripts/sidepanel-injection.js` → `handleSearchCid(field)`

- Lê o conteúdo do campo `diagnosticoField` (ou `diagnosticoRetornoField`)
- Separa múltiplos diagnósticos por `\n`, `,` ou `;` (a IA usa `\n` como separador padrão)
- O Gemini gera os diagnósticos no formato **`"H010 - Blefarite bilateral"`** — a função extrai só o código (`H010`) com regex `/^([A-Z]\d+(?:\.\d+)?)\s*[-–]/` antes de enviar ao SHOSP
- Se o campo não tiver código CID (texto livre antigo), usa o texto completo como fallback
- Envia `{ action: 'searchCid', term }` para o content script via `sendToTab` com apenas o código
- Após sucesso, atualiza o campo com os termos restantes (joined por `\n`) e **auto-encadeia** o próximo termo com delay de 1800ms — sem necessidade de clique manual

**Arquivo:** `dist/content.js` → `case 'searchCid':`

---

## Implementação técnica — handler `searchCid`

### Passo 1 — Navegar até a aba C.I.D.

Busca por texto exato `"C.I.D."` ou `"CID"` nos elementos navegáveis do menu:
```
querySelectorAll('a, td, li, span.itemMenu, div.itemMenu, ul.nav a, .menu-item')
```
Fallback: `td[id*="CID"], a[href*="cid"], [data-section*="cid"]`

Aguarda **700ms** para a seção renderizar.

### Passo 2 — Localizar o campo de busca

Ordem de prioridade:
1. `document.getElementById('nomeCid')`
2. `input[placeholder*="Digite o código ou nome do CID"]`
3. `input[placeholder*="CID"]` / `input[name*="nomeCid"]`
4. `waitForElement('#nomeCid', 3000)` → `waitForElement('input[placeholder*="Digite o código"]', 2000)`

### Passo 3 — Preencher o campo e disparar autocomplete

- Limpa o valor anterior via `nativeSetter` (compatível com React/Angular) + dispara `input`
- Aguarda **100ms**, define o novo valor e dispara: `input`, `change`, `keyup`
- Aguarda **400ms** e chama `window.buscaCidProntuario()` se disponível
- Aguarda **1500ms** para o dropdown/resultados aparecerem

### Passo 4 — Localizar o item correto

**Prioridade A — dropdown autocomplete visível:**
```
ul.autocomplete, ul.dropdown-menu, ul[class*="suggest"],
div[class*="autocomplete"], div[class*="dropdown"]
```
Filtra apenas elementos com `offsetParent !== null` (visíveis).

**Prioridade B — tabela de resultados padrão SHOSP:**
```
#divResultadoBuscaPadraoCid
[id*="ResultadoBuscaCid"], [id*="resultadoCid"]
```

**Correspondência dentro do container:**
- Candidatos: `a, li, tr, div[onclick]`
- Exata: 1ª coluna (`td`) ou texto do elemento === `term.toUpperCase()`
- Parcial: texto começa com ou contém o termo

### Passo 5 — Clicar no item e responder

```js
targetEl.click();
await new Promise(r => setTimeout(r, 600));
sendResponse({ success: true });
```

---

## Diagnóstico de falhas comuns

| Sintoma | Causa provável | O que verificar |
|---|---|---|
| "Campo de busca CID não encontrado" | `#nomeCid` e placeholder mudaram no SHOSP | Inspecionar o input no DevTools, atualizar seletor |
| "Nenhum resultado para o CID" | Dropdown não abriu ou seletores do dropdown mudaram | Ver quais `ul`/`div` ficam visíveis após digitar |
| CID errado selecionado | Correspondência parcial pegou item incorreto | Usar código exato (ex: `H010`) ao invés de nome |
| Aba C.I.D. não encontrada | Texto do menu mudou no SHOSP | Inspecionar o `textContent` do item de menu |

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
