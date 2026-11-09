/**
 * Laudo de OCT (glaucoma) — execute com: node utils/oct-test.js
 * Sem IA e sem DOM: valida o agente (src/gemini-oct-agent.js), a escolha do
 * campo OCT por rótulo (content.js) e a fiação do modo OCT no painel.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Oct = require('../src/gemini-oct-agent.js');

const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const contentJs = ler('src', 'content.js');
const painelHtml = ler('sidepanel.html');
const painelOct = ler('scripts', 'sidepanel-oct.js');

let ok = 0, falhas = 0;
function t(nome, cond, extra) {
  if (cond) { ok++; console.log(`✅  [${nome}]`); }
  else { falhas++; console.log(`❌  [${nome}]${extra ? ' ' + extra : ''}`); }
}
async function tAsync(nome, fn) {
  try { const r = await fn(); t(nome, r === true, typeof r === 'string' ? r : ''); }
  catch (e) { t(nome, false, e.message); }
}

function extrairFn(src, nome) {
  const ini = src.indexOf('function ' + nome);
  if (ini === -1) throw new Error('função não encontrada: ' + nome);
  let i = src.indexOf('{', ini), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}' && --prof === 0) { i++; break; }
  }
  return src.slice(ini, i);
}
const escolher = new Function(extrairFn(contentJs, '_escolherCampoOct') + '\nreturn _escolherCampoOct;')();

const LAUDO_OK = [
  'LAUDO DE OCT — GLAUCOMA',
  'Data do exame: 03/11/2026',
  'Equipamento: Topcon',
  'Blocos presentes: RNFL / Disco / GCL-GCC',
  '',
  'RESUMO',
  'OD com sinais estruturais de risco aumentado: CFNR inferior fora dos limites normais (vermelho); sinal adequado. OE sem sinais estruturais de risco; sinal adequado.',
  '',
  'ANÁLISES ESPECÍFICAS',
  '',
  'OLHO DIREITO (OD)',
  'Qualidade do sinal: 62',
  'Disco: E/D V 0,72 · média < 0,8',
  '',
  'OLHO ESQUERDO (OE)',
  'Qualidade do sinal: 64',
].join('\n');

(async () => {
  // ── Prompt carrega as regras da skill (o runtime é a autoridade) ──
  const P = Oct.PROMPT_OCT_GLAUCOMA;
  t('PROMPT-1 leitura independente e espelhamento', /REGRA #0/.test(P) && /NASAL e TEMPORAL ficam invertidos/.test(P));
  t('PROMPT-2 proíbe diagnóstico/estadiamento/conduta', /NÃO escreva diagnóstico, estadiamento/.test(P) && /compatível com glaucoma/.test(P));
  t('PROMPT-3 categorias de risco do resumo', /sem sinais estruturais de risco/.test(P) && /sinais estruturais limítrofes/.test(P) && /sinais estruturais de risco aumentado/.test(P));
  t('PROMPT-4 termo do aparelho', /Cirrus = GCIPL/.test(P) && /Topcon = GCL\+/.test(P));
  t('PROMPT-5 alertas fora do laudo', /NUNCA no laudo/.test(P));

  // ── montarPartes ──
  const partes = Oct.montarPartes([{ mimeType: 'image/png', base64: 'AAAA' }, { mimeType: 'application/pdf', base64: 'BBBB' }]);
  t('PARTES-1 prompt + inline_data por arquivo', partes.length === 3 && partes[0].text === P && partes[2].inline_data.mime_type === 'application/pdf');
  let lancou = false; try { Oct.montarPartes([]); } catch (_) { lancou = true; }
  t('PARTES-2 sem arquivo lança', lancou);
  lancou = false; try { Oct.montarPartes([{ mimeType: 'text/plain', base64: 'AAAA' }]); } catch (_) { lancou = true; }
  t('PARTES-3 tipo não suportado lança', lancou);
  lancou = false; try { Oct.montarPartes([{ mimeType: 'image/jpeg', base64: 'A'.repeat(21 * 1024 * 1024) }]); } catch (_) { lancou = true; }
  t('PARTES-4 acima de ~15 MB lança', lancou);

  // ── limpeza do laudo ──
  const sujo = LAUDO_OK + '\n⚠️ Qualidade de sinal baixa em OE — confiabilidade reduzida\n---\nConfira os valores com o exame original antes de anexar à ficha do paciente.\n';
  t('LIMPA-1 tira rodapé, separador e ⚠️', Oct.limparLaudoParaInjecao(sujo) === LAUDO_OK, JSON.stringify(Oct.limparLaudoParaInjecao(sujo).slice(-80)));
  t('LIMPA-2 mantém "<" do valor', Oct.limparLaudoParaInjecao(LAUDO_OK).includes('média < 0,8'));

  // ── interpretarResposta / decidirInjecao ──
  const r1 = Oct.interpretarResposta({ e_oct: true, laudo: LAUDO_OK, alertas: [] });
  t('DEC-1 laudo limpo e sem alerta → automático', Oct.decidirInjecao(r1).auto === true);

  const r2 = Oct.interpretarResposta({ e_oct: true, laudo: LAUDO_OK, alertas: [{ tipo: 'sinal_baixo', olho: 'OE', texto: 'Sinal baixo em OE' }] });
  t('DEC-2 sinal baixo avisa mas não bloqueia', Oct.decidirInjecao(r2).auto === true && r2.alertas[0].olho === 'OE');

  for (const tipo of ['olho_ausente', 'olhos_identicos', 'multiplas_datas', 'aparelhos_diferentes', 'imagem_cortada']) {
    const r = Oct.interpretarResposta({ e_oct: true, laudo: LAUDO_OK, alertas: [{ tipo, texto: 'x ' + tipo }] });
    const d = Oct.decidirInjecao(r);
    t(`DEC-3 ${tipo} segura a injeção automática`, d.auto === false && d.motivos.includes('x ' + tipo));
  }

  const r4 = Oct.interpretarResposta({ e_oct: false, laudo: '', alertas: [] });
  t('DEC-4 não é OCT → nada a injetar', r4.eOct === false && Oct.decidirInjecao(r4).auto === false);

  const r5 = Oct.interpretarResposta({ e_oct: true, laudo: 'texto solto sem formato', alertas: [] });
  t('DEC-5 laudo sem RESUMO não vai sozinho', Oct.decidirInjecao(r5).auto === false);

  const r6 = Oct.interpretarResposta({ laudo: LAUDO_OK, alertas: [{ tipo: 'inventado', olho: 'X', texto: ' algo ' }, null, { tipo: 'outro' }] });
  t('DEC-6 alerta de tipo desconhecido vira "outro"; vazio é descartado', r6.alertas.length === 1 && r6.alertas[0].tipo === 'outro' && r6.alertas[0].olho === null && r6.alertas[0].texto === 'algo');

  t('DEC-7 resposta nula não quebra', Oct.decidirInjecao(Oct.interpretarResposta(null)).auto === false);

  // ── linguagem diagnóstica (E08) ──
  const diag = (s) => Oct.verificarLinguagemDiagnostica(LAUDO_OK + '\n' + s).length > 0;
  t('DIAG-1 "compatível com glaucoma"', diag('Achados compatíveis com glaucoma.'));
  t('DIAG-2 "sugestivo de glaucoma"', diag('Quadro sugestivo de glaucoma no OD.'));
  t('DIAG-3 "glaucoma moderado"', diag('Glaucoma moderado no OD.'));
  t('DIAG-4 "dano glaucomatoso"', diag('Padrão de dano glaucomatoso.'));
  t('DIAG-5 recomendação/conduta', diag('Recomenda-se campo visual.') && diag('Sugere-se acompanhamento.'));
  t('DIAG-6 "Diagnóstico:"', diag('Diagnóstico: suspeita'));
  t('DIAG-7 laudo documental passa', Oct.verificarLinguagemDiagnostica(LAUDO_OK).length === 0);
  t('DIAG-8 "risco aumentado" é linguagem permitida', !diag('OE com sinais estruturais de risco aumentado.'));
  const r8 = Oct.interpretarResposta({ e_oct: true, laudo: LAUDO_OK + '\nCompatível com glaucoma inicial.', alertas: [] });
  t('DIAG-9 linguagem diagnóstica segura a injeção automática', Oct.decidirInjecao(r8).auto === false);

  // ── gerarLaudo com API falsa ──
  await tAsync('GERAR-1 chama a API sem thinkingBudget e com teto alto', async () => {
    let cfg = null;
    const api = { callGeminiAPI: async (p, c) => { cfg = c; return { text: '```json\n' + JSON.stringify({ e_oct: true, laudo: LAUDO_OK, alertas: [] }) + '\n```' }; } };
    const parse = (txt) => JSON.parse(txt.replace(/```json|```/g, ''));
    const r = await Oct.gerarLaudo([{ mimeType: 'image/png', base64: 'AAAA' }], { apiService: api, parseJSON: parse });
    return cfg && !('thinkingBudget' in cfg) && cfg.maxOutputTokens >= 16384 && r.decisao.auto && r.laudo === LAUDO_OK;
  });
  await tAsync('GERAR-2 sem dependências lança', async () => {
    try { await Oct.gerarLaudo([{ mimeType: 'image/png', base64: 'A' }], {}); return false; } catch (_) { return true; }
  });

  // ── escolha do campo OCT por rótulo (content.js) ──
  const c = (rotulo) => ({ rotulo });
  t('CAMPO-1 único "OCT" é escolhido', escolher([c('Tonometria'), c('OCT'), c('Paquimetria')]).campo?.rotulo === 'OCT');
  t('CAMPO-2 variantes de rótulo', ['O.C.T.', 'OCT:', 'Laudo OCT', 'Tomografia de coerência óptica', 'oct de nervo'].every(r => escolher([c(r)]).campo));
  t('CAMPO-3 nenhum → motivo "nenhum"', escolher([c('Tonometria'), c('Gonioscopia'), c('')]).motivo === 'nenhum');
  t('CAMPO-4 dois → "ambiguo", sem escolher', (() => { const r = escolher([c('OCT'), c('OCT de mácula')]); return r.campo === null && r.motivo === 'ambiguo' && r.casam.length === 2; })());
  t('CAMPO-5 palavras que contêm "oct" não casam', escolher([c('Doctor'), c('Octávio'), c('protocolo')]).motivo === 'nenhum');
  t('CAMPO-6 rótulo longo (texto de container) é ignorado', escolher([c('Glaucoma Tonometria OD OE Paquimetria OD OE OCT Campo visual Gonioscopia Observações')]).motivo === 'nenhum');
  t('CAMPO-7 lista vazia/nula', escolher(null).motivo === 'nenhum' && escolher([]).motivo === 'nenhum');

  // ── fiação no content.js e no painel ──
  t('FIO-1 content.js responde injectOctLaudo e dumpCamposGlaucoma', contentJs.includes("case 'injectOctLaudo':") && contentJs.includes("case 'dumpCamposGlaucoma':"));
  const corpoInject = contentJs.slice(contentJs.indexOf('async injectOctLaudo('), contentJs.indexOf('Encontra editores Froala dentro de uma aba específica'));
  t('FIO-2 injeção não usa fallback por índice/label solto', !/findEditorByLabel|getEditorByIndex|allowYPositionFallback/.test(corpoInject));
  t('FIO-3 escapa "<" antes de virar HTML', corpoInject.includes(".replace(/</g, '&lt;')"));
  t('FIO-4 não sobrescreve sem confirmação', corpoInject.includes('campo.temConteudo && !substituir'));
  const idxAgente = painelHtml.indexOf('src/gemini-oct-agent.js');
  const idxOct = painelHtml.indexOf('scripts/sidepanel-oct.js');
  t('FIO-5 painel carrega agente antes do script do modo, e este depois do init',
    idxAgente > painelHtml.indexOf('src/gemini-json-utils.js') && idxOct > painelHtml.indexOf('scripts/sidepanel-init.js') && idxOct > idxAgente);
  t('FIO-6 sem JS inline no painel (MV3)', !/<script>(?!\s*<\/script>)/.test(painelHtml) && !/\son(click|change|load)=/i.test(painelHtml));
  t('FIO-7 modo OCT fora do injectAll/clearAll', !/action:\s*'injectAll'|clearAll\(/.test(painelOct));

  console.log(`\n  Total: ${ok + falhas}  |  ✅ ${ok}  |  ❌ ${falhas}`);
  process.exit(falhas ? 1 : 0);
})();
