import { db } from "./firebase-config.js";
import { ref, onValue, update, set, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

console.log("⚡ [JARVIS SYSTEM] Sentinel Monitor // Versão Final Estabilizada.");

// -------------------------------------------------------------
// 1. ELEMENTOS DOM
// -------------------------------------------------------------
const displayStatus = document.getElementById('display-status');
const alertBanner = document.getElementById('alert-banner');
const alertBannerText = document.getElementById('alert-banner-text');
const radarBlip = document.getElementById('radar-blip');
const historyLogs = document.getElementById('history-logs');
const rangeSensitivity = document.getElementById('range-sensitivity');
const sensitivityVal = document.getElementById('sensitivity-val');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnToggleMode = document.getElementById('btn-toggle-mode');
const modeLabel = document.getElementById('mode-label');

const kpiAvgDist = document.getElementById('kpi-avg-dist');
const kpiMinDist = document.getElementById('kpi-min-dist');
const kpiMinuteAlerts = document.getElementById('kpi-minute-alerts');
const kpiTimer = document.getElementById('kpi-timer');
const reportOutput = document.getElementById('report-output');

// Referências Firebase
const atuadoresRef = ref(db, 'dispositivos/esp32_01/atuadores');
const sensoresRef = ref(db, 'dispositivos/esp32_01/sensores');
const historicoRef = ref(db, 'dispositivos/esp32_01/historico');
const configRef = ref(db, 'dispositivos/esp32_01/configuracao');
const relatoriosRef = ref(db, 'dispositivos/esp32_01/relatorios');

// Variáveis de Estado
let modoApresentacao = false;
let limiteSensibilidadeAtual = 35;
let travaCliqueBotao = false;

let leiturasDistancia = [];
let contagemSeguro = 0;
let contagemInvasao = 0;
let disparosNoUltimoMinuto = 0;
let tempoRestanteRelatorio = 60;

// -------------------------------------------------------------
// 2. GERENCIADOR DE ABAS
// -------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId)?.classList.add('active');
  });
});

// -------------------------------------------------------------
// 3. GRÁFICOS (CHART.JS)
// -------------------------------------------------------------
const ctxLine = document.getElementById('distanceChart')?.getContext('2d');
let distanceChart = null;

if (ctxLine) {
  distanceChart = new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Distância Medida (cm)',
          data: [],
          borderColor: '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Limite Sensibilidade (cm)',
          data: [],
          borderColor: '#ff003c',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 200, grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#00ff66' } },
        x: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#4a7c59' } }
      },
      plugins: { legend: { labels: { color: '#e0ffe8' } } }
    }
  });
}

const ctxPie = document.getElementById('stateRatioChart')?.getContext('2d');
let stateRatioChart = null;

if (ctxPie) {
  stateRatioChart = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: ['Tempo Seguro', 'Tempo em Alerta'],
      datasets: [{
        data: [1, 0],
        backgroundColor: ['#00ff66', '#ff003c'],
        borderColor: '#030705',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#e0ffe8' } } }
    }
  });
}

function atualizarGraficosEMetricas(distancia) {
  const agora = new Date().toLocaleTimeString();
  
  leiturasDistancia.push(distancia);
  if (leiturasDistancia.length > 20) leiturasDistancia.shift();

  if (distanceChart) {
    if (distanceChart.data.labels.length >= 20) {
      distanceChart.data.labels.shift();
      distanceChart.data.datasets[0].data.shift();
      distanceChart.data.datasets[1].data.shift();
    }
    distanceChart.data.labels.push(agora);
    distanceChart.data.datasets[0].data.push(distancia);
    distanceChart.data.datasets[1].data.push(limiteSensibilidadeAtual);

    if (distancia <= limiteSensibilidadeAtual) {
      distanceChart.data.datasets[0].borderColor = '#ff003c';
      distanceChart.data.datasets[0].backgroundColor = 'rgba(255, 0, 60, 0.2)';
    } else {
      distanceChart.data.datasets[0].borderColor = '#00ff66';
      distanceChart.data.datasets[0].backgroundColor = 'rgba(0, 255, 102, 0.1)';
    }
    distanceChart.update();
  }

  if (distancia <= limiteSensibilidadeAtual) contagemInvasao++;
  else contagemSeguro++;

  if (stateRatioChart) {
    stateRatioChart.data.datasets[0].data = [contagemSeguro, contagemInvasao];
    stateRatioChart.update();
  }

  const soma = leiturasDistancia.reduce((a, b) => a + b, 0);
  const media = (soma / leiturasDistancia.length).toFixed(1);
  const minima = Math.min(...leiturasDistancia).toFixed(1);

  if (kpiAvgDist) kpiAvgDist.innerText = `${media} cm`;
  if (kpiMinDist) kpiMinDist.innerText = `${minima} cm`;
  if (kpiMinuteAlerts) kpiMinuteAlerts.innerText = disparosNoUltimoMinuto;
}

