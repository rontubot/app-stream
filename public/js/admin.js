// admin.js - Manejo Integral con Persistencia Total (Server + LocalStorage + Backup/Restore)
const socket = io();

// Elementos DOM de Conexión
const socketDot = document.getElementById('socket-dot');
const socketDotMobile = document.getElementById('socket-dot-mobile');
const socketStatus = document.getElementById('socket-status');
const dbDot = document.getElementById('db-dot');
const dbStatusText = document.getElementById('db-status-text');

async function checkDbStatus() {
  try {
    const res = await fetch('/api/db-status');
    const data = await res.json();
    if (data && data.isPostgresConnected) {
      if (dbDot) {
        dbDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green shadow-[0_0_8px_#00ff66]';
      }
      if (dbStatusText) {
        dbStatusText.textContent = 'PostgreSQL Conectado';
        dbStatusText.className = 'text-cyber-green font-bold';
      }
    } else {
      if (dbDot) {
        dbDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      }
      if (dbStatusText) {
        dbStatusText.textContent = (data && data.hasDatabaseUrl) ? 'SQL: Error Conexión' : 'Almacenamiento Local';
        dbStatusText.className = 'text-amber-400 font-medium';
      }
    }
  } catch (e) {
    if (dbDot) dbDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
    if (dbStatusText) dbStatusText.textContent = 'SQL: Verificando...';
  }
}
checkDbStatus();
setInterval(checkDbStatus, 15000);

// Elementos DOM de Ajustes y Acciones Maestras
const scalePills = document.getElementById('scale-pills');
const autohidePills = document.getElementById('autohide-pills');
const btnLaunchBothPrepared = document.getElementById('btn-launch-both-prepared');
const btnHideBoth = document.getElementById('btn-hide-both');

// Escenas de Pantalla Completa DOM
const sceneActiveIndicator = document.getElementById('scene-active-indicator');
const sceneActiveDot = document.getElementById('scene-active-dot');
const sceneActiveText = document.getElementById('scene-active-text');
const btnSceneStarting = document.getElementById('btn-scene-starting');
const btnSceneBrb = document.getElementById('btn-scene-brb');
const btnSceneEnded = document.getElementById('btn-scene-ended');
const btnHideScene = document.getElementById('btn-hide-scene');

// Overlay Superior Dinámico (HUD BirraVerde) DOM
const topHudStatusBadge = document.getElementById('top-hud-status-badge');
const btnToggleTopHud = document.getElementById('btn-toggle-top-hud');
const iconTopHudToggle = document.getElementById('icon-top-hud-toggle');
const textTopHudToggle = document.getElementById('text-top-hud-toggle');
const inputTopHudText = document.getElementById('input-top-hud-text');
const btnSaveTopHudText = document.getElementById('btn-save-top-hud-text');
const btnTestFollow = document.getElementById('btn-test-follow');
const btnTestDonation = document.getElementById('btn-test-donation');
const btnTestComment = document.getElementById('btn-test-comment');

// Overlay Inferior de Chat Destacado y TTS DOM
const inputChatPrefix = document.getElementById('input-chat-prefix');
const btnToggleTts = document.getElementById('btn-toggle-tts');
const iconTtsToggle = document.getElementById('icon-tts-toggle');
const textTtsToggle = document.getElementById('text-tts-toggle');
const inputAnnouncementUser = document.getElementById('input-announcement-user');
const inputAnnouncementText = document.getElementById('input-announcement-text');
const btnSendAnnouncement = document.getElementById('btn-send-announcement');
const btnHideAnnouncement = document.getElementById('btn-hide-announcement');

// Navbar y Navegación de Pestañas
const navTabMain = document.getElementById('nav-tab-main');
const navTabMulticam = document.getElementById('nav-tab-multicam');
const navTabAnimations = document.getElementById('nav-tab-animations');
const navTabConfig = document.getElementById('nav-tab-config');
const navBadgeVs = document.getElementById('nav-badge-vs');
const navBadgeMulticamCount = document.getElementById('nav-badge-multicam-count');
const tabPanelMain = document.getElementById('tab-panel-main');
const tabPanelMulticam = document.getElementById('tab-panel-multicam');
const tabPanelAnimations = document.getElementById('tab-panel-animations');
const tabPanelConfig = document.getElementById('tab-panel-config');

// Elementos DOM del Sistema Multicam
const multicamGuestLink = document.getElementById('multicam-guest-link');
const btnCopyGuestLink = document.getElementById('btn-copy-guest-link');
const multicamObsLink = document.getElementById('multicam-obs-link');
const btnCopyMulticamObs = document.getElementById('btn-copy-multicam-obs');
const currentSceneLabel = document.getElementById('current-scene-label');
const multicamAdminPeersList = document.getElementById('multicam-admin-peers-list');
const multicamPeersEmpty = document.getElementById('multicam-peers-empty');
const multicamPeersBadge = document.getElementById('multicam-peers-badge');
const multicamOnlineCount = document.getElementById('multicam-online-count');
const btnReloadMulticamPreview = document.getElementById('btn-reload-multicam-preview');
const multicamPreviewIframe = document.getElementById('multicam-preview-iframe');

// Banco de Animaciones: VS Boxeo (La Velada del Caos) DOM
const cardSceneVelada = document.getElementById('card-scene-velada');
const btnToggleVeladaPanel = document.getElementById('btn-toggle-velada-panel');
const textToggleVeladaPanel = document.getElementById('text-toggle-velada-panel');
const iconToggleVeladaPanel = document.getElementById('icon-toggle-velada-panel');
const btnCollapseVeladaPanel = document.getElementById('btn-collapse-velada-panel');
const sceneModuleVelada = document.getElementById('scene-module-velada');
const badgeVeladaStatus = document.getElementById('badge-velada-status');
const labelFightsCount = document.getElementById('label-fights-count');
const vsActiveIndicator = document.getElementById('vs-active-indicator');
const vsActiveDot = document.getElementById('vs-active-dot');
const vsActiveText = document.getElementById('vs-active-text');
const selectFightActive = document.getElementById('select-fight-active');
const btnLaunchVs = document.getElementById('btn-launch-vs');
const btnHideVs = document.getElementById('btn-hide-vs');
const btnOpenCreateFight = document.getElementById('btn-open-create-fight');
const btnOpenEditFight = document.getElementById('btn-open-edit-fight');
const fightPreviewStrip = document.getElementById('fight-preview-strip');

// Banco de Animaciones: Escena Multicam en Vivo DOM
const cardSceneMulticam = document.getElementById('card-scene-multicam');
const btnToggleMulticamPanel = document.getElementById('btn-toggle-multicam-panel');
const textToggleMulticamPanel = document.getElementById('text-toggle-multicam-panel');
const iconToggleMulticamPanel = document.getElementById('icon-toggle-multicam-panel');
const btnCollapseMulticamPanel = document.getElementById('btn-collapse-multicam-panel');
const sceneModuleMulticam = document.getElementById('scene-module-multicam');
const badgeMulticamStatus = document.getElementById('badge-multicam-status');
const labelMulticamActiveCount = document.getElementById('label-multicam-active-count');
const multicamActiveIndicator = document.getElementById('multicam-active-indicator');
const multicamActiveDot = document.getElementById('multicam-active-dot');
const multicamActiveText = document.getElementById('multicam-active-text');
const selectMulticamSceneQuick = document.getElementById('select-multicam-scene-quick');
const btnLaunchMulticamScene = document.getElementById('btn-launch-multicam-scene');
const btnHideMulticamScene = document.getElementById('btn-hide-multicam-scene');

// Modal de Combate Boxeo DOM
const fightModal = document.getElementById('fight-modal');
const fightModalTitle = document.getElementById('fight-modal-title');
const btnCloseFightModal = document.getElementById('btn-close-fight-modal');
const btnCancelFightModal = document.getElementById('btn-cancel-fight-modal');
const fightForm = document.getElementById('fight-form');
const fightFormId = document.getElementById('fight-form-id');
const fightFormTitle = document.getElementById('fight-form-title');
const fightFormCategory = document.getElementById('fight-form-category');
const fightFormRounds = document.getElementById('fight-form-rounds');

// Peleador 1 Form DOM
const fightF1Corner = document.getElementById('fight-f1-corner');
const fightF1Name = document.getElementById('fight-f1-name');
const fightF1Nick = document.getElementById('fight-f1-nick');
const fightF1Wins = document.getElementById('fight-f1-wins');
const fightF1Draws = document.getElementById('fight-f1-draws');
const fightF1Losses = document.getElementById('fight-f1-losses');
const fightF1Weight = document.getElementById('fight-f1-weight');
const fightF1Height = document.getElementById('fight-f1-height');
const fightF1PreviewImg = document.getElementById('fight-f1-preview-img');
const fightF1File = document.getElementById('fight-f1-file');
const fightF1PhotoUrl = document.getElementById('fight-f1-photo-url');

// Peleador 2 Form DOM
const fightF2Corner = document.getElementById('fight-f2-corner');
const fightF2Name = document.getElementById('fight-f2-name');
const fightF2Nick = document.getElementById('fight-f2-nick');
const fightF2Wins = document.getElementById('fight-f2-wins');
const fightF2Draws = document.getElementById('fight-f2-draws');
const fightF2Losses = document.getElementById('fight-f2-losses');
const fightF2Weight = document.getElementById('fight-f2-weight');
const fightF2Height = document.getElementById('fight-f2-height');
const fightF2PreviewImg = document.getElementById('fight-f2-preview-img');
const fightF2File = document.getElementById('fight-f2-file');
const fightF2PhotoUrl = document.getElementById('fight-f2-photo-url');

const btnSaveFight = document.getElementById('btn-save-fight');
const btnSaveAndLaunchFight = document.getElementById('btn-save-and-launch-fight');

// Slot Izquierdo DOM
const badgeLeft = document.getElementById('badge-left');
const dotLeft = document.getElementById('dot-left');
const textLeft = document.getElementById('text-left');
const liveNameLeft = document.getElementById('live-name-left');
const liveNickLeft = document.getElementById('live-nick-left');
const btnHideLeft = document.getElementById('btn-hide-left');

const selectQueueLeft = document.getElementById('select-queue-left');
const queueNameLeft = document.getElementById('queue-name-left');
const queueNickLeft = document.getElementById('queue-nick-left');
const queueHandleLeft = document.getElementById('queue-handle-left');
const btnLaunchPreparedLeft = document.getElementById('btn-launch-prepared-left');

// Slot Derecho DOM
const badgeRight = document.getElementById('badge-right');
const dotRight = document.getElementById('dot-right');
const textRight = document.getElementById('text-right');
const liveNameRight = document.getElementById('live-name-right');
const liveNickRight = document.getElementById('live-nick-right');
const btnHideRight = document.getElementById('btn-hide-right');

const selectQueueRight = document.getElementById('select-queue-right');
const queueNameRight = document.getElementById('queue-name-right');
const queueNickRight = document.getElementById('queue-nick-right');
const queueHandleRight = document.getElementById('queue-handle-right');
const btnLaunchPreparedRight = document.getElementById('btn-launch-prepared-right');

// Monitor Preview & Control de Visibilidad
const previewContainer = document.getElementById('preview-container');
const previewIframe = document.getElementById('preview-iframe');
const btnRefreshPreview = document.getElementById('btn-refresh-preview');
const btnCopyObs = document.getElementById('btn-copy-obs');
const colMonitor = document.getElementById('col-monitor');
const colSlotLeft = document.getElementById('col-slot-left');
const colSlotRight = document.getElementById('col-slot-right');
const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
const btnHideMonitorCard = document.getElementById('btn-hide-monitor-card');
const textToggleMonitor = document.getElementById('text-toggle-monitor');
const iconToggleMonitor = document.getElementById('icon-toggle-monitor');

// Deck de Presentadores y Modales
const presentersGrid = document.getElementById('presenters-grid');
const btnOpenCreateModal = document.getElementById('btn-open-create-modal');
const presenterModal = document.getElementById('presenter-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const presenterForm = document.getElementById('presenter-form');
const modalTitle = document.getElementById('modal-title');

// Formulario
const formId = document.getElementById('form-id');
const formName = document.getElementById('form-name');
const formNick = document.getElementById('form-nick');
const formHandle = document.getElementById('form-handle');
const formRole = document.getElementById('form-role');
const formAccentColor = document.getElementById('form-accent-color');
const formDefaultSide = document.getElementById('form-default-side');

// Modal OBS
const obsModal = document.getElementById('obs-modal');
const btnCloseObsModal = document.getElementById('btn-close-obs-modal');
const obsUrlInput = document.getElementById('obs-url-input');
const btnCopyUrlInside = document.getElementById('btn-copy-url-inside');

// Backup & Restore
const btnExportBackup = document.getElementById('btn-export-backup');
const inputImportBackup = document.getElementById('input-import-backup');
const toastContainer = document.getElementById('toast-container');

// Claves de LocalStorage
const LS_PRESENTERS_KEY = 'birraverde_stream_presenters_v1';
const LS_SETTINGS_KEY = 'birraverde_stream_settings_v1';
const LS_MONITOR_VISIBLE_KEY = 'birraverde_stream_monitor_visible_v1';
const LS_FIGHTS_KEY = 'velada_caos_fights_v1';

// Estado local reactivo
let presentersList = [];
let fightsList = [];
let selectedFightId = null;
let currentLiveState = {
  left: { isVisible: false, presenter: null },
  right: { isVisible: false, presenter: null },
  queue: { left: null, right: null },
  scale: 65,
  defaultAutoHide: 5
};
let currentAutoHide = 5;

// ============================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ============================================================
function showToast(message, type = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  const bgClass = type === 'error' 
    ? 'bg-red-950/90 border-red-500 text-red-200' 
    : 'bg-black/90 border-cyber-green text-white shadow-[0_0_15px_rgba(0,255,102,0.3)]';

  toast.className = `pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${bgClass} text-xs font-chakra font-bold tracking-wide backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full ${type === 'error' ? 'bg-red-400' : 'bg-cyber-green animate-pulse'}"></span>
      <span>${message}</span>
    </div>
  `;

  toastContainer.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // Salida automática en 3.5 segundos
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  }, 3500);
}

