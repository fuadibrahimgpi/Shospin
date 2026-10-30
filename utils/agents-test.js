/**
 * Teste dos subagentes da conduta. Execute com: node utils/agents-test.js
 * Roda sem IA: valida o contrato, o léxico e o agente de medicamentos sobre o
 * corpus em utils/corpus/medicamentos.json.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Contrato = require('../src/agents/agent-contract.js');
const Lexico = require('../config/medicamentos-lexico.js');
const Med = require('../src/agents/medicamentos-agent.js');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'medicamentos.json'), 'utf8'));

let ok = 0, falhas = 0;
function t(nome, cond, extra) {
  if (cond) { ok++; console.log(`✅  [${nome}]`); }
  else { falhas++; console.log(`❌  [${nome}]${extra ? ' ' + extra : ''}`); }
}

// Contrato
t('CONTRATO-1', Contrato.conferirAgente(Med).length === 0, Contrato.conferirAgente(Med).join(','));
t('CONTRATO-2', Contrato.conferirAgente({ nome: 'x', campo: 'foo' }).length >= 4);
t('CONTRATO-3', Contrato.verificarEvidencia([{ evidencia: '' }], 'qualquer fala').descartados.length === 1);

// Léxico: ids únicos e regex válidos; nenhum nome vazio
const ids = Lexico.MEDICAMENTOS_LEXICO.map(e => e.id);
t('LEXICO-1', new Set(ids).size === ids.length, 'ids repetidos');
t('LEXICO-2', Lexico.MEDICAMENTOS_LEXICO.every(e => e.nomes.length && e.principio && e.classe));
t('LEXICO-3', Lexico.encontrarMedicamentos('Vigadexa de manhã').length === 1, 'Vigadexa não pode virar também dexametasona');
t('LEXICO-4', Lexico.encontrarMedicamentos('trometolou')[0]?.id === 'cetorolaco');
t('LEXICO-5', Lexico.encontrarMedicamentos('Lágrima artificial e Xalatan').map(a => a.id).join() === 'lubrificante,latanoprosta');
const _nome = txt => { const a = Lexico.encontrarMedicamentos(txt)[0]; return a && Lexico.nomeRegistrado(a); };
t('LEXICO-6', _nome('Vigadexa') === 'Moxifloxacino + dexametasona (Vigadexa)', _nome('Vigadexa'));
t('LEXICO-7', _nome('dorzolamida') === 'Dorzolamida', 'princípio dito sozinho não ganha marca');
t('LEXICO-8', _nome('Systane') === 'Lubrificante ocular (Systane)' && _nome('hialuronato') === 'Hialuronato' && _nome('lubrificante') === 'Lubrificante ocular');
t('LEXICO-9', _nome('trometolou') === 'Cetorolaco' && _nome('tobra-dexa') === 'Tobramicina + dexametasona', 'variante de ASR não vira marca');
t('LEXICO-10', Lexico.MEDICAMENTOS_LEXICO.every(e => (e.marcas || []).every(m => e.nomes.some(n => Lexico.normalizarLexico(n).replace(/ /g, '') === Lexico.normalizarLexico(m).replace(/ /g, '')))), 'marca fora de nomes nunca casaria');

// Detecção
for (const [i, d] of corpus.deteccao.entries()) {
  t(`DETECTAR-${i + 1}`, Med.detectar(d.fala) === d.detectar, d.fala);
}

// Casos do corpus
for (const c of corpus.casos) {
  const r = Med.validar(c.modelo, c.fala);
  const f = Med.formatar(r.aceitos);
  const e = c.esperado;
  t(`MED-${c.id}`,
    r.aceitos.length === e.aceitos && r.descartados.length === e.descartados &&
    f.tratamento === e.tratamento &&
    (e.avisos == null || r.avisos.length === e.avisos) &&
    (e.suspensos == null || JSON.stringify(f.suspensos) === JSON.stringify(e.suspensos)),
    JSON.stringify({ aceitos: r.aceitos.length, descartados: r.descartados.length, tratamento: f.tratamento, avisos: r.avisos, suspensos: f.suspensos }));
}


// Modo sombra no DecisionEngine: só registra, nunca altera o tratamento
const DecisionEngine = require('../src/DecisionEngine.js');
function sombra(fala, tratamento) {
  const raw = { dados: { tratamento }, tipo_consulta: 'retorno' };
  const d = DecisionEngine.buildDecision(raw, { transcribedText: fala });
  return { log: d.guardsApplied.filter(g => g.startsWith('[sombra:medicamentos]')), trat: d.clonedAIResponse.dados.tratamento };
}
const s1 = sombra('Vou passar o Xalatan à noite.', 'Medicação ocular prescrita');
t('SOMBRA-1', s1.log.length === 1 && s1.trat === 'Medicação ocular prescrita', JSON.stringify(s1));
const s2 = sombra('Vou passar o Xalatan à noite.', 'Latanoprosta à noite');
t('SOMBRA-2', s2.log.length === 0, JSON.stringify(s2));
const s3 = sombra('Exame normal, volta em um ano.', null);
t('SOMBRA-3', s3.log.length === 0);

// Recheck da injeção — fidelidade enviado × prontuário (camada 1)
const Recheck = require('../src/agents/recheck-agent.js');
const enviadoAten = Recheck.montarEnviado({ audio: {
  tipo: 'primeira_consulta', hda: 'Paciente refere dor ocular há 3 dias.',
  medicacoes_em_uso: null, antecedentes_oftalmologicos: null, alteracoes_sistemicas: null, antecedentes_familiares: null,
  conduta: 'Retorno em 30 dias.', tratamento: null } });
t('RECHECK-1', enviadoAten.length === 2 && enviadoAten[0].label === 'Atendimento' && enviadoAten[1].label === 'Conduta',
  JSON.stringify(enviadoAten.map(i => i.label)));

const r1 = Recheck.conferirFidelidade(enviadoAten, {
  Atendimento: 'Paciente refere dor ocular há 3 dias.',
  Conduta: 'Retorno em 30 dias.' });
t('RECHECK-2', r1.divergencias.length === 0 && r1.conferidos === 2, JSON.stringify(r1));

// Truncamento: o SHOSP gravou só o começo da frase
const r2 = Recheck.conferirFidelidade(enviadoAten, { Atendimento: 'Paciente refere dor ocular', Conduta: 'Retorno em 30 dias.' });
t('RECHECK-3', r2.divergencias.length === 1 && r2.divergencias[0].label === 'Atendimento', JSON.stringify(r2.divergencias));

// Texto que não foi enviado aparece no prontuário (alteração/alucinação na injeção) — o enviado precisa estar lá
const r3 = Recheck.conferirFidelidade([{ label: 'Conduta', texto: 'Retorno em 30 dias.' }], { Conduta: 'Solicitar OCT de nervo óptico' });
t('RECHECK-4', r3.divergencias.length === 1, JSON.stringify(r3));

// Rótulo ausente do readback (aba não estava no DOM) é não-verificável, não divergência
const r4 = Recheck.conferirFidelidade(enviadoAten, { Conduta: 'Retorno em 30 dias.' });
t('RECHECK-5', r4.naoVerificaveis.join() === 'Atendimento' && r4.divergencias.length === 0, JSON.stringify(r4));

// Fonte de save vazia: divergência com motivo próprio
const r5 = Recheck.conferirFidelidade([{ label: 'Biomicroscopia', texto: 'Córnea transparente' }], { Biomicroscopia: '' });
t('RECHECK-6', r5.divergencias.length === 1 && r5.divergencias[0].motivo === 'fonte de save vazia', JSON.stringify(r5));

// Prontuário já tinha texto antes: a linha enviada só precisa estar contida
const r6 = Recheck.conferirFidelidade([{ label: 'Conduta', texto: 'Retorno em 30 dias.' }], { Conduta: 'Texto antigo do médico.\nRetorno em 30 dias.' });
t('RECHECK-7', r6.divergencias.length === 0, JSON.stringify(r6));

// Froala muda pontuação e acento no innerText: não pode gerar divergência falsa
const r7 = Recheck.conferirFidelidade([{ label: 'Conduta', texto: 'Sem alteração de pressão; ocular.' }], { Conduta: 'sem alteracao de pressao ocular' });
t('RECHECK-8', r7.divergencias.length === 0, JSON.stringify(r7));

// Biomicroscopia multilinha: uma linha alterada basta para divergir
const r8 = Recheck.conferirFidelidade([{ label: 'Biomicroscopia', texto: 'Córnea transparente\nCâmara anterior profunda' }], { Biomicroscopia: 'Córnea transparente\nCâmara anterior rasa' });
t('RECHECK-9', r8.divergencias.length === 1 && r8.divergencias[0].linha === 'Câmara anterior profunda', JSON.stringify(r8));

console.log(`\n  Total: ${ok + falhas}  |  ✅ ${ok}  |  ❌ ${falhas}`);
process.exit(falhas ? 1 : 0);
