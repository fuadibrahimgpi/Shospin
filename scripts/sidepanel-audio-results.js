/**
 * SIDEPANEL — Timer e exibição de resultados
 * Parte de sidepanel-audio.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-audio.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

// ============================================================================
// TIMER
// ============================================================================

function startTimer() {
  seconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => { seconds++; updateTimerDisplay(); }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateTimerDisplay() {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  timerText.textContent = `${mins}:${secs}`;
}

// ============================================================================
// EXIBIÇÃO DE RESULTADOS
// ============================================================================

function displayAudioResults(data) {
  statusText.textContent = 'Clique para nova gravação';
  statusText.style.color = '';
  statusText.style.fontWeight = 'normal';
  audioData = data;

  consultationType.classList.remove('hidden');
  const badge = consultationType.querySelector('.type-badge');

  if (data.tipo_consulta === 'primeira_consulta' || data.tipo_consulta === 'conclusao') {
    badge.textContent = data.tipo_consulta === 'conclusao' ? 'Conclusão da Consulta' : 'Primeira Consulta';
    badge.className = data.tipo_consulta === 'conclusao' ? 'type-badge primeira conclusao' : 'type-badge primeira';

    primeiraConsultaFields.classList.remove('hidden');
    retornoFields.classList.add('hidden');

    hdaField.value = data.dados?.hda || '';
    medicacoesField.value = data.dados?.medicacoes_em_uso || '';
    antecedentesOftField.value = data.dados?.antecedentes_oftalmologicos || '';
    doencasSistemicasField.value = data.dados?.alteracoes_sistemicas || data.dados?.doencas_sistemicas || '';
    antecedentesFamField.value = data.dados?.antecedentes_familiares || '';
    diagnosticoField.value = data.dados?.diagnostico || '';
    condutaField.value = data.dados?.conduta || '';
    medicamentosPrescritosField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || (data.dilatacaoDetectada ? '' : 'Sem prescrição de medicação');
  } else {
    badge.textContent = 'Retorno';
    badge.className = 'type-badge retorno';
    primeiraConsultaFields.classList.add('hidden');
    retornoFields.classList.remove('hidden');

    retornoField.value = data.dados?.retorno || data.dados?.hda || '';
    medicacoesRetornoField.value = data.dados?.uso || data.dados?.medicacoes_em_uso || '';
    diagnosticoRetornoField.value = data.dados?.diagnostico || '';
    condutaRetornoField.value = data.dados?.conduta || '';
    medicamentosPrescritosRetornoField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || (data.dilatacaoDetectada ? '' : 'Sem prescrição de medicação');
  }

  audioFieldsContainer.classList.remove('hidden');
  updateDataSummary();
}