// ============================================================
// CARGA INICIAL DESDE LOCALSTORAGE (Cero parpadeo al recargar)
// ============================================================
function loadFromLocalStorage() {
  try {
    const rawPres = localStorage.getItem(LS_PRESENTERS_KEY);
    if (rawPres) {
      const parsedPres = JSON.parse(rawPres);
      if (Array.isArray(parsedPres) && parsedPres.length > 0) {
        presentersList = parsedPres;
      }
    }

    const rawSettings = localStorage.getItem(LS_SETTINGS_KEY);
    if (rawSettings) {
      const parsedSettings = JSON.parse(rawSettings);
      if (typeof parsedSettings.scale === 'number') {
        currentLiveState.scale = parsedSettings.scale;
        updateScaleUI(parsedSettings.scale);
      }
      if (typeof parsedSettings.defaultAutoHide === 'number') {
        currentAutoHide = parsedSettings.defaultAutoHide;
        currentLiveState.defaultAutoHide = parsedSettings.defaultAutoHide;
        updateAutoHideUI(currentAutoHide);
      }
    }

    const rawMonitorVisible = localStorage.getItem(LS_MONITOR_VISIBLE_KEY);
    if (rawMonitorVisible === 'false') {
      setMonitorVisibility(false, false);
    }

    const rawFights = localStorage.getItem(LS_FIGHTS_KEY);
    if (rawFights) {
      try {
        const parsedFights = JSON.parse(rawFights);
        if (Array.isArray(parsedFights) && parsedFights.length > 0) {
          fightsList = parsedFights;
          if (!selectedFightId) selectedFightId = fightsList[0].id;
          renderFightsSelect();
          renderFightPreview();
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Error leyendo LocalStorage:', err);
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(LS_PRESENTERS_KEY, JSON.stringify(presentersList));
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify({
      scale: currentLiveState.scale,
      defaultAutoHide: currentAutoHide,
      queue: {
        leftId: currentLiveState.queue?.left?.id || null,
        rightId: currentLiveState.queue?.right?.id || null
      }
    }));
  } catch (err) {
    console.warn('Error guardando en LocalStorage:', err);
  }
}

// ============================================================
// RENDERIZADO Y CONTROL DE UI
// ============================================================
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function adjustPreviewScale() {
  if (!previewContainer || !previewContainer.parentElement) return;
  const parentWidth = previewContainer.parentElement.clientWidth;
  if (!parentWidth) return;
  const scale = parentWidth / 1920;
  previewContainer.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', adjustPreviewScale);
window.addEventListener('load', adjustPreviewScale);
setTimeout(adjustPreviewScale, 150);

function updateScaleUI(scale) {
  document.querySelectorAll('.scale-btn').forEach(b => {
    const match = parseInt(b.dataset.scale, 10) === scale;
    b.className = match
      ? 'scale-btn px-2.5 py-1 rounded text-[11px] font-bold bg-cyber-green text-black whitespace-nowrap transition-all'
      : 'scale-btn px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-white whitespace-nowrap transition-all';
  });
}

function updateAutoHideUI(seconds) {
  document.querySelectorAll('.autohide-btn').forEach(b => {
    const match = parseInt(b.dataset.sec, 10) === seconds;
    b.className = match
      ? 'autohide-btn px-2.5 py-1 rounded text-[11px] font-bold bg-cyber-green text-black whitespace-nowrap transition-all'
      : 'autohide-btn px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-white whitespace-nowrap transition-all';
  });
}

// Selector de Tamaño (Escala)
scalePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.scale-btn');
  if (!btn) return;
  const scale = parseInt(btn.dataset.scale, 10);
  currentLiveState.scale = scale;
  updateScaleUI(scale);
  saveToLocalStorage();
  socket.emit('set-scale', scale);
  showToast(`📐 Tamaño de overlay guardado: ${scale}%`);
});

// Selector de Auto-Ocultar
autohidePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.autohide-btn');
  if (!btn) return;
  currentAutoHide = parseInt(btn.dataset.sec, 10);
  currentLiveState.defaultAutoHide = currentAutoHide;
  updateAutoHideUI(currentAutoHide);
  saveToLocalStorage();
  socket.emit('set-autohide', currentAutoHide);
  showToast(currentAutoHide === 0 ? `⏱️ Ocultar configurado a: Modo Manual` : `⏱️ Auto-ocultar guardado en: ${currentAutoHide} segundos`);
});

// Presets de colores en modal
document.querySelectorAll('.preset-color').forEach(btn => {
  btn.addEventListener('click', () => {
    formAccentColor.value = btn.dataset.color;
  });
});

// ============================================================
// CONEXIÓN SOCKET Y EVENTOS DE SERVIDOR
// ============================================================
socket.on('connect', () => {
  if (socketDot) socketDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-pulse';
  if (socketDotMobile) socketDotMobile.className = 'w-2 h-2 rounded-full bg-cyber-green animate-pulse';
  if (socketStatus) {
    socketStatus.textContent = 'En Línea';
    socketStatus.className = 'text-cyber-green font-semibold';
  }
});

socket.on('disconnect', () => {
  if (socketDot) socketDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
  if (socketDotMobile) socketDotMobile.className = 'w-2 h-2 rounded-full bg-red-500';
  if (socketStatus) {
    socketStatus.textContent = 'Desconectado';
    socketStatus.className = 'text-red-400 font-semibold';
  }
});

// Actualización de estado en vivo recibida del servidor
socket.on('state-update', (state) => {
  if (!state) return;
  currentLiveState = state;

  // Escala
  if (typeof state.scale === 'number') {
    updateScaleUI(state.scale);
  }

  // Auto-Hide
  if (typeof state.defaultAutoHide === 'number') {
    currentAutoHide = state.defaultAutoHide;
    updateAutoHideUI(state.defaultAutoHide);
  }

  // Estado EN VIVO Slot Izquierdo
  if (state.left && state.left.isVisible && state.left.presenter) {
    badgeLeft.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/50 text-[11px] font-bold font-chakra uppercase shadow-[0_0_10px_rgba(0,255,102,0.3)]';
    dotLeft.className = 'w-2 h-2 rounded-full bg-cyber-green animate-ping';
    textLeft.textContent = 'EN PANTALLA';

    liveNameLeft.textContent = state.left.presenter.name || 'PRESENTER';
    liveNickLeft.textContent = state.left.presenter.nickname || '';
  } else {
    badgeLeft.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-[11px] font-bold font-chakra uppercase';
    dotLeft.className = 'w-2 h-2 rounded-full bg-gray-500';
    textLeft.textContent = 'OFF AIR';

    liveNameLeft.textContent = '(Ninguno en pantalla)';
    liveNickLeft.textContent = '';
  }

  // Estado EN VIVO Slot Derecho
  if (state.right && state.right.isVisible && state.right.presenter) {
    badgeRight.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/50 text-[11px] font-bold font-chakra uppercase shadow-[0_0_10px_rgba(145,70,255,0.3)]';
    dotRight.className = 'w-2 h-2 rounded-full bg-purple-400 animate-ping';
    textRight.textContent = 'EN PANTALLA';

    liveNameRight.textContent = state.right.presenter.name || 'PRESENTER';
    liveNickRight.textContent = state.right.presenter.nickname || '';
  } else {
    badgeRight.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-[11px] font-bold font-chakra uppercase';
    dotRight.className = 'w-2 h-2 rounded-full bg-gray-500';
    textRight.textContent = 'OFF AIR';

    liveNameRight.textContent = '(Ninguno en pantalla)';
    liveNickRight.textContent = '';
  }

  // Estado PREPARADO (QUEUE)
  if (state.queue) {
    if (state.queue.left) {
      queueNameLeft.textContent = state.queue.left.name || 'Sin nombre';
      queueNickLeft.textContent = state.queue.left.nickname || '';
      queueNickLeft.style.color = state.queue.left.accentColor || '#00ff66';
      queueHandleLeft.textContent = `${state.queue.left.handle || ''} • ${state.queue.left.role || 'HOST'}`;
      if (selectQueueLeft.value !== state.queue.left.id) {
        selectQueueLeft.value = state.queue.left.id;
      }
    } else {
      queueNameLeft.textContent = '(Sin preparar)';
      queueNickLeft.textContent = '';
      queueHandleLeft.textContent = 'Selecciona abajo o usa el menú';
    }

    if (state.queue.right) {
      queueNameRight.textContent = state.queue.right.name || 'Sin nombre';
      queueNickRight.textContent = state.queue.right.nickname || '';
      queueNickRight.style.color = state.queue.right.accentColor || '#9146FF';
      queueHandleRight.textContent = `${state.queue.right.handle || ''} • ${state.queue.right.role || 'HOST'}`;
      if (selectQueueRight.value !== state.queue.right.id) {
        selectQueueRight.value = state.queue.right.id;
      }
    } else {
      queueNameRight.textContent = '(Sin preparar)';
      queueNickRight.textContent = '';
      queueHandleRight.textContent = 'Selecciona abajo o usa el menú';
    }
  }

  // Estado de Escenas de Pantalla Completa
  document.querySelectorAll('.btn-scene').forEach(b => b.classList.remove('ring-2', 'ring-cyber-green', 'ring-yellow-400', 'ring-red-400'));

  if (state.scene && state.scene.isActive) {
    let scTitle = state.scene.title || 'ESCENA';
    if (state.scene.type === 'starting') {
      btnSceneStarting.classList.add('ring-2', 'ring-cyber-green');
      if (!state.scene.title) scTitle = 'ESTAMOS POR EMPEZAR';
    } else if (state.scene.type === 'brb') {
      btnSceneBrb.classList.add('ring-2', 'ring-yellow-400');
      if (!state.scene.title) scTitle = 'YA VOLVEMOS';
    } else if (state.scene.type === 'ended') {
      btnSceneEnded.classList.add('ring-2', 'ring-red-400');
      if (!state.scene.title) scTitle = 'STREAM FINALIZADO';
    }

    sceneActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/60 text-xs font-chakra font-bold uppercase shadow-[0_0_15px_rgba(0,255,102,0.3)]';
    sceneActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-ping';
    sceneActiveText.textContent = `EN PANTALLA: ${scTitle}`;
  } else {
    sceneActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-xs font-chakra font-bold uppercase';
    sceneActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
    sceneActiveText.textContent = 'SIN ESCENA (STREAM EN VIVO)';
  }

  // Estado del Banco de Animaciones: VS Boxeo (La Velada del Caos)
  const isVsLive = !!(state.vs && state.vs.isActive && state.vs.fight);
  if (navBadgeVs) {
    if (isVsLive) navBadgeVs.classList.remove('hidden');
    else navBadgeVs.classList.add('hidden');
  }

  if (badgeVeladaStatus) {
    if (isVsLive) {
      badgeVeladaStatus.className = 'px-2 py-0.5 rounded bg-cyber-green text-black text-[10px] font-mono font-bold animate-pulse shadow-[0_0_10px_rgba(0,255,102,0.6)]';
      badgeVeladaStatus.textContent = 'EN VIVO OBS';
    } else {
      badgeVeladaStatus.className = 'px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-mono border border-gray-700';
      badgeVeladaStatus.textContent = 'DISPONIBLE';
    }
  }

  if (vsActiveIndicator) {
    if (isVsLive) {
      const f = state.vs.fight;
      const f1Name = f.fighter1?.name || 'P1';
      const f2Name = f.fighter2?.name || 'P2';
      vsActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/60 text-xs font-chakra font-bold uppercase shadow-[0_0_15px_rgba(0,255,102,0.3)]';
      if (vsActiveDot) vsActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-ping';
      if (vsActiveText) vsActiveText.textContent = `EN PANTALLA: ${f1Name} VS ${f2Name}`;
    } else {
      vsActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-xs font-chakra font-bold uppercase';
      if (vsActiveDot) vsActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
      if (vsActiveText) vsActiveText.textContent = 'SIN COMBATE EN VIVO';
    }
  }

  // Estado del Banco de Animaciones: Multicam en Vivo
  const isMulticamLive = !!(state.multicam && state.multicam.isActive);
  if (badgeMulticamStatus) {
    if (isMulticamLive) {
      badgeMulticamStatus.className = 'px-2 py-0.5 rounded bg-cyan-400 text-black text-[10px] font-mono font-bold animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.6)]';
      badgeMulticamStatus.textContent = 'EN VIVO OBS';
    } else {
      badgeMulticamStatus.className = 'px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-mono border border-gray-700';
      badgeMulticamStatus.textContent = 'DISPONIBLE';
    }
  }

  if (multicamActiveIndicator) {
    if (isMulticamLive) {
      multicamActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/20 text-cyan-400 border border-cyan-400/60 text-xs font-chakra font-bold uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)]';
      if (multicamActiveDot) multicamActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping';
      if (multicamActiveText) multicamActiveText.textContent = `CÁMARAS EN PANTALLA`;
    } else {
      multicamActiveIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-xs font-chakra font-bold uppercase';
      if (multicamActiveDot) multicamActiveDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
      if (multicamActiveText) multicamActiveText.textContent = 'SIN CÁMARAS EN PANTALLA';
    }
  }

  // Estado del Overlay Superior Dinámico (HUD BirraVerde)
  if (state.topHud) {
    const isTopHudVisible = state.topHud.isVisible !== false;
    if (topHudStatusBadge) {
      if (isTopHudVisible) {
        topHudStatusBadge.className = 'px-2 py-0.5 rounded bg-cyber-green/20 text-cyber-green text-[10px] font-mono font-bold border border-cyber-green/40 uppercase';
        topHudStatusBadge.textContent = 'ACTIVO EN STREAM';
      } else {
        topHudStatusBadge.className = 'px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-mono border border-gray-700 uppercase';
        topHudStatusBadge.textContent = 'OCULTO EN STREAM';
      }
    }

    if (btnToggleTopHud) {
      if (isTopHudVisible) {
        btnToggleTopHud.className = 'px-3.5 py-1.5 rounded-lg bg-cyber-green text-black font-chakra font-extrabold text-xs uppercase hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.3)]';
        if (textTopHudToggle) textTopHudToggle.textContent = 'OVERLAY ACTIVO';
        if (iconTopHudToggle) iconTopHudToggle.setAttribute('data-lucide', 'eye');
      } else {
        btnToggleTopHud.className = 'px-3.5 py-1.5 rounded-lg bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-300 font-chakra font-bold text-xs uppercase transition-all flex items-center gap-1.5';
        if (textTopHudToggle) textTopHudToggle.textContent = 'OVERLAY OCULTO';
        if (iconTopHudToggle) iconTopHudToggle.setAttribute('data-lucide', 'eye-off');
      }
    }

    if (inputTopHudText && document.activeElement !== inputTopHudText) {
      inputTopHudText.value = state.topHud.customText || '';
    }
  }

  // Estado del Overlay Inferior de Chat Destacado y TTS
  if (state.chatOverlay) {
    if (inputChatPrefix && document.activeElement !== inputChatPrefix) {
      inputChatPrefix.value = state.chatOverlay.commandPrefix || '!anuncio';
    }

    if (btnToggleTts) {
      const isTtsOn = state.chatOverlay.ttsEnabled !== false;
      if (isTtsOn) {
        btnToggleTts.className = 'px-3 py-1 rounded-lg bg-cyber-green text-black font-chakra font-extrabold text-xs uppercase hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,255,102,0.3)]';
        if (textTtsToggle) textTtsToggle.textContent = 'TTS ACTIVO';
        if (iconTtsToggle) iconTtsToggle.setAttribute('data-lucide', 'volume-2');
      } else {
        btnToggleTts.className = 'px-3 py-1 rounded-lg bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-300 font-chakra font-bold text-xs uppercase transition-all flex items-center gap-1.5';
        if (textTtsToggle) textTtsToggle.textContent = 'TTS MUTED';
        if (iconTtsToggle) iconTtsToggle.setAttribute('data-lucide', 'volume-x');
      }
    }
  }
  refreshIcons();

  saveToLocalStorage();
  renderPresentersGrid();
});

