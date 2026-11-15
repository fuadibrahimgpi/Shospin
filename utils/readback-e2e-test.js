/**
 * Teste ponta a ponta do recheck de fidelidade. Execute com: node utils/readback-e2e-test.js
 *
 * Roda o `injectAll` REAL de src/content.js (classe ShospInjector) sobre um DOM
 * simulado. Só os métodos que escrevem no Froala/textarea são substituídos: cada um
 * grava no textarea falso do prontuário, como o SHOSP faria. O bloco [Verify] e o
 * readback são o código de produção. Depois, o comparador do recheck (o mesmo que a
 * sidepanel chama em _recheckInjecao) confere o que foi enviado contra o readback.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Recheck = require('../src/agents/recheck-agent.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const ini = src.indexOf('class ShospInjector {');
const fim = src.indexOf('const fieldDetector = new ShospFieldDetector();');
if (ini < 0 || fim < 0) throw new Error('não achei ShospInjector em src/content.js');

const NUMS = ['78073', '80697', '89707', '78728', '78727'];

let ok = 0, falhas = 0;
function t(nome, cond, extra) {
  if (cond) { ok++; console.log(`✅  [${nome}]`); }
  else { falhas++; console.log(`❌  [${nome}]${extra ? ' ' + extra : ''}`); }
}

/** Prontuário falso: um textarea por aba; `ausentes` simula aba fora do DOM. */
function criarDoc(ausentes = []) {
  const containers = {};
  for (const n of NUMS) {
    if (ausentes.includes(n)) continue;
    containers[n] = { textareas: [{ id: `prontuario_resp_${n}`, value: '' }] };
  }
  return {
    containers,
    querySelector(sel) {
      const m = sel.match(/divTextoProntuarioServico(\d+)/);
      const c = m && containers[m[1]];
      if (!c) return null;
      return {
        querySelectorAll(s) { return s.startsWith('textarea') ? c.textareas : []; },
      };
    },
    getElementById() { return null; },
  };
}

/** Instancia o ShospInjector real com DOM falso e modo de gravação do "SHOSP". */
function criarInjector(doc, modo) {
  const sandbox = {
    document: doc,
    window: {},
    console: { log() {}, warn() {}, error() {} },
    contentLogger: { info() {}, warn() {}, error() {}, success() {}, log() {} },
    extractTabNumber: id => { const m = String(id || '').match(/\d+/); return m ? m[0] : ''; },
    TAB_LOAD_DELAY: 0,
    setTimeout: fn => { fn(); return 0; },
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(ini, fim), sandbox);
  const Injector = vm.runInContext('ShospInjector', sandbox);

  // Modo de gravação: 'ok' grava tudo; 'truncar' grava só o início; 'vazio' perde
  // o texto em silêncio (a injeção acha que deu certo).
  // Cada campo vira um editor (textarea) próprio, como no prontuário real.
  const gravar = (n, texto) => {
    const c = doc.containers[n];
    if (!c || texto == null || modo === 'vazio') return;
    c.textareas.push({
      id: `prontuario_resp_${n}_${c.textareas.length}`,
      value: modo === 'truncar' ? String(texto).slice(0, 20) : String(texto),
    });
  };

  const detector = {
    async refresh() {},
    getTabId(secao) {
      const num = { atendimento: '78073', retorno: '80697', conduta: '89707' }[secao];
      return num ? `tdCadastro-${num}` : null;
    },
  };
  const inj = new Injector(detector);
  inj.clickTab = async () => true;
  inj.openSection = () => {};
  inj.findFrElementsInTab = () => [];
  inj.fillOdOeInputs = async () => true;
  inj.fillRefractionFields = async () => true;
  inj.injectSingleField = async (campo, valor, tipo) => {
    gravar(tipo === 'retorno' ? '80697' : '78073', valor);
    return true;
  };
  inj.injectConduta = async ({ conduta, tratamento }) => {
    gravar('89707', [conduta, tratamento].filter(Boolean).join('\n'));
    return true;
  };
  inj.injectExamesNormais = async ({ biomicroscopia, fundoscopia }) => {
    gravar('78728', biomicroscopia);
    gravar('78727', fundoscopia);
    return true;
  };
  return inj;
}

