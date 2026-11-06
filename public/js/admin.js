// admin.js - Manejo con Soporte para Preparación (Queue / Preview)
const socket = io();

// Conexión
const socketDot = document.getElementById('socket-dot');
const socketDotMobile = document.getElementById('socket-dot-mobile');
const socketStatus = document.getElementById('socket-status');

// Escala y Auto-hide
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

// Deck de presentadores y Modales
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
const formPlatform = document.getElementById('form-platform');
const formHandle = document.getElementById('form-handle');
const formRole = document.getElementById('form-role');
const formAccentColor = document.getElementById('form-accent-color');
const formDefaultSide = document.getElementById('form-default-side');

// Modal OBS
const obsModal = document.getElementById('obs-modal');
const btnCloseObsModal = document.getElementById('btn-close-obs-modal');
const obsUrlInput = document.getElementById('obs-url-input');
const btnCopyUrlInside = document.getElementById('btn-copy-url-inside');

// Estado local
let presentersList = [];
let currentLiveState = {
  left: { isVisible: false, presenter: null },
  right: { isVisible: false, presenter: null },
  queue: { left: null, right: null },
  scale: 65
};
let currentAutoHide = 0;

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

// Selector de Tamaño (Escala)
scalePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.scale-btn');
  if (!btn) return;
  const scale = parseInt(btn.dataset.scale, 10);
  socket.emit('set-scale', scale);

  document.querySelectorAll('.scale-btn').forEach(b => {
    b.className = 'scale-btn px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-white whitespace-nowrap transition-all';
  });
  btn.className = 'scale-btn px-2.5 py-1 rounded text-[11px] font-bold bg-cyber-green text-black whitespace-nowrap transition-all';
});

// Selector de Auto-Ocultar
autohidePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.autohide-btn');
  if (!btn) return;
  currentAutoHide = parseInt(btn.dataset.sec, 10);

  document.querySelectorAll('.autohide-btn').forEach(b => {
    b.className = 'autohide-btn px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-white whitespace-nowrap transition-all';
  });
  btn.className = 'autohide-btn px-2.5 py-1 rounded text-[11px] font-bold bg-cyber-green text-black whitespace-nowrap transition-all';
});

// Presets de colores
document.querySelectorAll('.preset-color').forEach(btn => {
  btn.addEventListener('click', () => {
    formAccentColor.value = btn.dataset.color;
  });
});

// Sockets
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

socket.on('state-update', (state) => {
  if (!state) return;
  currentLiveState = state;

  // Escala
  if (state.scale) {
    document.querySelectorAll('.scale-btn').forEach(b => {
      const match = parseInt(b.dataset.scale, 10) === state.scale;
      b.className = match
        ? 'scale-btn px-2.5 py-1 rounded text-[11px] font-bold bg-cyber-green text-black whitespace-nowrap transition-all'
        : 'scale-btn px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-white whitespace-nowrap transition-all';
    });
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

  renderPresentersGrid();
});

socket.on('presenters-updated', (list) => {
  presentersList = list || [];
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
    socket.emit('prepare-slot', { slot: 'left', presenter: p });
  }
});

selectQueueRight.addEventListener('change', (e) => {
  const id = e.target.value;
  if (!id) return;
  const p = presentersList.find(x => x.id === id);
  if (p) {
    socket.emit('prepare-slot', { slot: 'right', presenter: p });
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

// Renderizar Deck de Presentadores
function renderPresentersGrid() {
  presentersGrid.innerHTML = '';

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

    let platLabel = (p.platform || 'kick').toUpperCase();
    let platColor = 'border-cyber-green/40 text-cyber-green bg-cyber-green/10';
    if (p.platform === 'twitch') platColor = 'border-purple-500/40 text-purple-400 bg-purple-500/10';
    if (p.platform === 'youtube') platColor = 'border-red-500/40 text-red-400 bg-red-500/10';
    if (p.platform === 'x') platColor = 'border-white/40 text-white bg-white/10';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded border font-mono font-bold ${platColor}">
              ${platLabel}
            </span>
            <span class="text-xs text-gray-400 font-mono">${p.handle || ''}</span>
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
      socket.emit('prepare-slot', { slot: 'left', presenter: p });
    });

    const btnQRight = card.querySelector('.btn-queue-right');
    btnQRight.addEventListener('click', () => {
      socket.emit('prepare-slot', { slot: 'right', presenter: p });
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
      if (confirm(`¿Eliminar a "${p.name}"?`)) {
        socket.emit('delete-presenter', p.id);
      }
    });

    presentersGrid.appendChild(card);
  });

  refreshIcons();
}

// Modal
function openCreateModal() {
  modalTitle.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-cyber-green"></i> CREAR NUEVO PRESENTADOR`;
  formId.value = '';
  formName.value = '';
  formNick.value = '';
  formPlatform.value = 'kick';
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
  formPlatform.value = p.platform || 'kick';
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
    platform: formPlatform.value,
    platformName: formPlatform.options[formPlatform.selectedIndex].text,
    handle: formHandle.value.trim(),
    role: formRole.value.trim().toUpperCase(),
    accentColor: formAccentColor.value,
    defaultSide: formDefaultSide.value
  };

  socket.emit('save-presenter', presenterData);
  closeModal();
});

// Modal OBS
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

setTimeout(adjustPreviewScale, 100);
refreshIcons();