// Lista de presentadores actualizada desde el servidor
socket.on('presenters-updated', (list) => {
  const incoming = list || [];
  if (incoming.length > 0) {
    presentersList = incoming;
    saveToLocalStorage();
    updateSelectOptions();
    renderPresentersGrid();
  } else {
    const cachedRaw = localStorage.getItem(LS_PRESENTERS_KEY);
    if (cachedRaw) {
      try {
        const cachedList = JSON.parse(cachedRaw);
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          socket.emit('sync-all-presenters', cachedList);
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }
});
});

function updateSelectOptions() {
  selectQueueLeft.innerHTML = '<option value="">-- Cambiar preparado izquierdo --</option>';
  selectQueueRight.innerHTML = '<option value="">-- Cambiar preparado derecho --</option>';

  presentersList.forEach(p => {
    const optL = document.createElement('option');
    optL.value = p.id;
    optL.textContent = `${p.name} (${p.nickname || p.handle})`;
    selectQueueLeft.appendChild(optL);

    const optR = document.createElement('option');
    optR.value = p.id;
    optR.textContent = `${p.name} (${p.nickname || p.handle})`;
    selectQueueRight.appendChild(optR);
  });

  if (currentLiveState.queue) {
    if (currentLiveState.queue.left) selectQueueLeft.value = currentLiveState.queue.left.id;
    if (currentLiveState.queue.right) selectQueueRight.value = currentLiveState.queue.right.id;
  }
}

// Eventos de selección en los dropdowns de preparación
selectQueueLeft.addEventListener('change', (e) => {
  const id = e.target.value;
  if (!id) return;
  const p = presentersList.find(x => x.id === id);
  if (p) {
    currentLiveState.queue.left = p;
    saveToLocalStorage();
    socket.emit('prepare-slot', { slot: 'left', presenter: p });
    showToast(`👈 Preparado en lado izquierdo: ${p.name}`);
  }
});

selectQueueRight.addEventListener('change', (e) => {
  const id = e.target.value;
  if (!id) return;
  const p = presentersList.find(x => x.id === id);
  if (p) {
    currentLiveState.queue.right = p;
    saveToLocalStorage();
    socket.emit('prepare-slot', { slot: 'right', presenter: p });
    showToast(`👉 Preparado en lado derecho: ${p.name}`);
  }
});

// Lanzar preparados a pantalla
btnLaunchPreparedLeft.addEventListener('click', () => {
  socket.emit('launch-prepared', { slot: 'left', autoHideSeconds: currentAutoHide });
});

btnLaunchPreparedRight.addEventListener('click', () => {
  socket.emit('launch-prepared', { slot: 'right', autoHideSeconds: currentAutoHide });
});

btnLaunchBothPrepared.addEventListener('click', () => {
  socket.emit('launch-prepared', { slot: 'both', autoHideSeconds: currentAutoHide });
});

// Ocultar Lower Thirds
btnHideLeft.addEventListener('click', () => socket.emit('hide-slot', 'left'));
btnHideRight.addEventListener('click', () => socket.emit('hide-slot', 'right'));
btnHideBoth.addEventListener('click', () => socket.emit('hide-all'));

// Eventos de Escenas de Pantalla Completa
btnSceneStarting.addEventListener('click', () => {
  socket.emit('show-scene', {
    type: 'starting',
    title: 'ESTAMOS POR EMPEZAR',
    subtitle: 'La transmisión comenzará en breve • Prepara tu birra'
  });
});

btnSceneBrb.addEventListener('click', () => {
  socket.emit('show-scene', {
    type: 'brb',
    title: 'YA VOLVEMOS',
    subtitle: 'Breve pausa comercial • Enseguida regresamos'
  });
});

btnSceneEnded.addEventListener('click', () => {
  socket.emit('show-scene', {
    type: 'ended',
    title: 'STREAM FINALIZADO',
    subtitle: '¡Muchas gracias por acompañarnos hoy! • Nos vemos en el próximo stream'
  });
});

btnHideScene.addEventListener('click', () => {
  socket.emit('hide-scene');
});

btnRefreshPreview.addEventListener('click', () => {
  previewIframe.src = '/overlay?t=' + Date.now();
});

// ============================================================
// VISIBILIDAD DEL MONITOR OBS EN VIVO
// ============================================================
function setMonitorVisibility(visible, save = true) {
  if (!colMonitor) return;

  if (visible) {
    // Mostrar monitor
    colMonitor.classList.remove('hidden');
    if (colSlotLeft) {
      colSlotLeft.classList.remove('lg:col-span-6');
      colSlotLeft.classList.add('lg:col-span-4');
    }
    if (colSlotRight) {
      colSlotRight.classList.remove('lg:col-span-6');
      colSlotRight.classList.add('lg:col-span-4');
    }
    if (textToggleMonitor) textToggleMonitor.textContent = 'Ocultar Monitor';
    if (btnToggleMonitor) {
      btnToggleMonitor.className = 'col-span-2 sm:col-auto px-3 py-1.5 rounded-lg bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-300 hover:text-white font-chakra font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5';
    }
    if (iconToggleMonitor) {
      iconToggleMonitor.setAttribute('data-lucide', 'eye-off');
    }
    setTimeout(adjustPreviewScale, 50);
  } else {
    // Ocultar monitor y expandir los slots a 6 columnas cada uno
    colMonitor.classList.add('hidden');
    if (colSlotLeft) {
      colSlotLeft.classList.remove('lg:col-span-4');
      colSlotLeft.classList.add('lg:col-span-6');
    }
    if (colSlotRight) {
      colSlotRight.classList.remove('lg:col-span-4');
      colSlotRight.classList.add('lg:col-span-6');
    }
    if (textToggleMonitor) textToggleMonitor.textContent = 'Mostrar Monitor';
    if (btnToggleMonitor) {
      btnToggleMonitor.className = 'col-span-2 sm:col-auto px-3 py-1.5 rounded-lg bg-cyber-green/10 border border-cyber-green text-cyber-green shadow-[0_0_10px_rgba(0,255,102,0.2)] font-chakra font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5';
    }
    if (iconToggleMonitor) {
      iconToggleMonitor.setAttribute('data-lucide', 'monitor');
    }
  }

  if (save) {
    try {
      localStorage.setItem(LS_MONITOR_VISIBLE_KEY, visible ? 'true' : 'false');
    } catch (e) {
      console.warn('Error guardando preferencia de monitor:', e);
    }
  }

  refreshIcons();
}

if (btnToggleMonitor) {
  btnToggleMonitor.addEventListener('click', () => {
    const isCurrentlyHidden = colMonitor.classList.contains('hidden');
    setMonitorVisibility(isCurrentlyHidden, true);
    showToast(isCurrentlyHidden ? '🖥️ Monitor OBS en vivo visible' : '👁️‍🗨️ Monitor OBS en vivo oculto');
  });
}

if (btnHideMonitorCard) {
  btnHideMonitorCard.addEventListener('click', () => {
    setMonitorVisibility(false, true);
    showToast('👁️‍🗨️ Monitor OBS oculto. Puedes volver a activarlo con el botón "Mostrar Monitor".');
  });
}

// ============================================================
// BANCO DE ANIMACIONES: LA VELADA DEL CAOS (VS BOXEO)
// ============================================================