// -------------------------------------------------------------
// 4. LISTENERS EM TEMPO REAL (FIREBASE)
// -------------------------------------------------------------
onValue(configRef, (snapshot) => {
  const config = snapshot.val();
  if (config && config.limite_cm !== undefined) {
    limiteSensibilidadeAtual = Number(config.limite_cm);
    if (rangeSensitivity) rangeSensitivity.value = limiteSensibilidadeAtual;
    if (sensitivityVal) sensitivityVal.innerText = `${limiteSensibilidadeAtual} cm`;
  }
});

onValue(sensoresRef, (snapshot) => {
  const sensores = snapshot.val() || {};
  const distancia = sensores.distancia_cm !== undefined ? Number(sensores.distancia_cm) : 150;
  const presenca = sensores.presenca || false;

  const violacaoDistancia = distancia > 0 && distancia <= limiteSensibilidadeAtual;
  const emAlerta = presenca || violacaoDistancia;

  atualizarVisualInterface(emAlerta);
  atualizarGraficosEMetricas(distancia);
});

onValue(historicoRef, (snapshot) => {
  const logsData = snapshot.val();
  if (!historyLogs) return;

  if (!logsData) {
    historyLogs.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">Nenhum registro no banco de dados.</td></tr>`;
    return;
  }

  const logsArray = Object.keys(logsData).map(key => ({
    key: key,
    ...logsData[key]
  })).sort((a, b) => b.timestamp - a.timestamp);

  historyLogs.innerHTML = logsArray.slice(0, 10).map(log => `
    <tr>
      <td>${log.data_hora || "N/A"}</td>
      <td>${log.ocorrencia || "Detecção"}</td>
      <td style="color: ${log.evento === 'DISPARADO' ? '#ff003c' : '#00ff66'}">${log.evento || "INFO"}</td>
      <td>${log.acao || "N/A"}</td>
      <td>
        <button class="btn-delete-row" data-key="${log.key}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = e.currentTarget.getAttribute('data-key');
      remove(ref(db, `dispositivos/esp32_01/historico/${key}`));
    };
  });
});

// -------------------------------------------------------------
// 5. RELATÓRIO DE 1 MINUTO E PERSISTÊNCIA NO FIREBASE
// -------------------------------------------------------------
setInterval(() => {
  tempoRestanteRelatorio--;
  if (kpiTimer) kpiTimer.innerText = `${tempoRestanteRelatorio}s`;

  if (tempoRestanteRelatorio <= 0) {
    gerarERegistrarRelatorioMinutado();
    tempoRestanteRelatorio = 60;
  }
}, 1000);

function gerarERegistrarRelatorioMinutado() {
  const agora = new Date();
  const horarioFormatado = agora.toLocaleTimeString();
  const totalLeituras = leiturasDistancia.length || 1;
  const soma = leiturasDistancia.reduce((a, b) => a + b, 0);
  const media = Number((soma / totalLeituras).toFixed(1));
  const menorDist = Number(Math.min(...leiturasDistancia).toFixed(1));

  const statusTexto = disparosNoUltimoMinuto > 0 
    ? `CRÍTICO (${disparosNoUltimoMinuto} INCIDENTE(S))` 
    : "ESTÁVEL / SEM ANOMALIAS";

  const novoRelatorio = {
    timestamp: Date.now(),
    data_hora: horarioFormatado,
    media_distancia_cm: media,
    menor_distancia_cm: menorDist,
    total_disparos_minuto: disparosNoUltimoMinuto,
    limite_sensibilidade_cm: limiteSensibilidadeAtual,
    status_perimetro: statusTexto
  };

  // Salva no nó /relatorios
  push(relatoriosRef, novoRelatorio);

  if (reportOutput) {
    reportOutput.innerHTML = `
      📌 <strong>RELATÓRIO EMITIDO ÀS ${horarioFormatado} (SALVO NO FIREBASE)</strong><br>
      • Status do Perímetro: <strong>${statusTexto}</strong><br>
      • Média de Proximidade: <strong>${media} cm</strong> (Sensibilidade: <strong>${limiteSensibilidadeAtual} cm</strong>)<br>
      • Maior Proximidade Registrada: <strong>${menorDist} cm</strong><br>
      • Total de Disparos no Período (60s): <strong>${disparosNoUltimoMinuto}</strong>
    `;
  }

  disparosNoUltimoMinuto = 0;
  if (kpiMinuteAlerts) kpiMinuteAlerts.innerText = 0;
}

// -------------------------------------------------------------
// 6. FUNÇÕES E BOTÕES DA INTERFACE
// -------------------------------------------------------------
function atualizarVisualInterface(emAlerta) {
  if (emAlerta) {
    if (displayStatus) { displayStatus.innerText = "INVASÃO DETECTADA!"; displayStatus.className = "value state-alert"; }
    if (alertBanner) { alertBanner.className = "alert-banner banner-alert"; if (alertBannerText) alertBannerText.innerText = "⚠️ PERÍMETRO VIOLADO // ALERTA MÁXIMO"; }
    if (radarBlip) { radarBlip.style.opacity = '1'; radarBlip.style.top = '35%'; radarBlip.style.left = '55%'; }
  } else {
    if (displayStatus) { displayStatus.innerText = "PERÍMETRO SEGURO"; displayStatus.className = "value state-safe"; }
    if (alertBanner) { alertBanner.className = "alert-banner banner-safe"; if (alertBannerText) alertBannerText.innerText = "MONITORANDO // SEM AMEAÇAS"; }
    if (radarBlip) radarBlip.style.opacity = '0';
  }
}

function executarAcaoComLog(ocorrencia, evento, acao, dadosAtuadores) {
  if (travaCliqueBotao) return;
  travaCliqueBotao = true;

  const agora = new Date();
  const novoLog = {
    timestamp: Date.now(),
    data_hora: agora.toLocaleTimeString(),
    ocorrencia: ocorrencia,
    evento: evento,
    acao: acao
  };

  if (evento === "DISPARADO") disparosNoUltimoMinuto++;

  push(historicoRef, novoLog);
  update(ref(db, 'dispositivos/esp32_01'), dadosAtuadores);

  setTimeout(() => { travaCliqueBotao = false; }, 1500);
}

btnToggleMode?.addEventListener('click', () => {
  modoApresentacao = !modoApresentacao;
  if (modoApresentacao) {
    btnToggleMode.className = "btn-mode mode-demo";
    btnToggleMode.innerHTML = `<i class="fa-solid fa-toggle-off"></i> VOLTAR PARA REAL (ESP32)`;
    if (modeLabel) modeLabel.innerHTML = `MODO: <strong style="color: #ff003c;">APRESENTAÇÃO (SIMULADOR)</strong>`;
  } else {
    btnToggleMode.className = "btn-mode mode-real";
    btnToggleMode.innerHTML = `<i class="fa-solid fa-toggle-on"></i> ALTERAR PARA APRESENTAÇÃO`;
    if (modeLabel) modeLabel.innerHTML = `MODO: <strong style="color: #00ff66;">REAL (ESP32)</strong>`;
  }
});

document.getElementById('btn-arm')?.addEventListener('click', () => {
  executarAcaoComLog("Alarme Armado", "ARMADO", "Sistema Ativado", {
    "atuadores/alarme_armado": true,
    "atuadores/buzzer": false,
    "atuadores/led_rgb": "verde",
    "sensores/presenca": false,
    "sensores/distancia_cm": 150
  });
});

document.getElementById('btn-disarm')?.addEventListener('click', () => {
  executarAcaoComLog("Alarme Desarmado", "DESARMADO", "Sistema Desativado", {
    "atuadores/alarme_armado": false,
    "atuadores/buzzer": false,
    "atuadores/led_rgb": "verde",
    "sensores/presenca": false,
    "sensores/distancia_cm": 150
  });
});

document.getElementById('btn-simulate')?.addEventListener('click', () => {
  const distSimulada = Math.max(2, limiteSensibilidadeAtual - 5);
  executarAcaoComLog("Simulação de Invasão", "DISPARADO", "Buzzer + Alerta Ativado", {
    "atuadores/alarme_armado": true,
    "atuadores/buzzer": true,
    "atuadores/led_rgb": "vermelho",
    "sensores/distancia_cm": distSimulada,
    "sensores/presenca": true,
    "sensores/ultima_atualizacao": Date.now()
  });
});

if (rangeSensitivity) {
  rangeSensitivity.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if (sensitivityVal) sensitivityVal.innerText = `${val} cm`;
    set(configRef, { limite_cm: val });
  });
}

if (btnClearHistory) {
  btnClearHistory.addEventListener('click', () => {
    if (confirm("Deseja apagar todo o histórico de invasões no Firebase?")) {
      remove(historicoRef);
    }
  });
}