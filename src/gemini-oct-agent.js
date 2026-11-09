/**
 * AGENTE DE LAUDO DE OCT — GLAUCOMA (2026-11-09)
 *
 * Porta da skill `laudo-oct-glaucoma-oftalmologia` para o runtime da extensão
 * (Gemini). As regras clínicas vivem NESTE prompt — a skill é documentação; o
 * que o médico recebe é o que está aqui (lição do log de comorbidades: uma regra
 * que existia só na skill não protegeu o prontuário).
 *
 * Fluxo: imagens/PDF do OCT → Gemini → JSON {e_oct, laudo, alertas[]} →
 * decisão determinística de injeção (decidirInjecao) → campo OCT da aba Glaucoma.
 *
 * O texto injetado é só o laudo: o rodapé "Confira os valores…" e os alertas ⚠️
 * ficam no painel, não no prontuário.
 *
 * Módulo duplo: no painel vira window.GeminiOctAgent; no Node (testes) é
 * module.exports. Não depende de nada global além do que é passado em `deps`.
 */
(function (root) {
  'use strict';

  const PROMPT_OCT_GLAUCOMA = `Você é um assistente que transcreve exames de OCT para glaucoma (tomografia de coerência óptica) em um laudo DOCUMENTAL e OBJETIVO, em português do Brasil, para o prontuário de um oftalmologista.

Você recebe uma ou mais imagens/páginas de UM exame de OCT. Leia visualmente cada página.

## PASSO 0 — Identificar o exame
- Equipamento (Topcon, Zeiss Cirrus, Heidelberg Spectralis, Optovue/RTVue, Nidek…) pelo logo/cabeçalho. Se não der, omita a linha.
- Blocos presentes: CFNR/RNFL (anel peripapilar), Disco óptico (área do disco, rim, escavação), Células ganglionares da mácula. Laude só os presentes e diga quais não constam.
- Use o termo IMPRESSO pelo aparelho para a camada ganglionar: Cirrus = GCIPL; RTVue/Optovue = GCC; Spectralis = GCL; Topcon = GCL+ / GCL++.
- Só mapa de espessura retiniana total (ETDRS) sem camada ganglionar: transcreva os valores impressos e escreva "sem análise de células ganglionares — não é análise de glaucoma".
- Se a imagem NÃO for um OCT (ex.: ticket de refração, campo visual isolado, foto de rosto), responda e_oct=false e laudo vazio.

## REGRA #0 — Leitura independente por olho
OD e OE são exames distintos, muitas vezes na mesma página.
1. Localize o bloco do OD e leia tudo dele.
2. Depois leia o bloco do OE do zero.
3. NUNCA copie valor de um olho para o outro, mesmo que pareçam iguais.
ARMADILHA — mapas espelhados: nos diagramas de quadrante/relógio (RNFL) e nos mapas de setores (GCL/GCC), NASAL e TEMPORAL ficam invertidos entre OD e OE. Superior e inferior não mudam. Confirme os setores separadamente em cada olho, pelo rótulo do setor, nunca pela posição na página. Superior e inferior são decisivos em glaucoma: confira antes de transcrever.

## Regras anti-alucinação
1. Transcreva apenas valores e classificações IMPRESSOS e visíveis.
2. Campo ilegível/cortado → "não legível" só naquele campo.
3. Olho ausente → declare que não foi avaliado. Nunca gere seção vazia que pareça normal.
4. Nunca copie valores entre OD e OE.
5. Não calcule médias, diferenças ou percentuais que não estejam impressos.
6. Classificações/cores do software (verde, amarelo, vermelho, branco/cinza, percentis do banco normativo) são dado impresso: transcreva com a cor ou o percentil nomeado, exatamente como aparece.
7. Sempre reporte a qualidade do sinal de cada olho.
8. Imagem rotacionada, cortada ou tabela fora da página → alerta.
9. NÃO escreva diagnóstico, estadiamento ("glaucoma inicial/moderado/avançado") nem conduta — nem no resumo, nem nos achados. Proibido: "glaucoma" como diagnóstico, "compatível com glaucoma", "sugestivo de glaucoma", "glaucomatoso", "dano glaucomatoso", recomendar exame, retorno ou tratamento.
10. O resumo de risco só pode se apoiar em classificações/cores/percentis impressos. Não some achados por conta própria para criar risco que o relatório não sinaliza.

## Achados a extrair (por olho, quando impressos)
- Geral: qualidade do sinal; data do exame; protocolo/varredura.
- CFNR/RNFL: espessura média global (µm) + cor; quadrantes S, N, I, T (µm + cor); setores em relógio se impressos; perfil TSNIT só o que o relatório classificar; simetria interocular se impressa.
- Disco: área do disco, área do rim, relação escavação/disco horizontal, vertical e média, volume da escavação (os impressos).
- GCL/GCC/GCIPL: média global (µm) + cor; mínima se impressa; superior e inferior (µm + cor); assimetria superior-inferior só se impressa.
- Progressão (se impressa): tendência µm/ano, classificação do software, datas e número de exames. Sem interpretar.

## Parágrafo RESUMO (risco para glaucoma)
Um parágrafo de 2 a 4 frases, documental, nesta ordem:
1. Veredito por olho, SÓ com estas categorias, conforme o que o exame classifica: "sem sinais estruturais de risco" (tudo dentro dos limites normais), "sinais estruturais limítrofes" (amarelo/borderline) ou "sinais estruturais de risco aumentado" (vermelho/fora dos limites normais em CFNR, rim/escavação ou GCL/GCC).
2. Onde está o achado, em uma frase, só se o exame classificar.
3. Ressalva de confiabilidade se houver (sinal baixo, segmentação, descentralização, bloco ausente). Se comprometer a leitura, diga que o risco não pode ser estimado com segurança.
4. Progressão, só se impressa.
Concordância entre blocos só se o próprio relatório mostrar as duas alterações; apenas aponte a coincidência. Se faltar bloco ou olho, abra o resumo dizendo o que não foi avaliado.

## Formato do campo "laudo" (texto puro, quebras de linha com \\n)
LAUDO DE OCT — GLAUCOMA
Data do exame: [DD/MM/AAAA]
Equipamento: [se identificável — omitir a linha se não]
Blocos presentes: [RNFL / Disco / GCL-GCC; o ausente como "não consta neste exame"]

RESUMO
[parágrafo]

ANÁLISES ESPECÍFICAS

OLHO DIREITO (OD)
Qualidade do sinal: [valor]
CFNR: [média] µm [cor] | S [v] [cor] · N [v] [cor] · I [v] [cor] · T [v] [cor]
Disco: [área do disco] · [área do rim] · E/D H [v] · V [v] · média [v] · volume escavação [v]
GCL/GCC: [média] µm [cor] | superior [v] [cor] · inferior [v] [cor]

OLHO ESQUERDO (OE)
[mesma estrutura]

Simetria interocular: [só se impressa]
Progressão: [só se impressa]

Omita a linha de um bloco que não está no exame. Use o termo do aparelho na linha da camada ganglionar (GCL+, GCIPL, GCC…). NÃO coloque rodapé, aviso ou alerta ⚠️ dentro do laudo.

## Alertas (vão no campo "alertas", NUNCA no laudo)
Tipos permitidos:
- "sinal_baixo": qualidade de sinal baixa em OD/OE
- "segmentacao": possível erro de segmentação visível
- "descentrado": anel de varredura possivelmente descentrado
- "condicao_normativo": disco muito pequeno/grande, atrofia peripapilar, miopia alta, outra doença macular/retiniana visível ou impressa
- "olhos_identicos": OD e OE com valores idênticos (página duplicada?)
- "olho_ausente": só um olho no material
- "multiplas_datas": mais de um exame/data no material
- "aparelhos_diferentes": aparelhos ou protocolos diferentes misturados
- "imagem_cortada": imagem rotacionada, cortada, tabela fora da página
- "ilegivel": valores importantes não legíveis
- "outro"

## Saída
Responda SOMENTE com um objeto JSON, sem texto antes ou depois:
{
  "e_oct": true,
  "laudo": "LAUDO DE OCT — GLAUCOMA\\nData do exame: ...",
  "alertas": [ { "tipo": "sinal_baixo", "olho": "OD", "texto": "Qualidade de sinal baixa em OD — confiabilidade reduzida" } ]
}
"olho" é "OD", "OE", "AO" ou null. Sem alertas → "alertas": [].`;

  // Alertas que impedem a injeção AUTOMÁTICA (o laudo fica no painel e o médico
  // decide pelo botão). São os "pausar e perguntar" da skill: qual exame/olho/
  // aparelho o laudo representa não está claro.
  const ALERTAS_BLOQUEANTES = new Set([
    'olhos_identicos', 'olho_ausente', 'multiplas_datas', 'aparelhos_diferentes', 'imagem_cortada',
  ]);

  const TIPOS_ALERTA = new Set([
    'sinal_baixo', 'segmentacao', 'descentrado', 'condicao_normativo', 'olhos_identicos',
    'olho_ausente', 'multiplas_datas', 'aparelhos_diferentes', 'imagem_cortada', 'ilegivel', 'outro',
  ]);

  // Linguagem de diagnóstico/estadiamento/conduta — proibida no laudo (E08 da
  // skill; regra do médico "fundoscopia descritiva, não interpretativa"). Um
  // acerto segura a injeção automática; não reescreve o texto.
  const LINGUAGEM_DIAGNOSTICA = [
    { re: /glaucomatos[oa]s?/i, rotulo: 'glaucomatoso(a)' },
    { re: /(compat[ií]ve(l|is)|sugestiv[oa]s?|indicativ[oa]s?|suspeit[oa]s?|caracter[ií]stic[oa]s?|t[ií]pic[oa]s?)\s+(com|de|para)\s+(dano\s+)?glaucoma/i, rotulo: 'interpretação de glaucoma' },
    { re: /glaucoma\s+(inicial|incipiente|leve|moderad[oa]|avan[cç]ad[oa]|grave|severo|terminal|prim[aá]rio|secund[aá]rio|de\s+[aâ]ngulo|cr[oô]nico|suspeito|prov[aá]vel|confirmado)/i, rotulo: 'estadiamento/diagnóstico de glaucoma' },
    { re: /(diagn[oó]stico|impress[aã]o\s+diagn[oó]stica)\s*(de\s|:)/i, rotulo: 'diagnóstico' },
    { re: /\b(recomenda(-se|mos|do)?|sugere-se|sugerimos|indica-se|solicitar|repetir\s+o\s+exame|correlacionar|acompanhamento|tratamento|iniciar)\b/i, rotulo: 'conduta/recomendação' },
  ];

  // Linha de rodapé/aviso que a skill manda mostrar ao médico mas que não é laudo.
  const LINHA_NAO_LAUDO_RE = /^\s*(⚠️?|confira\s+os\s+valores|-{3,}\s*$)/i;

  const LIMITE_BYTES = 15 * 1024 * 1024; // inline_data: o pedido inteiro tem teto de ~20 MB

  /**
   * Partes do generateContent: o prompt e cada arquivo como inline_data.
   * @param {Array<{mimeType:string, base64:string}>} arquivos
   */
  function montarPartes(arquivos) {
    const lista = Array.isArray(arquivos) ? arquivos : [];
    if (!lista.length) throw new Error('Nenhuma imagem do OCT carregada');
    let total = 0;
    const partes = [{ text: PROMPT_OCT_GLAUCOMA }];
    for (const a of lista) {
      if (!a || !a.base64 || !/^(image\/|application\/pdf$)/.test(a.mimeType || '')) {
        throw new Error('Arquivo não suportado — use imagem (JPG/PNG) ou PDF');
      }
      total += Math.floor(a.base64.length * 3 / 4);
      partes.push({ inline_data: { mime_type: a.mimeType, data: a.base64 } });
    }
    if (total > LIMITE_BYTES) {
      throw new Error('Arquivos grandes demais para uma chamada (máx. ~15 MB no total) — envie menos páginas ou imagens menores');
    }
    return partes;
  }

  /** Tira do laudo o que não é laudo: rodapé "Confira…", separador e linhas ⚠️. */
  function limparLaudoParaInjecao(laudo) {
    const linhas = String(laudo || '').replace(/\r\n/g, '\n').split('\n');
    const mantidas = linhas.filter(l => !LINHA_NAO_LAUDO_RE.test(l));
    return mantidas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** @returns {string[]} rótulos das expressões diagnósticas encontradas */
  function verificarLinguagemDiagnostica(laudo) {
    const texto = String(laudo || '');
    return LINGUAGEM_DIAGNOSTICA.filter(p => p.re.test(texto)).map(p => p.rotulo);
  }

  /** Normaliza o JSON do Gemini; tolera campos faltando ou tipos errados. */
  function interpretarResposta(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    const alertas = (Array.isArray(o.alertas) ? o.alertas : [])
      .filter(a => a && typeof a === 'object' && String(a.texto || '').trim())
      .map(a => ({
        tipo: TIPOS_ALERTA.has(a.tipo) ? a.tipo : 'outro',
        olho: ['OD', 'OE', 'AO'].includes(a.olho) ? a.olho : null,
        texto: String(a.texto).trim(),
      }));
    const laudo = limparLaudoParaInjecao(typeof o.laudo === 'string' ? o.laudo : '');
    return { eOct: o.e_oct !== false && !!laudo, laudo, alertas };
  }

  /**
   * Decide se o laudo pode ir sozinho para o prontuário.
   * @returns {{auto:boolean, motivos:string[]}}
   */
  function decidirInjecao(resultado) {
    const r = resultado || {};
    const motivos = [];
    if (!r.eOct) motivos.push('A imagem não parece ser um OCT — nada a injetar');
    else {
      if (!/\bRESUMO\b/.test(r.laudo)) motivos.push('Laudo fora do formato (sem RESUMO)');
      for (const a of r.alertas || []) {
        if (ALERTAS_BLOQUEANTES.has(a.tipo)) motivos.push(a.texto);
      }
      const diag = verificarLinguagemDiagnostica(r.laudo);
      if (diag.length) motivos.push(`Laudo com linguagem não documental (${diag.join(', ')}) — revise antes de injetar`);
    }
    return { auto: motivos.length === 0, motivos };
  }

  /**
   * Gera o laudo. `deps.apiService.callGeminiAPI` e `deps.parseJSON` são os do
   * painel (ApiService.js / gemini-json-utils.js).
   */
  async function gerarLaudo(arquivos, deps) {
    const { apiService, parseJSON } = deps || {};
    if (!apiService || typeof parseJSON !== 'function') throw new Error('GeminiOctAgent: dependências ausentes');
    const partes = montarPartes(arquivos);
    // Sem thinkingBudget: ler mapa de setores colorido precisa do raciocínio.
    // O teto de saída inclui o thinking do 2.5 Flash — por isso acima do padrão.
    const resp = await apiService.callGeminiAPI(partes, { maxOutputTokens: 24576 });
    const resultado = interpretarResposta(parseJSON(resp.text || '', 'laudo-oct'));
    return { ...resultado, decisao: decidirInjecao(resultado) };
  }

  const api = {
    PROMPT_OCT_GLAUCOMA,
    ALERTAS_BLOQUEANTES,
    montarPartes,
    limparLaudoParaInjecao,
    verificarLinguagemDiagnostica,
    interpretarResposta,
    decidirInjecao,
    gerarLaudo,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GeminiOctAgent = api;
})(typeof window !== 'undefined' ? window : null);