// Sincronización de Combates desde el Servidor
socket.on('fights-updated', (incomingFights) => {
  if (Array.isArray(incomingFights) && incomingFights.length > 0) {
    fightsList = incomingFights;
    try {
      localStorage.setItem(LS_FIGHTS_KEY, JSON.stringify(fightsList));
    } catch (e) {}
  } else {
    // Si el servidor viene vacío, intentar rescatar de localStorage
    const localFights = localStorage.getItem(LS_FIGHTS_KEY);
    if (localFights) {
      try {
        fightsList = JSON.parse(localFights);
      } catch (e) {}
    }
  }

  // Si no hay seleccionado o el seleccionado ya no existe, elegir el primero
  if (!selectedFightId || !fightsList.some(f => f.id === selectedFightId)) {
    selectedFightId = fightsList[0] ? fightsList[0].id : null;
  }

  renderFightsSelect();
  renderFightPreview();
});

function renderFightsSelect() {
  if (labelFightsCount) {
    const len = fightsList.length;
    labelFightsCount.textContent = `${len} ${len === 1 ? 'combate listo' : 'combates listos'}`;
  }

  if (!selectFightActive) return;
  selectFightActive.innerHTML = '';

  if (fightsList.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Sin combates configurados)';
    selectFightActive.appendChild(opt);
    return;
  }

  fightsList.forEach((fight, idx) => {
    const opt = document.createElement('option');
    opt.value = fight.id;
    const f1 = fight.fighter1?.name || 'Peleador 1';
    const f2 = fight.fighter2?.name || 'Peleador 2';
    opt.textContent = `${idx + 1}. [${fight.title || 'COMBATE'}] ${f1} VS ${f2}`;
    if (fight.id === selectedFightId) {
      opt.selected = true;
    }
    selectFightActive.appendChild(opt);
  });
}

function renderFightPreview() {
  if (!fightPreviewStrip) return;
  const currentFight = fightsList.find(f => f.id === selectedFightId) || fightsList[0];

  if (!currentFight) {
    fightPreviewStrip.innerHTML = `
      <div class="col-span-full text-center py-6 text-gray-500 font-chakra text-xs">
        No hay combates disponibles. Haz clic en "NUEVO COMBATE" para configurar la primera pelea.
      </div>
    `;
    return;
  }

  const f1 = currentFight.fighter1 || {};
  const f2 = currentFight.fighter2 || {};

  fightPreviewStrip.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center w-full">
      <!-- Ficha Peleador 1 -->
      <div class="md:col-span-5 bg-black/60 border border-red-500/40 rounded-xl p-3 flex items-center gap-3">
        <div class="w-16 h-20 bg-black/80 rounded-lg border border-red-500/40 overflow-hidden flex items-center justify-center shrink-0">
          <img src="${f1.photo || '/assets/boxer-placeholder.svg'}" class="w-full h-full object-contain" alt="${f1.name || ''}">
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-chakra font-bold text-red-400 uppercase tracking-wider">
            ${f1.corner === 'red' ? '🔴 ESQUINA ROJA' : (f1.corner ? `ESQUINA ${f1.corner.toUpperCase()}` : 'ESQUINA 1')}
          </div>
          <div class="text-sm sm:text-base font-bold font-rajdhani text-white uppercase truncate">
            ${f1.name || 'Peleador 1'}
          </div>
          <div class="text-xs font-bold font-rajdhani text-red-400 uppercase truncate">
            ${f1.nickname ? `“${f1.nickname}”` : ''}
          </div>
          <div class="flex items-center gap-2 mt-1 text-[11px] font-chakra">
            <span class="px-1.5 py-0.5 rounded bg-green-500/20 text-cyber-green border border-green-500/40 font-bold">${f1.record?.wins ?? 0}V</span>
            <span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-bold">${f1.record?.draws ?? 0}E</span>
            <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold">${f1.record?.losses ?? 0}D</span>
            <span class="text-gray-400 font-mono text-[10px] ml-auto">${f1.weight || '--'} • ${f1.height || '--'}</span>
          </div>
        </div>
      </div>

      <!-- Centro VS -->
      <div class="md:col-span-2 flex flex-col items-center justify-center text-center py-1">
        <div class="w-10 h-10 rounded-lg bg-cyber-green/10 border border-cyber-green/50 flex items-center justify-center font-rajdhani font-black text-xl text-cyber-green shadow-[0_0_12px_rgba(0,255,102,0.3)]">
          VS
        </div>
        <div class="text-xs font-rajdhani font-bold text-white uppercase tracking-wider mt-1.5">
          ${currentFight.title || 'PELEA'}
        </div>
        <div class="text-[10px] font-chakra text-gray-400 uppercase truncate">
          ${currentFight.category || currentFight.rounds || 'BOXEO'}
        </div>
      </div>

      <!-- Ficha Peleador 2 -->
      <div class="md:col-span-5 bg-black/60 border border-blue-500/40 rounded-xl p-3 flex items-center gap-3">
        <div class="flex-1 min-w-0 text-right">
          <div class="text-[10px] font-chakra font-bold text-blue-400 uppercase tracking-wider">
            ${f2.corner === 'blue' ? '🔵 ESQUINA AZUL' : (f2.corner ? `ESQUINA ${f2.corner.toUpperCase()}` : 'ESQUINA 2')}
          </div>
          <div class="text-sm sm:text-base font-bold font-rajdhani text-white uppercase truncate">
            ${f2.name || 'Peleador 2'}
          </div>
          <div class="text-xs font-bold font-rajdhani text-blue-400 uppercase truncate">
            ${f2.nickname ? `“${f2.nickname}”` : ''}
          </div>
          <div class="flex items-center justify-end gap-2 mt-1 text-[11px] font-chakra">
            <span class="text-gray-400 font-mono text-[10px] mr-auto">${f2.weight || '--'} • ${f2.height || '--'}</span>
            <span class="px-1.5 py-0.5 rounded bg-green-500/20 text-cyber-green border border-green-500/40 font-bold">${f2.record?.wins ?? 0}V</span>
            <span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-bold">${f2.record?.draws ?? 0}E</span>
            <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold">${f2.record?.losses ?? 0}D</span>
          </div>
        </div>
        <div class="w-16 h-20 bg-black/80 rounded-lg border border-blue-500/40 overflow-hidden flex items-center justify-center shrink-0">
          <img src="${f2.photo || '/assets/boxer-placeholder.svg'}" class="w-full h-full object-contain" alt="${f2.name || ''}">
        </div>
      </div>
    </div>
  `;

  refreshIcons();
}

// Selector de Combate Activo
if (selectFightActive) {
  selectFightActive.addEventListener('change', (e) => {
    selectedFightId = e.target.value;
    renderFightPreview();
  });
}

// Botón Lanzar VS a Pantalla
if (btnLaunchVs) {
  btnLaunchVs.addEventListener('click', () => {
    const targetFight = fightsList.find(f => f.id === selectedFightId) || fightsList[0];
    if (!targetFight) {
      showToast('⚠️ No hay combates configurados para lanzar', 'error');
      return;
    }
    socket.emit('show-vs', { fight: targetFight });
    showToast(`🥊 Tabla VS lanzada en pantalla: ${targetFight.fighter1?.name || 'P1'} vs ${targetFight.fighter2?.name || 'P2'}`);
  });
}

// Botón Quitar VS
if (btnHideVs) {
  btnHideVs.addEventListener('click', () => {
    socket.emit('hide-vs');
    showToast('👁️‍🗨️ Tabla VS de combate retirada de pantalla');
  });
}

// Función para subir archivos PNG de peleadores a /api/upload
function setupFighterImageUpload(inputEl, previewEl, urlInputEl) {
  if (!inputEl) return;
  inputEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      if (previewEl) previewEl.src = dataUrl;

      // Subir al servidor express para persistir como archivo local en /uploads/
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, filename: file.name })
        });
        const result = await res.json();
        if (result && result.url) {
          if (urlInputEl) urlInputEl.value = result.url;
          if (previewEl) previewEl.src = result.url;
          showToast('✅ Foto PNG del peleador subida con éxito');
        } else {
          // Fallback a dataUrl en caso de error
          if (urlInputEl) urlInputEl.value = dataUrl;
        }
      } catch (err) {
        console.warn('Error subiendo imagen al endpoint, usando dataURL local:', err);
        if (urlInputEl) urlInputEl.value = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  });
}

setupFighterImageUpload(fightF1File, fightF1PreviewImg, fightF1PhotoUrl);
setupFighterImageUpload(fightF2File, fightF2PreviewImg, fightF2PhotoUrl);

if (fightF1PhotoUrl) {
  fightF1PhotoUrl.addEventListener('input', (e) => {
    if (fightF1PreviewImg) fightF1PreviewImg.src = e.target.value.trim() || '/assets/boxer-placeholder.svg';
  });
}

if (fightF2PhotoUrl) {
  fightF2PhotoUrl.addEventListener('input', (e) => {
    if (fightF2PreviewImg) fightF2PreviewImg.src = e.target.value.trim() || '/assets/boxer-placeholder.svg';
  });
}

// Abrir Modal de Combate
function openFightModal(fightId = null) {
  if (!fightModal) return;

  const target = fightId ? fightsList.find(f => f.id === fightId) : null;

  if (target) {
    if (fightModalTitle) fightModalTitle.textContent = `EDITAR: ${target.title || 'COMBATE'}`;
    fightFormId.value = target.id;
    fightFormTitle.value = target.title || '';
    fightFormCategory.value = target.category || '';
    fightFormRounds.value = target.rounds || '3 ROUNDS x 3 MIN';

    // Fighter 1
    const f1 = target.fighter1 || {};
    fightF1Name.value = f1.name || '';
    fightF1Nick.value = f1.nickname || '';
    fightF1Corner.value = f1.corner || 'red';
    fightF1Wins.value = f1.record?.wins ?? 0;
    fightF1Draws.value = f1.record?.draws ?? 0;
    fightF1Losses.value = f1.record?.losses ?? 0;
    fightF1Weight.value = f1.weight || '';
    fightF1Height.value = f1.height || '';
    fightF1PhotoUrl.value = f1.photo || '';
    fightF1PreviewImg.src = f1.photo || '/assets/boxer-placeholder.svg';

    // Fighter 2
    const f2 = target.fighter2 || {};
    fightF2Name.value = f2.name || '';
    fightF2Nick.value = f2.nickname || '';
    fightF2Corner.value = f2.corner || 'blue';
    fightF2Wins.value = f2.record?.wins ?? 0;
    fightF2Draws.value = f2.record?.draws ?? 0;
    fightF2Losses.value = f2.record?.losses ?? 0;
    fightF2Weight.value = f2.weight || '';
    fightF2Height.value = f2.height || '';
    fightF2PhotoUrl.value = f2.photo || '';
    fightF2PreviewImg.src = f2.photo || '/assets/boxer-placeholder.svg';
  } else {
    if (fightModalTitle) fightModalTitle.textContent = 'CONFIGURAR NUEVO COMBATE • LA VELADA DEL CAOS';
    fightFormId.value = '';
    fightFormTitle.value = `COMBATE ${fightsList.length + 1}`;
    fightFormCategory.value = 'PESO MEDIO';
    fightFormRounds.value = '3 ROUNDS x 3 MIN';

    fightF1Name.value = '';
    fightF1Nick.value = '';
    fightF1Corner.value = 'red';
    fightF1Wins.value = 0;
    fightF1Draws.value = 0;
    fightF1Losses.value = 0;
    fightF1Weight.value = '';
    fightF1Height.value = '';
    fightF1PhotoUrl.value = '';
    fightF1PreviewImg.src = '/assets/boxer-placeholder.svg';

    fightF2Name.value = '';
    fightF2Nick.value = '';
    fightF2Corner.value = 'blue';
    fightF2Wins.value = 0;
    fightF2Draws.value = 0;
    fightF2Losses.value = 0;
    fightF2Weight.value = '';
    fightF2Height.value = '';
    fightF2PhotoUrl.value = '';
    fightF2PreviewImg.src = '/assets/boxer-placeholder.svg';
  }

  fightModal.classList.remove('hidden');
  fightModal.classList.add('flex');
}

function closeFightModal() {
  if (!fightModal) return;
  fightModal.classList.remove('flex');
  fightModal.classList.add('hidden');
}

if (btnOpenCreateFight) {
  btnOpenCreateFight.addEventListener('click', () => openFightModal(null));
}

if (btnOpenEditFight) {
  btnOpenEditFight.addEventListener('click', () => {
    if (!selectedFightId && fightsList.length > 0) selectedFightId = fightsList[0].id;
    openFightModal(selectedFightId);
  });
}

if (btnCloseFightModal) btnCloseFightModal.addEventListener('click', closeFightModal);
if (btnCancelFightModal) btnCancelFightModal.addEventListener('click', closeFightModal);

// Recolectar datos y guardar combate
function collectFightFormData() {
  const fightId = fightFormId.value.trim() || `fight-${Date.now()}`;
  return {
    id: fightId,
    title: fightFormTitle.value.trim() || 'PELEA ESTELAR',
    category: fightFormCategory.value.trim() || 'PESO MEDIO',
    rounds: fightFormRounds.value.trim() || '3 ROUNDS x 3 MIN',
    fighter1: {
      name: fightF1Name.value.trim() || 'PELEADOR 1',
      nickname: fightF1Nick.value.trim() || '',
      corner: fightF1Corner.value || 'red',
      weight: fightF1Weight.value.trim() || '-- KG',
      height: fightF1Height.value.trim() || '-- M',
      record: {
        wins: parseInt(fightF1Wins.value, 10) || 0,
        draws: parseInt(fightF1Draws.value, 10) || 0,
        losses: parseInt(fightF1Losses.value, 10) || 0
      },
      photo: fightF1PhotoUrl.value.trim() || '/assets/boxer-placeholder.svg'
    },
    fighter2: {
      name: fightF2Name.value.trim() || 'PELEADOR 2',
      nickname: fightF2Nick.value.trim() || '',
      corner: fightF2Corner.value || 'blue',
      weight: fightF2Weight.value.trim() || '-- KG',
      height: fightF2Height.value.trim() || '-- M',
      record: {
        wins: parseInt(fightF2Wins.value, 10) || 0,
        draws: parseInt(fightF2Draws.value, 10) || 0,
        losses: parseInt(fightF2Losses.value, 10) || 0
      },
      photo: fightF2PhotoUrl.value.trim() || '/assets/boxer-placeholder.svg'
    }
  };
}

if (fightForm) {
  fightForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fightData = collectFightFormData();

    socket.emit('save-fight', fightData, (res) => {
      // Confirmado
    });

    selectedFightId = fightData.id;
    showToast(`🥊 Combate "${fightData.title}" guardado con éxito`);
    closeFightModal();
  });
}

if (btnSaveAndLaunchFight) {
  btnSaveAndLaunchFight.addEventListener('click', () => {
    if (!fightForm.checkValidity()) {
      fightForm.reportValidity();
      return;
    }
    const fightData = collectFightFormData();

    socket.emit('save-fight', fightData);
    socket.emit('show-vs', { fight: fightData });

    selectedFightId = fightData.id;
    showToast(`🚀 Combate guardado y lanzado a pantalla en vivo`);
    closeFightModal();
  });
}

// ============================================================
// RENDERIZAR DECK DE PRESENTADORES
// ============================================================
function renderPresentersGrid() {
  presentersGrid.innerHTML = '';

  if (presentersList.length === 0) {
    presentersGrid.innerHTML = `
      <div class="col-span-full p-8 text-center bg-cyber-dark border border-dashed border-cyber-border rounded-xl text-gray-400">
        <i data-lucide="users" class="w-8 h-8 mx-auto mb-2 text-gray-500"></i>
        <p class="font-chakra text-sm uppercase">No hay overlays guardados.</p>
        <p class="text-xs text-gray-500 mt-1">Haz clic en "CREAR NUEVO" para agregar a tus presentadores o casters.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  presentersList.forEach((p) => {
    const isLiveLeft = currentLiveState.left && currentLiveState.left.isVisible && currentLiveState.left.presenter && currentLiveState.left.presenter.id === p.id;
    const isLiveRight = currentLiveState.right && currentLiveState.right.isVisible && currentLiveState.right.presenter && currentLiveState.right.presenter.id === p.id;
    const isQueuedLeft = currentLiveState.queue && currentLiveState.queue.left && currentLiveState.queue.left.id === p.id;
    const isQueuedRight = currentLiveState.queue && currentLiveState.queue.right && currentLiveState.queue.right.id === p.id;

    const card = document.createElement('div');
    card.className = `bg-cyber-dark border rounded-xl p-4 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg ${
      isLiveLeft || isLiveRight
        ? 'border-cyber-green ring-2 ring-cyber-green/40 shadow-[0_0_15px_rgba(0,255,102,0.2)]'
        : (isQueuedLeft || isQueuedRight)
          ? 'border-yellow-500/70'
          : 'border-cyber-border hover:border-gray-600'
    }`;

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded border border-cyber-green/40 bg-cyber-green/10 flex items-center gap-1 shadow-[0_0_8px_rgba(0,255,102,0.15)]">
              <img src="/assets/logo-kick.png" class="h-3.5 w-auto object-contain" alt="KICK">
            </span>
            <span class="text-xs text-gray-300 font-mono">${p.handle || ''}</span>
          </div>

          <!-- Badges de estado -->
          <div class="flex items-center gap-1">
            ${isLiveLeft ? `
              <span class="text-[10px] font-chakra font-bold text-cyber-green bg-cyber-green/20 px-2 py-0.5 rounded border border-cyber-green/50 animate-pulse">
                EN VIVO (IZQ)
              </span>
            ` : ''}
            ${isLiveRight ? `
              <span class="text-[10px] font-chakra font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/50 animate-pulse">
                EN VIVO (DER)
              </span>
            ` : ''}
            ${(!isLiveLeft && isQueuedLeft) ? `
              <span class="text-[10px] font-chakra font-semibold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/40">
                PREPARADO (IZQ)
              </span>
            ` : ''}
            ${(!isLiveRight && isQueuedRight) ? `
              <span class="text-[10px] font-chakra font-semibold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/40">
                PREPARADO (DER)
              </span>
            ` : ''}
          </div>
        </div>

        <div class="mb-2">
          <h4 class="text-lg font-bold font-rajdhani text-white uppercase tracking-wide leading-tight">
            ${p.name || 'Sin Nombre'}
          </h4>
          <div class="text-sm font-bold font-rajdhani uppercase tracking-wider" style="color: ${p.accentColor || '#00ff66'};">
            ${p.nickname || ''}
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <span class="px-2 py-0.5 rounded bg-black/40 border border-cyber-border font-mono">${p.role || 'HOST'}</span>
        </div>
      </div>

      <!-- BOTONES DE ACCIÓN: PREPARAR Y LANZAR DIRECTO -->
      <div class="pt-3 border-t border-cyber-border/70 space-y-2">
        <!-- Fila 1: Botones de Preparación (Sin salir en stream aún) -->
        <div class="text-[10px] text-gray-400 font-chakra font-semibold uppercase tracking-wider">
          Preparar para el próximo cambio:
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button class="btn-queue-left py-1.5 px-2 rounded-lg font-chakra font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 ${
            isQueuedLeft
              ? 'bg-yellow-500 text-black font-extrabold shadow-[0_0_10px_rgba(234,179,8,0.4)]'
              : 'bg-cyber-card border border-cyber-border hover:border-cyber-green text-gray-300 hover:text-white'
          }">
            <i data-lucide="clock" class="w-3 h-3"></i>
            <span>${isQueuedLeft ? '✓ Listo Izq' : '👈 Preparar Izq'}</span>
          </button>

          <button class="btn-queue-right py-1.5 px-2 rounded-lg font-chakra font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 ${
            isQueuedRight
              ? 'bg-yellow-500 text-black font-extrabold shadow-[0_0_10px_rgba(234,179,8,0.4)]'
              : 'bg-cyber-card border border-cyber-border hover:border-purple-400 text-gray-300 hover:text-white'
          }">
            <span>${isQueuedRight ? '✓ Listo Der' : 'Preparar Der 👉'}</span>
            <i data-lucide="clock" class="w-3 h-3"></i>
          </button>
        </div>

        <!-- Fila 2: Acciones Rápidas (Lanzamiento Inmediato) y Gestión -->
        <div class="pt-1.5 flex items-center justify-between text-xs">
          <!-- Disparo Directo -->
          <div class="flex items-center gap-1">
            <button class="btn-direct-left px-2 py-1 rounded bg-cyber-green/10 hover:bg-cyber-green hover:text-black border border-cyber-green/30 text-cyber-green font-chakra font-bold text-[11px] transition-colors" title="Lanzar en vivo ya">
              ⚡ En Vivo Izq
            </button>
            <button class="btn-direct-right px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500 hover:text-white border border-purple-500/30 text-purple-400 font-chakra font-bold text-[11px] transition-colors" title="Lanzar en vivo ya">
              ⚡ En Vivo Der
            </button>
          </div>

          <div class="flex items-center gap-1">
            <button class="btn-card-edit p-1.5 rounded bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-400 hover:text-white" title="Editar">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-card-delete p-1.5 rounded bg-cyber-card border border-cyber-border hover:border-red-500 hover:text-red-400 text-gray-400" title="Eliminar">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    // Listeners
    const btnQLeft = card.querySelector('.btn-queue-left');
    btnQLeft.addEventListener('click', () => {
      currentLiveState.queue.left = p;
      saveToLocalStorage();
      socket.emit('prepare-slot', { slot: 'left', presenter: p });
      showToast(`👈 Preparado en lado izquierdo: ${p.name}`);
    });

    const btnQRight = card.querySelector('.btn-queue-right');
    btnQRight.addEventListener('click', () => {
      currentLiveState.queue.right = p;
      saveToLocalStorage();
      socket.emit('prepare-slot', { slot: 'right', presenter: p });
      showToast(`👉 Preparado en lado derecho: ${p.name}`);
    });

    const btnDLeft = card.querySelector('.btn-direct-left');
    btnDLeft.addEventListener('click', () => {
      socket.emit('show-slot', { slot: 'left', presenter: p, autoHideSeconds: currentAutoHide });
    });

    const btnDRight = card.querySelector('.btn-direct-right');
    btnDRight.addEventListener('click', () => {
      socket.emit('show-slot', { slot: 'right', presenter: p, autoHideSeconds: currentAutoHide });
    });

    const btnEdit = card.querySelector('.btn-card-edit');
    btnEdit.addEventListener('click', () => openEditModal(p));

    const btnDelete = card.querySelector('.btn-card-delete');
    btnDelete.addEventListener('click', () => {
      if (confirm(`¿Eliminar definitivamente a "${p.name}"?`)) {
        presentersList = presentersList.filter(x => x.id !== p.id);
        saveToLocalStorage();
        socket.emit('delete-presenter', p.id, (res) => {
          showToast(`🗑️ Presentador "${p.name}" eliminado`);
        });
        fetch(`/api/presenters/${p.id}`, { method: 'DELETE' }).catch(err => console.warn('REST delete presenter:', err));
        renderPresentersGrid();
        updateSelectOptions();
      }
    });

    presentersGrid.appendChild(card);
  });

  refreshIcons();
}

