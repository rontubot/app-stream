// admin.js - Manejo Integral con Persistencia Total (Server + LocalStorage + Backup/Restore)
const socket = io();

// Elementos DOM de Conexión
const socketDot = document.getElementById('socket-dot');
const socketDotMobile = document.getElementById('socket-dot-mobile');
const socketStatus = document.getElementById('socket-status');

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

// Monitor Preview
const previewContainer = document.getElementById('preview-container');
const previewIframe = document.getElementById('preview-iframe');
const btnRefreshPreview = document.getElementById('btn-refresh-preview');
const btnCopyObs = document.getElementById('btn-copy-obs');

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

// Estado local reactivo
let presentersList = [];
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

  saveToLocalStorage();
  renderPresentersGrid();
});

// Lista de presentadores actualizada desde el servidor
socket.on('presenters-updated', (list) => {
  const incoming = list || [];

  // Si el servidor solo tiene 2 default pero el cliente tiene más en localStorage (ej: reinicio en Railway),
  // enviamos los de localStorage al servidor para rehidratarlo sin perder nada.
  const cachedRaw = localStorage.getItem(LS_PRESENTERS_KEY);
  if (cachedRaw) {
    try {
      const cachedList = JSON.parse(cachedRaw);
      if (Array.isArray(cachedList) && cachedList.length > incoming.length) {
        const incomingIds = new Set(incoming.map(p => p.id));
        const missingInServer = cachedList.filter(p => !incomingIds.has(p.id));
        if (missingInServer.length > 0) {
          socket.emit('sync-all-presenters', cachedList);
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  presentersList = incoming;
  saveToLocalStorage();
  updateSelectOptions();
  renderPresentersGrid();
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

// Inicialización
loadFromLocalStorage();
updateSelectOptions();
renderPresentersGrid();
setTimeout(adjustPreviewScale, 100);
refreshIcons();