// Payloads no formato do combinedData da sidepanel
const PAYLOAD_RETORNO = {
  audio: {
    tipo: 'retorno',
    retorno: 'Retorno em 30 dias para reavaliação da pressão.',
    uso: 'Latanoprosta 1 gota à noite.',
    conduta: 'Manter colírio atual.',
    tratamento: 'Latanoprosta 1 gota à noite.',
  },
  examesNormais: {
    biomicroscopia: 'Córnea transparente\nCâmara anterior profunda',
    fundoscopia: 'Papila de bordas nítidas.',
  },
};

const PAYLOAD_PRIMEIRA = {
  audio: {
    tipo: 'primeira_consulta',
    hda: 'Paciente refere dor ocular há três dias.',
    medicacoes_em_uso: null,
    antecedentes_oftalmologicos: null,
    alteracoes_sistemicas: null,
    antecedentes_familiares: null,
    conduta: 'Retorno em 15 dias.',
    tratamento: null,
  },
};

/** Mesmo caminho da sidepanel: injectAll → readback → montarEnviado → conferirFidelidade. */
async function rodar(payload, { modo = 'ok', ausentes = [] } = {}) {
  const doc = criarDoc(ausentes);
  const inj = criarInjector(doc, modo);
  const resp = await inj.injectAll(payload);
  const relatorio = Recheck.conferirFidelidade(Recheck.montarEnviado(payload), resp.readback);
  return { resp, relatorio };
}

(async () => {
  // C1 — injeção correta: nada divergente
  {
    const { resp, relatorio } = await rodar(PAYLOAD_RETORNO, { modo: 'ok' });
    t('E2E-1', resp.readback && typeof resp.readback === 'object', 'injectAll não devolveu readback');
    t('E2E-2', ['Retorno', 'Conduta', 'Biomicroscopia', 'Fundoscopia'].every(l => l in resp.readback),
      Object.keys(resp.readback || {}).join(','));
    t('E2E-3', relatorio.divergencias.length === 0 && relatorio.conferidos > 0,
      JSON.stringify(relatorio.divergencias));
  }

  // C2 — SHOSP gravou só o começo do texto: tem que acusar divergência
  {
    const { relatorio } = await rodar(PAYLOAD_RETORNO, { modo: 'truncar' });
    t('E2E-4', relatorio.divergencias.length > 0, 'truncamento passou batido');
    t('E2E-5', relatorio.divergencias.some(d => d.label === 'Retorno'),
      JSON.stringify(relatorio.divergencias.map(d => d.label)));
  }

  // C3 — texto perdido em silêncio (o bug que motivou o recheck): fonte vazia
  {
    const { resp, relatorio } = await rodar(PAYLOAD_RETORNO, { modo: 'vazio' });
    t('E2E-6', resp.success === true, 'injectAll deveria reportar success (é o bug silencioso)');
    t('E2E-7', relatorio.divergencias.some(d => d.motivo === 'fonte de save vazia'),
      JSON.stringify(relatorio.divergencias));
  }

  // C4 — aba de biomicroscopia não está no DOM: não verificável, não divergência
  {
    const { relatorio } = await rodar(PAYLOAD_RETORNO, { modo: 'ok', ausentes: ['78728'] });
    t('E2E-8', relatorio.naoVerificaveis.includes('Biomicroscopia') && !relatorio.divergencias.some(d => d.label === 'Biomicroscopia'),
      JSON.stringify(relatorio));
  }

  // C5 — primeira consulta: Atendimento entra no readback e na conferência
  {
    const { resp, relatorio } = await rodar(PAYLOAD_PRIMEIRA, { modo: 'ok' });
    t('E2E-9', 'Atendimento' in resp.readback && relatorio.divergencias.length === 0,
      JSON.stringify({ keys: Object.keys(resp.readback), d: relatorio.divergencias }));
  }

  console.log(`\n  Total: ${ok + falhas}  |  ✅ ${ok}  |  ❌ ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO no teste E2E:', e); process.exit(1); });