// ============================================================
// MODAL: CREAR / EDITAR PRESENTADOR
// ============================================================
function openCreateModal() {
  modalTitle.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-cyber-green"></i> CREAR NUEVO PRESENTADOR`;
  formId.value = '';
  formName.value = '';
  formNick.value = '';
  formHandle.value = '@';
  formRole.value = 'HOST';
  formAccentColor.value = '#00ff66';
  formDefaultSide.value = 'left';

  presenterModal.classList.remove('hidden');
  presenterModal.classList.add('flex');
  refreshIcons();
  formName.focus();
}

function openEditModal(p) {
  modalTitle.innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-cyber-green"></i> EDITAR PRESENTADOR`;
  formId.value = p.id || '';
  formName.value = p.name || '';
  formNick.value = (p.nickname || '').replace(/[“”"]/g, '');
  formHandle.value = p.handle || '';
  formRole.value = p.role || '';
  formAccentColor.value = p.accentColor || '#00ff66';
  formDefaultSide.value = p.defaultSide || 'left';

  presenterModal.classList.remove('hidden');
  presenterModal.classList.add('flex');
  refreshIcons();
  formName.focus();
}

function closeModal() {
  presenterModal.classList.add('hidden');
  presenterModal.classList.remove('flex');
}

btnOpenCreateModal.addEventListener('click', openCreateModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

presenterForm.addEventListener('submit', (e) => {
  e.preventDefault();

  let nick = formNick.value.trim();
  if (nick && !nick.startsWith('“') && !nick.startsWith('"')) {
    nick = `“${nick}”`;
  }

  const presenterData = {
    id: formId.value || `pres-${Date.now()}`,
    name: formName.value.trim().toUpperCase(),
    nickname: nick.toUpperCase(),
    platform: 'kick',
    platformName: 'KICK',
    handle: formHandle.value.trim(),
    role: formRole.value.trim().toUpperCase(),
    accentColor: formAccentColor.value,
    defaultSide: formDefaultSide.value
  };

  // 1. Guardar de inmediato en estado local y LocalStorage
  const existingIdx = presentersList.findIndex(p => p.id === presenterData.id);
  if (existingIdx !== -1) {
    presentersList[existingIdx] = presenterData;
  } else {
    presentersList.push(presenterData);
  }
  saveToLocalStorage();
  updateSelectOptions();
  renderPresentersGrid();

  // 2. Emitir a Socket y servidor
  socket.emit('save-presenter', presenterData, (res) => {
    // Confirmación del servidor
  });

  // 3. Respaldo directo REST para persistencia garantizada en base de datos
  fetch(`/api/presenters/${presenterData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presenterData)
  }).catch(err => console.warn('REST save presenter:', err));

  showToast(`💾 Presentador "${presenterData.name}" guardado exitosamente`);
  closeModal();
});

// ============================================================
// RESPALDO Y RESTAURACIÓN (EXPORTAR / IMPORTAR JSON)
// ============================================================
if (btnExportBackup) {
  btnExportBackup.addEventListener('click', () => {
    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      presenters: presentersList,
      settings: {
        scale: currentLiveState.scale,
        defaultAutoHide: currentAutoHide,
        queue: {
          leftId: currentLiveState.queue?.left?.id || null,
          rightId: currentLiveState.queue?.right?.id || null
        }
      }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `birraverde-stream-overlays-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('📦 Respaldo descargado correctamente');
  });
}

if (inputImportBackup) {
  inputImportBackup.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data || !Array.isArray(data.presenters)) {
          throw new Error('El archivo no tiene el formato válido de presentadores.');
        }

        presentersList = data.presenters;
        if (data.settings) {
          if (typeof data.settings.scale === 'number') currentLiveState.scale = data.settings.scale;
          if (typeof data.settings.defaultAutoHide === 'number') currentAutoHide = data.settings.defaultAutoHide;
        }

        saveToLocalStorage();
        updateSelectOptions();
        renderPresentersGrid();
        updateScaleUI(currentLiveState.scale);
        updateAutoHideUI(currentAutoHide);

        socket.emit('import-backup', data, (res) => {
          showToast('✅ Copia de seguridad restaurada y sincronizada en el servidor');
        });
      } catch (err) {
        alert('Error al importar el archivo: ' + err.message);
        showToast('❌ Error al importar respaldo', 'error');
      }
      inputImportBackup.value = '';
    };
    reader.readAsText(file);
  });
}

