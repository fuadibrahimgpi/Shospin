/**
 * AGENTE DE MEDICAMENTOS (conduta → campo `tratamento`)
 * ============================================================================
 *
 * ESTADO: MODO SOMBRA (2026-11-11). Carregado pelo painel, mas NÃO escreve no
 * prontuário: o DecisionEngine (_sombraItensMedicamentos) valida os itens de
 * `medicacoes_itens` que o modelo devolve e COMPARA com o `tratamento` que os
 * guards produziram; a diferença sai só no log ([sombra:itens] e [Med]). A
 * decisão de deixar este agente escrever o campo depende dessa medição em
 * consultas reais. Em produção, quem escreve medicamentos continua sendo o texto
 * do modelo + o léxico (config/medicamentos-lexico.js) + os guards 2–2g.
 *
 * Para ligar de verdade (passo seguinte, só depois de medir): trocar o `tratamento`
 * pelo texto de formatar() onde os itens concordam, mantendo os guards como rede.
 *
 * O arquivo roda dentro de uma função: os scripts do painel dividem um escopo só,
 * e um nome de topo repetido entre arquivos derrubou o recheck por meses (ver
 * [ESCOPO-1]). Daqui sai apenas `MedicamentosAgent`.
 *
 * Item que o modelo devolve (em `medicacoes_itens`, FORA de `dados`):
 *   { nome, nivel, status, posologia, olho, duracao, evidencia }
 *   nivel  : 'principio' | 'protocolo' | 'classe' | 'generico'  (HIERARQUIA DE NOMEAÇÃO)
 *   status : 'novo' | 'mantido' | 'suspenso'
 *   evidencia : trecho LITERAL e CURTO da fala que sustenta O NOME (não a posologia)
 *
 * validar() aplica, nesta ordem:
 *   1. contrato — evidência literal na fala (senão o item cai);
 *   2. léxico   — remédio achado na evidência vira princípio ativo do léxico,
 *                 mesmo que o modelo tenha escrito outra coisa ("trometolou" →
 *                 Cetorolaco, não "Colírio antibiótico");
 *   3. nível    — princípio sem sustentação na evidência é rebaixado a genérico;
 *                 classe só vale com a CLASSE dita; protocolo exige colírio dito.
 *
 * conferirComTratamento() compara, POR NOME (não por texto), os itens aceitos com
 * as linhas de medicação do `tratamento`: item sem linha, linha sem item, e o mesmo
 * remédio com nome diferente.
 */
'use strict';