// ============================================================
// MODAL: OBS URL
// ============================================================
btnCopyObs.addEventListener('click', () => {
  const overlayUrl = `${window.location.protocol}//${window.location.host}/overlay`;
  obsUrlInput.value = overlayUrl;
  obsModal.classList.remove('hidden');
  obsModal.classList.add('flex');
  refreshIcons();
});

btnCloseObsModal.addEventListener('click', () => {
  obsModal.classList.add('hidden');
  obsModal.classList.remove('flex');
});

btnCopyUrlInside.addEventListener('click', () => {
  navigator.clipboard.writeText(obsUrlInput.value).then(() => {
    btnCopyUrlInside.textContent = '¡Copiado!';
    btnCopyUrlInside.className = 'px-4 py-2 rounded-lg bg-emerald-400 text-black font-bold font-chakra shrink-0';
    setTimeout(() => {
      btnCopyUrlInside.textContent = 'Copiar';
      btnCopyUrlInside.className = 'px-4 py-2 rounded-lg bg-cyber-green text-black font-bold font-chakra hover:bg-emerald-400 shrink-0';
    }, 2000);
  });
});

// ============================================================
// NAVEGACIÓN NAVBAR (PESTAÑAS)
// ============================================================
function switchMainTab(tab) {
  const inactiveBtnClass = 'nav-tab flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-chakra font-bold text-gray-300 hover:text-white hover:bg-cyber-card transition-all cursor-pointer';
  const activeBtnClass = 'nav-tab active flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-chakra font-bold transition-all bg-cyber-green text-black shadow-[0_0_12px_rgba(0,255,102,0.3)] cursor-pointer';

  // Ocultar todos los paneles
  if (tabPanelMain) tabPanelMain.classList.add('hidden');
  if (tabPanelMulticam) tabPanelMulticam.classList.add('hidden');
  if (tabPanelAnimations) tabPanelAnimations.classList.add('hidden');
  if (tabPanelConfig) tabPanelConfig.classList.add('hidden');

  // Resetear estados visuales de botones
  if (navTabMain) navTabMain.className = inactiveBtnClass;
  if (navTabMulticam) navTabMulticam.className = inactiveBtnClass;
  if (navTabAnimations) navTabAnimations.className = inactiveBtnClass;
  if (navTabConfig) navTabConfig.className = inactiveBtnClass;

  if (tab === 'config' || tab === 'settings') {
    if (tabPanelConfig) tabPanelConfig.classList.remove('hidden');
    if (navTabConfig) navTabConfig.className = activeBtnClass;
    localStorage.setItem('birraverde_active_tab', 'config');
  } else if (tab === 'animations' || tab === 'scenes' || tab === 'multicam') {
    if (tabPanelAnimations) tabPanelAnimations.classList.remove('hidden');
    if (navTabAnimations) navTabAnimations.className = activeBtnClass;

    // Actualizar URLs de Multicam con el host actual
    if (multicamGuestLink) multicamGuestLink.value = window.location.origin + '/guest';
    if (multicamObsLink) multicamObsLink.value = window.location.origin + '/overlay';

    if (tab === 'multicam') {
      setTimeout(() => toggleMulticamModule(true), 50);
    }
    localStorage.setItem('birraverde_active_tab', 'scenes');
  } else {
    if (tabPanelMain) tabPanelMain.classList.remove('hidden');
    if (navTabMain) navTabMain.className = activeBtnClass;
    localStorage.setItem('birraverde_active_tab', 'main');
    setTimeout(adjustPreviewScale, 50);
  }
  refreshIcons();
}

if (navTabMain) {
  navTabMain.addEventListener('click', () => switchMainTab('main'));
}
if (navTabMulticam) {
  navTabMulticam.addEventListener('click', () => switchMainTab('multicam'));
}
if (navTabAnimations) {
  navTabAnimations.addEventListener('click', () => switchMainTab('animations'));
}
if (navTabConfig) {
  navTabConfig.addEventListener('click', () => switchMainTab('config'));
}

window.setQuickTestMessage = function(text) {
  if (inputAnnouncementText) {
    inputAnnouncementText.value = text;
    inputAnnouncementText.focus();
  }
};

// ============================================================
// BANCO DE ANIMACIONES: DESPLEGAR/CONTRAER ESCENA
// ============================================================
let isVeladaPanelOpen = false;

function toggleVeladaModule(forceState) {
  if (typeof forceState === 'boolean') {
    isVeladaPanelOpen = forceState;
  } else {
    isVeladaPanelOpen = !isVeladaPanelOpen;
  }

  if (sceneModuleVelada) {
    if (isVeladaPanelOpen) {
      sceneModuleVelada.classList.remove('hidden');
      if (textToggleVeladaPanel) textToggleVeladaPanel.textContent = 'OCULTAR';
      if (iconToggleVeladaPanel) iconToggleVeladaPanel.setAttribute('data-lucide', 'chevron-up');
      if (cardSceneVelada) {
        cardSceneVelada.classList.add('border-cyber-green', 'shadow-[0_0_20px_rgba(0,255,102,0.2)]');
      }
      setTimeout(() => {
        sceneModuleVelada.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } else {
      sceneModuleVelada.classList.add('hidden');
      if (textToggleVeladaPanel) textToggleVeladaPanel.textContent = 'ABRIR CONSOLA';
      if (iconToggleVeladaPanel) iconToggleVeladaPanel.setAttribute('data-lucide', 'chevron-down');
      if (cardSceneVelada) {
        cardSceneVelada.classList.remove('border-cyber-green', 'shadow-[0_0_20px_rgba(0,255,102,0.2)]');
      }
    }
    refreshIcons();
  }
}

if (btnToggleVeladaPanel) {
  btnToggleVeladaPanel.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVeladaModule();
  });
}

if (cardSceneVelada) {
  cardSceneVelada.addEventListener('click', (e) => {
    if (e.target.closest('#btn-toggle-velada-panel')) return;
    toggleVeladaModule();
  });
}

if (btnCollapseVeladaPanel) {
  btnCollapseVeladaPanel.addEventListener('click', () => {
    toggleVeladaModule(false);
  });
}

// ============================================================
// BANCO DE ANIMACIONES: ESCENA MULTICAM
// ============================================================
let isMulticamPanelOpen = false;

function toggleMulticamModule(forceState) {
  if (typeof forceState === 'boolean') {
    isMulticamPanelOpen = forceState;
  } else {
    isMulticamPanelOpen = !isMulticamPanelOpen;
  }

  if (sceneModuleMulticam) {
    if (isMulticamPanelOpen) {
      sceneModuleMulticam.classList.remove('hidden');
      if (textToggleMulticamPanel) textToggleMulticamPanel.textContent = 'OCULTAR';
      if (iconToggleMulticamPanel) iconToggleMulticamPanel.setAttribute('data-lucide', 'chevron-up');
      if (cardSceneMulticam) {
        cardSceneMulticam.classList.add('border-cyan-400', 'shadow-[0_0_20px_rgba(6,182,212,0.2)]');
      }
      setTimeout(() => {
        sceneModuleMulticam.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } else {
      sceneModuleMulticam.classList.add('hidden');
      if (textToggleMulticamPanel) textToggleMulticamPanel.textContent = 'ABRIR CONSOLA';
      if (iconToggleMulticamPanel) iconToggleMulticamPanel.setAttribute('data-lucide', 'chevron-down');
      if (cardSceneMulticam) {
        cardSceneMulticam.classList.remove('border-cyan-400', 'shadow-[0_0_20px_rgba(6,182,212,0.2)]');
      }
    }
    refreshIcons();
  }
}

if (btnToggleMulticamPanel) {
  btnToggleMulticamPanel.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMulticamModule();
  });
}

if (cardSceneMulticam) {
  cardSceneMulticam.addEventListener('click', (e) => {
    if (e.target.closest('#btn-toggle-multicam-panel')) return;
    toggleMulticamModule();
  });
}

if (btnCollapseMulticamPanel) {
  btnCollapseMulticamPanel.addEventListener('click', () => {
    toggleMulticamModule(false);
  });
}

// Lanzar Multicam a la misma fuente /overlay de OBS
if (btnLaunchMulticamScene) {
  btnLaunchMulticamScene.addEventListener('click', () => {
    const sceneMode = selectMulticamSceneQuick ? selectMulticamSceneQuick.value : 'pip-corner-tr';
    socket.emit('show-multicam', { scene: sceneMode });
    showToast('🎬 Cámaras Multicam lanzadas al stream en /overlay');
  });
}

if (btnHideMulticamScene) {
  btnHideMulticamScene.addEventListener('click', () => {
    socket.emit('hide-multicam');
    showToast('✕ Cámaras Multicam retiradas de /overlay');
  });
}

if (selectMulticamSceneQuick) {
  selectMulticamSceneQuick.addEventListener('change', () => {
    const scene = selectMulticamSceneQuick.value;
    socket.emit('multicam-change-scene', { scene });
    showToast(`📐 Modo cambiado a: ${scene}`);
  });
}

// ============================================================
// OVERLAY SUPERIOR DINÁMICO (HUD BIRRAVERDE Y BARRA DE EVENTOS)
// ============================================================
if (btnToggleTopHud) {
  btnToggleTopHud.addEventListener('click', () => {
    const isCurrentVisible = currentLiveState.topHud ? currentLiveState.topHud.isVisible !== false : true;
    socket.emit('toggle-top-hud', { isVisible: !isCurrentVisible });
    showToast(!isCurrentVisible ? '👁️ Overlay Superior Activado' : '🕶️ Overlay Superior Ocultado');
  });
}

if (btnSaveTopHudText && inputTopHudText) {
  btnSaveTopHudText.addEventListener('click', () => {
    const text = inputTopHudText.value.trim();
    socket.emit('update-top-hud-text', { text });
    showToast('✅ Texto de marquesina actualizado en OBS');
  });

  inputTopHudText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSaveTopHudText.click();
    }
  });
}

// Simulador de Eventos (Follows, Donaciones, Comentarios)
if (btnTestFollow) {
  btnTestFollow.addEventListener('click', () => {
    const testUsers = ['@alex_gamer', '@valen_kick', '@cyber_streamer', '@birra_fan', '@rodrigo_live'];
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    socket.emit('trigger-hud-alert', {
      type: 'follow',
      user: user,
      detail: 'se acaba de suscribir / seguir al stream'
    });
    showToast(`⭐ Simulación enviada: Follow de ${user}`);
  });
}

if (btnTestDonation) {
  btnTestDonation.addEventListener('click', () => {
    const amounts = ['$5.00', '$10.00', '$25.00', '$50.00', '$100.00'];
    const testUsers = ['@el_donador', '@luismishit_fan', '@santi_birra', '@vip_kick'];
    const msgs = ['¡Gran transmisión!', 'Para las birras del stream 🍻', 'Apoyando el directo 🔥', '¡Vamos con todo el hype!'];
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    socket.emit('trigger-hud-alert', {
      type: 'donation',
      user: user,
      amount: amount,
      detail: msg
    });
    showToast(`💎 Simulación enviada: Donación de ${user} (${amount})`);
  });
}

if (btnTestComment) {
  btnTestComment.addEventListener('click', () => {
    const testComments = [
      { user: '@facu_kick', msg: '¡Qué buen overlay se armaron!' },
      { user: '@marian_99', msg: '¿A qué hora empieza la pelea estelar?' },
      { user: '@nico_birra', msg: '¡El mejor stream de Kick de lejos!' }
    ];
    const item = testComments[Math.floor(Math.random() * testComments.length)];
    socket.emit('trigger-hud-alert', {
      type: 'comment',
      user: item.user,
      detail: item.msg
    });
    showToast(`💬 Simulación enviada: Comentario de ${item.user}`);
  });
}

// ============================================================
// RECUADRO INFERIOR DE CHAT Y LECTURA TTS
// ============================================================
if (btnToggleTts) {
  btnToggleTts.addEventListener('click', () => {
    const isCurrentlyOn = currentLiveState.chatOverlay ? currentLiveState.chatOverlay.ttsEnabled !== false : true;
    socket.emit('toggle-chat-tts', { enabled: !isCurrentlyOn });
    showToast(!isCurrentlyOn ? '🔊 Voz TTS Activada' : '🔇 Voz TTS Silenciada');
  });
}

if (inputChatPrefix) {
  inputChatPrefix.addEventListener('change', () => {
    const prefix = inputChatPrefix.value.trim() || '!anuncio';
    inputChatPrefix.value = prefix;
    socket.emit('update-chat-prefix', { prefix });
    showToast(`⚙️ Prefijo de chat actualizado: ${prefix}`);
  });
}

if (btnSendAnnouncement) {
  btnSendAnnouncement.addEventListener('click', () => {
    const user = (inputAnnouncementUser ? inputAnnouncementUser.value.trim() : '') || '@espectador';
    const text = (inputAnnouncementText ? inputAnnouncementText.value.trim() : '');
    if (!text) {
      showToast('⚠️ Ingresa un mensaje para el anuncio', 'error');
      return;
    }

    socket.emit('trigger-chat-announcement', {
      user: user,
      text: text,
      tts: currentLiveState.chatOverlay ? currentLiveState.chatOverlay.ttsEnabled !== false : true
    });
    showToast(`📢 Anuncio enviado a pantalla: ${user}`);
  });

  if (inputAnnouncementText) {
    inputAnnouncementText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnSendAnnouncement.click();
      }
    });
  }
}

if (btnHideAnnouncement) {
  btnHideAnnouncement.addEventListener('click', () => {
    socket.emit('hide-chat-announcement');
    showToast('✕ Anuncio retirado de pantalla');
  });
}

// Conexión y Notificaciones de Kick Chat
socket.on('kick-chat-status', (status) => {
  const kickDot = document.getElementById('kick-chat-dot');
  if (kickDot) {
    if (status && status.connected) {
      kickDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0';
      kickDot.title = 'Conectado a Kick Chat @birraverde';
    } else {
      kickDot.className = 'w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shrink-0';
      kickDot.title = 'Reconectando a Kick Chat...';
    }
  }
});

socket.on('chat-announcement', (payload) => {
  if (payload && payload.source === 'kick') {
    showToast(`📢 Anuncio de Kick (${payload.user}): "${payload.text}"`);
  }
});

// ============================================================
// LÓGICA DEL SISTEMA MULTICAM (HOST ADMIN)
// ============================================================
const SCENE_NAMES = {
  'pip-corner-tl': 'Esquina Sup. Izquierda (Arriba Izq.)',
  'pip-corner-bl': 'Esquina Inf. Izquierda (Abajo Izq.)',
  'pip-corner-tr': 'Esquina Sup. Derecha (Arriba Der.)',
  'pip-corner-br': 'Esquina Inf. Derecha (Abajo Der.)',
  'pip-bottom-bar': 'Barra Inferior (Abajo)',
  'grid': 'Mosaico Completo (Fondo Láser BirraVerde)'
};

const rangeMulticamScale = document.getElementById('range-multicam-scale');
const labelMulticamScaleVal = document.getElementById('label-multicam-scale-val');

function updateScaleUI(scaleVal) {
  if (scaleVal === undefined || scaleVal === null) return;
  const pct = Math.round(Number(scaleVal) * 100);
  if (labelMulticamScaleVal) labelMulticamScaleVal.textContent = pct + '%';
  if (rangeMulticamScale && Math.abs(parseFloat(rangeMulticamScale.value) - Number(scaleVal)) > 0.01) {
    rangeMulticamScale.value = scaleVal;
  }
}

if (rangeMulticamScale) {
  rangeMulticamScale.addEventListener('input', () => {
    const scaleVal = parseFloat(rangeMulticamScale.value);
    updateScaleUI(scaleVal);
    socket.emit('multicam-save-settings', { camScale: scaleVal });
  });
}

document.querySelectorAll('.btn-preset-scale').forEach(btn => {
  btn.addEventListener('click', () => {
    const scaleVal = parseFloat(btn.getAttribute('data-scale'));
    if (!isNaN(scaleVal)) {
      updateScaleUI(scaleVal);
      socket.emit('multicam-save-settings', { camScale: scaleVal });
      showToast(`📏 Escala de cámaras ajustada: ${Math.round(scaleVal * 100)}%`);
    }
  });
});

// 1. Copiar Enlaces
if (btnCopyGuestLink) {
  btnCopyGuestLink.addEventListener('click', () => {
    const url = window.location.origin + '/guest';
    navigator.clipboard.writeText(url).then(() => {
      showToast('🔗 Enlace para invitados copiado al portapapeles');
      btnCopyGuestLink.textContent = '¡Copiado!';
      setTimeout(() => btnCopyGuestLink.textContent = 'Copiar', 2000);
    });
  });
}

if (btnCopyMulticamObs) {
  btnCopyMulticamObs.addEventListener('click', () => {
    const url = window.location.origin + '/multicam';
    navigator.clipboard.writeText(url).then(() => {
      showToast('🎥 Fuente OBS Multicam copiada');
      btnCopyMulticamObs.textContent = '¡Copiado!';
      setTimeout(() => btnCopyMulticamObs.textContent = 'Copiar', 2000);
    });
  });
}

// 2. Selección de Escenas Multicam
document.querySelectorAll('.btn-scene-select').forEach(btn => {
  btn.addEventListener('click', () => {
    const scene = btn.getAttribute('data-scene');
    if (scene) {
      socket.emit('multicam-change-scene', { scene });
      updateActiveSceneUI(scene);
      showToast(`🎬 Escena cambiada: ${SCENE_NAMES[scene] || scene}`);
    }
  });
});

function updateActiveSceneUI(activeScene) {
  document.querySelectorAll('.btn-scene-select').forEach(btn => {
    const s = btn.getAttribute('data-scene');
    if (s === activeScene) {
      btn.className = 'btn-scene-select p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between gap-2 border-cyber-green bg-cyber-green/10 text-white shadow-[0_0_12px_rgba(0,255,102,0.2)]';
    } else {
      btn.className = 'btn-scene-select p-3 rounded-xl border border-cyber-border bg-cyber-card hover:border-gray-500 text-left transition-all flex flex-col justify-between gap-2 text-gray-300';
    }
  });

  if (currentSceneLabel) {
    currentSceneLabel.textContent = `Escena: ${SCENE_NAMES[activeScene] || activeScene}`;
  }
}

// 3. Recargar Monitor Preview
if (btnReloadMulticamPreview && multicamPreviewIframe) {
  btnReloadMulticamPreview.addEventListener('click', () => {
    multicamPreviewIframe.src = '/multicam?t=' + Date.now();
    showToast('🔄 Monitor OBS Multicam recargado');
  });
}

// 4. Sincronización de Configuración desde el Servidor
socket.on('multicam-settings-updated', (settings) => {
  if (settings) {
    if (settings.activeScene) updateActiveSceneUI(settings.activeScene);
    if (typeof settings.camScale !== 'undefined') updateScaleUI(settings.camScale);
  }
});

// 5. Lista de Participantes en Vivo
socket.on('multicam-admin-peers-updated', ({ peers }) => {
  renderAdminPeersList(peers);
});

socket.on('multicam-peers-updated', ({ peers }) => {
  renderAdminPeersList(peers);
});