(function (root) {
  const _ContratoMed = (typeof module !== 'undefined' && module.exports)
    ? require('./agent-contract.js') : root.AgentContract;
  const _Lexico = (typeof module !== 'undefined' && module.exports)
    ? require('../../config/medicamentos-lexico.js') : root.MedicamentosLexico;

  const GENERICO = 'Medicação ocular prescrita';

  // Gatilho amplo de roteamento: qualquer menção a remédio ou ao ato de prescrever.
  const _GATILHO_RE = /\b(?:colirio|colirios|pomada|pomadas|gota|gotas|gotinha|gotinhas|remedio|remedios|medicacao|medicamento|comprimido|comprimidos|capsula|capsulas|lubrificante|lubrificantes|vidro|frasco|pingar|instilar|prescrev\w*|receita(?:r|ndo)? (?:de )?(?:colirio|remedio))\b/;

  // Para cada classe, o que a FALA precisa dizer para a classe ser afirmada (nível 2).
  // `rotulo` reconhece a classe no nome que o modelo escreveu; as palavras da fala vêm
  // do léxico (PALAVRAS_DE_CLASSE), a mesma tabela que os guards do DecisionEngine usam.
  const _CLASSE_NA_FALA = [
    { rotulo: /antibiotic/i,         classe: 'antibiotico' },
    { rotulo: /hipotensor|pressao/i, classe: 'hipotensor' },
    { rotulo: /antial[eé]rgic/i,     classe: 'antialergico' },
    { rotulo: /corticoid/i,          classe: 'corticoide' },
    { rotulo: /anti-?inflamat/i,     classe: 'aine' },
    { rotulo: /lubrificante/i,       classe: 'lubrificante' },
  ].map(r => ({ rotulo: r.rotulo, fala: new RegExp(_Lexico.PALAVRAS_DE_CLASSE[r.classe]) }));

  const _PROTOCOLO_EXIGE_RE = /colirio|pingar|gota|instilar/;

  function detectar(transcricao) {
    const t = _Lexico.normalizarLexico(transcricao);
    if (_GATILHO_RE.test(t)) return true;
    return _Lexico.encontrarMedicamentos(t).length > 0;
  }

  function _rebaixar(item, motivo, avisos) {
    avisos.push(`"${item.nome}" → "${GENERICO}": ${motivo}`);
    return { ...item, nome: GENERICO, nivel: 'generico' };
  }

  function validar(itens, transcricao) {
    const { aceitos: comEvidencia, descartados } = _ContratoMed.verificarEvidencia(itens, transcricao);
    const avisos = [];
    const aceitos = [];

    for (const original of comEvidencia) {
      let item = { ...original };
      const evNorm = _Lexico.normalizarLexico(item.evidencia);
      const achados = _Lexico.encontrarMedicamentos(item.evidencia);

      if (item.status === 'suspenso') { aceitos.push(item); continue; }

      if (achados.length === 1 && item.nivel !== 'protocolo') {
        // O léxico manda: o nome vem do que foi DITO, não do que o modelo escreveu.
        // Princípio ativo primeiro; a marca, se foi dita, vai entre parênteses.
        const nomeLexico = _Lexico.nomeRegistrado(achados[0]);
        if (item.nome !== nomeLexico) {
          avisos.push(`"${item.nome}" → "${nomeLexico}": nome resolvido pelo léxico (${achados[0].termo})`);
        }
        item.nome = nomeLexico;
        item.nivel = achados[0].principio === 'Lubrificante ocular' ? 'classe' : 'principio';
      } else if (item.nivel === 'principio') {
        const primeira = _Lexico.normalizarLexico(item.nome).split(/[ +]/)[0];
        if (!primeira || !evNorm.includes(primeira)) {
          item = _rebaixar(item, 'princípio não está na evidência', avisos);
        }
      } else if (item.nivel === 'classe') {
        const regra = _CLASSE_NA_FALA.find(r => r.rotulo.test(_Lexico.normalizarLexico(item.nome)));
        if (!regra || !regra.fala.test(evNorm)) {
          item = _rebaixar(item, 'a fala não diz essa classe', avisos);
        }
      } else if (item.nivel === 'protocolo') {
        if (!_PROTOCOLO_EXIGE_RE.test(evNorm)) {
          descartados.push({ item: original, motivo: 'protocolo sem colírio dito (anúncio vago não cria prescrição)' });
          continue;
        }
      }
      aceitos.push(item);
    }
    return { aceitos, descartados, avisos };
  }

  function _linha(item) {
    return [item.nome, item.posologia, item.duracao, item.olho]
      .map(p => (p == null ? '' : String(p).trim()))
      .filter(Boolean)
      .join(' ');
  }

  /** Itens novos e mantidos viram linhas de tratamento; suspensos saem à parte. */
  function formatar(aceitos) {
    const ativos = aceitos.filter(i => i.status !== 'suspenso');
    const suspensos = aceitos.filter(i => i.status === 'suspenso').map(i => i.nome);
    return {
      tratamento: ativos.length ? ativos.map(_linha).join('\n') : null,
      suspensos,
    };
  }

  // ── Comparação com o `tratamento` (modo sombra) ───────────────────────────
  // Linha de MEDICAÇÃO: abre com colírio/pomada/gel, é o genérico, ou cita um remédio do léxico.
  // Compressa, higiene palpebral, shampoo e ômega 3 não são medicação ocular: ficam de fora
  // dos dois lados da comparação (senão toda consulta de blefarite divergiria).
  const _LINHA_MED_RE = /^\s*(?:[-•*]\s*)?(?:colirio|pomada|gel|unguento|medicacao ocular prescrita|associacao)\b/;

  function _ehLinhaDeMedicacao(linha) {
    return _LINHA_MED_RE.test(_Lexico.normalizarLexico(linha)) || _Lexico.encontrarMedicamentos(linha).length > 0;
  }

  // Nome sem "(Marca)" e sem acento: a chave com que item e linha se reconhecem.
  function _chave(nome) {
    return _Lexico.normalizarLexico(String(nome == null ? '' : nome).replace(/\([^)]*\)/g, ' '));
  }

  function _idsDoLexico(texto) {
    return new Set(_Lexico.encontrarMedicamentos(String(texto || '')).map(a => a.id));
  }

  /**
   * @param {object[]} aceitos  itens já validados (sem os suspensos)
   * @param {string|null} tratamento  o `tratamento` final, depois dos guards
   * @returns {{concordam: boolean, itens: number, linhas: number,
   *            itemSemLinha: string[], linhaSemItem: string[],
   *            nomeDiferente: Array<{item: string, linha: string}>}}
   */
  function conferirComTratamento(aceitos, tratamento) {
    const itens = (Array.isArray(aceitos) ? aceitos : []).filter(i => i && i.status !== 'suspenso');
    const linhas = String(tratamento || '').split('\n').map(l => l.trim()).filter(l => l && _ehLinhaDeMedicacao(l));
    const usadas = new Set();
    const semLinha = [];

    // O nome do item tem que ABRIR a linha: "Timolol" não é "Brimonidina + timolol (Combigan)"
    // — achar o nome em qualquer ponto da linha escondia justamente o erro do Combigan.
    const abreALinha = (linha, chave) => {
      const l = _Lexico.normalizarLexico(linha).replace(/^[-•*]\s*/, '');
      return l.startsWith(chave) && !/[a-z]/.test(l.charAt(chave.length) || ' ');
    };
    for (const item of itens) {
      const chave = _chave(item.nome);
      const i = chave ? linhas.findIndex((l, k) => !usadas.has(k) && abreALinha(l, chave)) : -1;
      if (i >= 0) usadas.add(i); else semLinha.push(item);
    }

    // Item e linha que sobraram e citam o MESMO remédio do léxico: é nome diferente, não falta.
    const nomeDiferente = [];
    const itemSemLinha = [];
    for (const item of semLinha) {
      const ids = _idsDoLexico(item.nome);
      const k = linhas.findIndex((l, j) => {
        if (usadas.has(j) || !ids.size) return false;
        return [..._idsDoLexico(l)].some(id => ids.has(id));
      });
      if (k >= 0) { usadas.add(k); nomeDiferente.push({ item: String(item.nome), linha: linhas[k] }); }
      else itemSemLinha.push(String(item.nome));
    }
    const linhaSemItem = linhas.filter((_, k) => !usadas.has(k));

    return {
      concordam: !itemSemLinha.length && !linhaSemItem.length && !nomeDiferente.length,
      itens: itens.length,
      linhas: linhas.length,
      itemSemLinha,
      linhaSemItem,
      nomeDiferente,
    };
  }

  const MedicamentosAgent = {
    nome: 'medicamentos',
    campo: 'tratamento',
    GENERICO,
    detectar,
    validar,
    formatar,
    conferirComTratamento,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MedicamentosAgent;
  }
  root.MedicamentosAgent = MedicamentosAgent;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