function renderAdminPeersList(peers) {
  if (!multicamAdminPeersList) return;

  const validPeers = Array.isArray(peers) ? peers.filter(p => p.role !== 'overlay') : [];
  const count = validPeers.length;

  // Actualizar badges
  if (multicamPeersBadge) multicamPeersBadge.textContent = `${count} ${count === 1 ? 'conectado' : 'conectados'}`;
  if (multicamOnlineCount) multicamOnlineCount.textContent = `${count} PARTICIPANTES`;
  if (labelMulticamActiveCount) labelMulticamActiveCount.textContent = `${count} en llamada`;
  if (navBadgeMulticamCount) {
    if (count > 0) {
      navBadgeMulticamCount.textContent = count;
      navBadgeMulticamCount.classList.remove('hidden');
    } else {
      navBadgeMulticamCount.classList.add('hidden');
    }
  }

  if (count === 0) {
    multicamAdminPeersList.innerHTML = `
      <div id="multicam-peers-empty" class="p-8 text-center bg-cyber-card/40 border border-dashed border-cyber-border rounded-xl space-y-3">
        <div class="w-12 h-12 rounded-full bg-cyber-green/10 border border-cyber-green/40 flex items-center justify-center text-cyber-green mx-auto">
          <i data-lucide="video-off" class="w-6 h-6"></i>
        </div>
        <div>
          <p class="text-sm font-chakra font-bold text-gray-300">Aún no hay participantes en la sala</p>
          <p class="text-xs text-gray-500 mt-0.5">Envía el enlace de invitados o abre una pestaña para probar.</p>
        </div>
        <a href="/guest" target="_blank" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyber-green/20 border border-cyber-green/60 text-cyber-green text-xs font-chakra font-bold hover:bg-cyber-green hover:text-black transition-all">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Entrar como Invitado de Prueba
        </a>
      </div>
    `;
    refreshIcons();
    return;
  }

  // Generador de gradiente para iniciales
  function getInitialsGradient(name) {
    const list = [
      'linear-gradient(135deg, #10b981, #047857)',
      'linear-gradient(135deg, #06b6d4, #0e7490)',
      'linear-gradient(135deg, #8b5cf6, #5b21b6)',
      'linear-gradient(135deg, #f59e0b, #b45309)',
      'linear-gradient(135deg, #ec4899, #be185d)'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return list[Math.abs(hash) % list.length];
  }

  let html = '';
  validPeers.forEach(peer => {
    const initials = peer.initials || 'IN';
    const isHidden = !!peer.isHidden;
    const isStreamMuted = !!peer.isStreamMuted;
    const isHost = !!(peer.isHost || peer.role === 'host');
    const gradient = getInitialsGradient(peer.name);

    html += `
      <div class="bg-cyber-card border ${isHost ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : (isHidden ? 'border-cyber-border/40 opacity-75' : 'border-cyber-border')} rounded-xl p-3.5 space-y-3 shadow-md transition-all hover:border-cyan-400/50">
        <!-- Fila Superior: Avatar + Info Usuario + Badges -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-full border-2 ${isHost ? 'border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : (peer.hasAudio ? 'border-cyber-green' : 'border-cyber-border')} flex items-center justify-center font-chakra font-bold text-sm text-white shrink-0 overflow-hidden shadow-inner relative" style="background: ${peer.photo ? 'none' : gradient}">
              ${peer.photo ? `<img src="${peer.photo}" class="w-full h-full object-cover" alt="${peer.name}">` : `<span>${initials}</span>`}
              ${isStreamMuted ? '<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[8px]" title="Silenciado en Stream OBS">🔇</span>' : ''}
              ${isHost ? '<span class="absolute top-0 right-0 w-4 h-4 rounded-full bg-cyan-400 border border-black flex items-center justify-center text-[9px]" title="Anfitrión / Streamer">👑</span>' : ''}
            </div>

            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-sm font-chakra font-bold text-white truncate max-w-[150px] sm:max-w-[200px]">${peer.name || 'Invitado'}</h4>
                ${isHost ? `<span class="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 text-[9px] font-mono font-bold">👑 ANFITRIÓN (SIN ECO)</span>` : ''}
                ${isHidden ? `<span class="px-1.5 py-0.5 rounded bg-cyber-red/20 text-cyber-red text-[9px] font-mono font-bold">OCULTO EN OBS</span>` : ''}
                ${isStreamMuted ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-mono font-bold">MUTE EN STREAM</span>` : ''}
              </div>
              <div class="flex items-center gap-2 text-[11px] font-mono text-gray-400 mt-0.5 flex-wrap">
                <span class="flex items-center gap-1 ${peer.hasVideo ? 'text-cyber-green' : 'text-yellow-500'}">
                  <i data-lucide="${peer.hasVideo ? 'video' : 'video-off'}" class="w-3 h-3"></i> ${peer.hasVideo ? 'Cámara' : 'Sin Video'}
                </span>
                <span>&bull;</span>
                <span class="flex items-center gap-1 ${peer.hasAudio ? 'text-cyber-green' : 'text-cyber-red'}">
                  <i data-lucide="${peer.hasAudio ? 'mic' : 'mic-off'}" class="w-3 h-3"></i> ${peer.hasAudio ? 'Mic ON' : 'Muteado'}
                </span>
                ${peer.clientIp ? `<span>&bull;</span><span class="text-gray-500 font-mono" title="IP del participante">IP: ${peer.clientIp}</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Fila Inferior: Botones de Control de Audio, Video y Moderación -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-cyber-border/60">
          
          <!-- 0. Designar / Quitar Anfitrión (Host) -->
          <button type="button" onclick="toggleHostPeer('${peer.id}', ${!isHost})" class="px-2 py-1.5 rounded-lg border text-xs font-chakra font-bold flex items-center justify-center gap-1.5 transition-all ${isHost ? 'bg-cyan-500 text-black border-cyan-400 font-extrabold shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'}" title="${isHost ? 'Quitar rol de anfitrión' : 'Asignar como Anfitrión (elimina su eco en OBS)'}">
            <span>👑</span>
            <span class="truncate">${isHost ? 'Es Host' : 'Hacer Host'}</span>
          </button>

          <!-- 1. Mute en Stream (OBS) pero en la llamada privada sí se escucha -->
          <button type="button" onclick="toggleStreamMute('${peer.id}', ${!isStreamMuted})" class="px-2 py-1.5 rounded-lg border text-xs font-chakra font-bold flex items-center justify-center gap-1.5 transition-all ${isStreamMuted ? 'bg-amber-500/20 border-amber-500 text-amber-300 hover:bg-amber-500/30' : 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/20'}" title="${isStreamMuted ? 'Hacer sonar en Stream OBS' : 'Silenciar en Stream OBS (pero seguir oyendo en la sala privada)'}">
            <i data-lucide="${isStreamMuted ? 'volume-x' : 'volume-2'}" class="w-3.5 h-3.5"></i>
            <span class="truncate">${isStreamMuted ? 'Mudo Stream' : 'Audio Stream'}</span>
          </button>

          <!-- 2. Silenciar Micrófono General (Mute en toda la llamada) -->
          <button type="button" onclick="forceMutePeer('${peer.id}', '${escapeHtml(peer.name)}')" class="px-2 py-1.5 rounded-lg border text-xs font-chakra font-bold flex items-center justify-center gap-1.5 transition-all ${peer.hasAudio ? 'bg-cyber-card border-cyber-border text-gray-300 hover:border-yellow-500 hover:text-yellow-400' : 'bg-cyber-red/20 border-cyber-red text-cyber-red'}" title="Silenciar micrófono de este participante en toda la llamada">
            <i data-lucide="mic-off" class="w-3.5 h-3.5"></i>
            <span class="truncate">${peer.hasAudio ? 'Mute Mic' : 'Mic OFF'}</span>
          </button>

          <!-- 3. Toggle Cámara en OBS (Ocultar/Mostrar) -->
          <button type="button" onclick="togglePeerVisibility('${peer.id}', ${!isHidden})" class="px-2 py-1.5 rounded-lg border text-xs font-chakra font-bold flex items-center justify-center gap-1.5 transition-all ${isHidden ? 'bg-cyber-card border-cyber-border text-gray-400 hover:text-white' : 'bg-cyber-green/10 border-cyber-green text-cyber-green hover:bg-cyber-green hover:text-black'}" title="${isHidden ? 'Mostrar cámara en OBS' : 'Ocultar cámara en OBS'}">
            <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
            <span class="truncate">${isHidden ? 'Oculta' : 'Visible'}</span>
          </button>

          <!-- 4. Acciones de Moderación: Expulsar y Banear IP -->
          <div class="flex items-center gap-1">
            <button type="button" onclick="kickMulticamPeer('${peer.id}', '${escapeHtml(peer.name)}')" class="flex-1 px-2 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600 hover:text-white text-xs font-chakra font-bold flex items-center justify-center gap-1 transition-all" title="Expulsar de la llamada">
              <i data-lucide="door-open" class="w-3.5 h-3.5"></i>
              <span>Kick</span>
            </button>

            <button type="button" onclick="banPeerIp('${peer.id}', '${escapeHtml(peer.name)}', '${peer.clientIp || ''}')" class="px-2.5 py-1.5 rounded-lg bg-red-950 border border-red-600 text-red-400 hover:bg-red-600 hover:text-white text-xs font-chakra font-bold flex items-center justify-center gap-1 transition-all" title="Expulsar y Banear por IP">
              <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>
              <span>Ban</span>
            </button>
          </div>

        </div>
      </div>
    `;
  });

  multicamAdminPeersList.innerHTML = html;
  refreshIcons();
}

// 0. Designar / Quitar Anfitrión (Host)
window.toggleHostPeer = function(peerId, isHost) {
  socket.emit('multicam-set-host', {
    roomId: 'main',
    peerId: peerId,
    isHost: isHost
  });
  showToast(isHost ? '👑 Asignado como Host (Audio desactivado en OBS para evitar eco)' : 'Rol de Host retirado');
};

// 1. Alternar Mute en Stream (pero en sala se sigue escuchando)
window.toggleStreamMute = function(peerId, isMuted) {
  socket.emit('multicam-toggle-stream-mute', {
    roomId: 'main',
    peerId: peerId,
    isStreamMuted: isMuted
  });
  showToast(isMuted ? '🔇 Invitado silenciado en Stream (sigue en la llamada)' : '🔊 Audio del invitado activo en Stream');
};

// 2. Forzar silenciado de micrófono en la llamada
window.forceMutePeer = function(peerId, name) {
  socket.emit('multicam-force-mute-peer', {
    roomId: 'main',
    peerId: peerId
  });
  showToast(`🔇 Micrófono silenciado para ${name}`);
};

// 3. Alternar visibilidad de cámara en OBS
window.togglePeerVisibility = function(peerId, isHidden) {
  socket.emit('multicam-toggle-peer-visibility', {
    roomId: 'main',
    peerId: peerId,
    isHidden: isHidden
  });
  showToast(isHidden ? '👁️ Cámara ocultada en OBS' : '👁️ Cámara visible en OBS');
};

// 4. Expulsar de la sala (Kick)
window.kickMulticamPeer = function(peerId, name) {
  if (confirm(`¿Expulsar a "${name}" de la sala de videollamada?`)) {
    socket.emit('multicam-kick-peer', {
      roomId: 'main',
      peerId: peerId
    });
    showToast(`🚫 Participante expulsado: ${name}`);
  }
};

// 5. Banear por IP
window.banPeerIp = function(peerId, name, ip) {
  const msg = ip 
    ? `¿EXPULSAR Y BANEAR a "${name}" por IP?\n\nIP: ${ip}\n\nEl participante no podrá volver a ingresar a ninguna sala.`
    : `¿EXPULSAR Y BANEAR a "${name}"?\n\nSu IP será bloqueada automáticamente.`;
  
  if (confirm(msg)) {
    socket.emit('multicam-ban-peer', {
      roomId: 'main',
      peerId: peerId
    });
    showToast(`⛔ Participante baneado por IP: ${name}`);
  }
};

// ============================================================
// GESTIÓN DE IPS BANEADAS (MODAL Y DESBANEO)
// ============================================================
let currentBannedIps = [];
const btnOpenBannedIps = document.getElementById('btn-open-banned-ips');
const btnCloseBannedIpsModal = document.getElementById('btn-close-banned-ips-modal');
const modalBannedIps = document.getElementById('modal-banned-ips');
const bannedIpsCountBadge = document.getElementById('banned-ips-count');
const bannedIpsTotalBadge = document.getElementById('banned-ips-total-badge');
const bannedIpsListContainer = document.getElementById('banned-ips-list-container');
const inputManualBanIp = document.getElementById('input-manual-ban-ip');
const btnManualBanIp = document.getElementById('btn-manual-ban-ip');

function renderBannedIpsList(ips) {
  currentBannedIps = Array.isArray(ips) ? ips : [];
  const count = currentBannedIps.length;
  
  if (bannedIpsCountBadge) bannedIpsCountBadge.textContent = count;
  if (bannedIpsTotalBadge) bannedIpsTotalBadge.textContent = `${count} registradas`;

  if (!bannedIpsListContainer) return;

  if (count === 0) {
    bannedIpsListContainer.innerHTML = `
      <div class="p-4 text-center bg-black/40 border border-cyber-border/60 rounded-xl text-gray-500 font-chakra">
        No hay ninguna dirección IP bloqueada actualmente
      </div>
    `;
    return;
  }

  let html = '';
  currentBannedIps.forEach(ip => {
    html += `
      <div class="flex items-center justify-between gap-3 p-2.5 bg-black/60 border border-red-500/30 rounded-lg">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-red-500"></span>
          <span class="font-mono text-xs text-white">${escapeHtml(ip)}</span>
        </div>
        <button type="button" onclick="unbanIp('${escapeHtml(ip)}')" class="px-2.5 py-1 rounded bg-cyber-card border border-cyber-border hover:border-cyber-green text-gray-300 hover:text-cyber-green font-chakra font-bold text-[11px] transition-all flex items-center gap-1">
          <i data-lucide="unlock" class="w-3 h-3"></i>
          <span>Desbloquear</span>
        </button>
      </div>
    `;
  });

  bannedIpsListContainer.innerHTML = html;
  refreshIcons();
}

window.unbanIp = function(ip) {
  if (confirm(`¿Desbloquear la IP "${ip}"? Podrá volver a ingresar a las llamadas.`)) {
    socket.emit('multicam-unban-ip', { ip });
    showToast(`✅ IP desbloqueada: ${ip}`);
  }
};

socket.on('multicam-banned-ips-updated', ({ bannedIps }) => {
  renderBannedIpsList(bannedIps);
});

if (btnOpenBannedIps) {
  btnOpenBannedIps.addEventListener('click', () => {
    socket.emit('multicam-get-banned-ips', ({ bannedIps }) => {
      renderBannedIpsList(bannedIps);
    });
    if (modalBannedIps) {
      modalBannedIps.classList.remove('hidden');
      modalBannedIps.classList.add('flex');
    }
    refreshIcons();
  });
}

if (btnCloseBannedIpsModal) {
  btnCloseBannedIpsModal.addEventListener('click', () => {
    if (modalBannedIps) {
      modalBannedIps.classList.add('hidden');
      modalBannedIps.classList.remove('flex');
    }
  });
}

if (modalBannedIps) {
  modalBannedIps.addEventListener('click', (e) => {
    if (e.target === modalBannedIps) {
      modalBannedIps.classList.add('hidden');
      modalBannedIps.classList.remove('flex');
    }
  });
}

if (btnManualBanIp && inputManualBanIp) {
  btnManualBanIp.addEventListener('click', () => {
    const ip = inputManualBanIp.value.trim();
    if (!ip) return;
    socket.emit('multicam-unban-ip', { ip: '__none__' });
    inputManualBanIp.value = '';
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Inicialización
if (multicamGuestLink) multicamGuestLink.value = window.location.origin + '/guest';
if (multicamObsLink) multicamObsLink.value = window.location.origin + '/overlay';
loadFromLocalStorage();
updateSelectOptions();
renderPresentersGrid();
const savedTab = localStorage.getItem('birraverde_active_tab') || 'main';
switchMainTab(savedTab);
setTimeout(adjustPreviewScale, 100);
refreshIcons();