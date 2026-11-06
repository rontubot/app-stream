// admin.js - Manejo interactivo dual del Panel de Host
const socket = io();

// Conexión
const socketDot = document.getElementById('socket-dot');
const socketStatus = document.getElementById('socket-status');

// Escala y Auto-hide
const scalePills = document.getElementById('scale-pills');
const autohidePills = document.getElementById('autohide-pills');
const btnShowBoth = document.getElementById('btn-show-both');
const btnHideBoth = document.getElementById('btn-hide-both');

// Slot Izquierdo DOM
const badgeLeft = document.getElementById('badge-left');
const dotLeft = document.getElementById('dot-left');
const textLeft = document.getElementById('text-left');
const nameLeft = document.getElementById('name-left');
const nickLeft = document.getElementById('nick-left');
const handleLeft = document.getElementById('handle-left');
const btnShowLeft = document.getElementById('btn-show-left');
const btnHideLeft = document.getElementById('btn-hide-left');

// Slot Derecho DOM
const badgeRight = document.getElementById('badge-right');
const dotRight = document.getElementById('dot-right');
const textRight = document.getElementById('text-right');
const nameRight = document.getElementById('name-right');
const nickRight = document.getElementById('nick-right');
const handleRight = document.getElementById('handle-right');
const btnShowRight = document.getElementById('btn-show-right');
const btnHideRight = document.getElementById('btn-hide-right');

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

// Campos de formulario
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
let assignedLeft = null;
let assignedRight = null;
let currentLiveState = {
  left: { isVisible: false, presenter: null },
  right: { isVisible: false, presenter: null },
  scale: 65
};
let currentAutoHide = 0;

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function adjustPreviewScale() {
  if (!previewContainer) return;
  const parentWidth = previewContainer.parentElement.clientWidth;
  const scale = parentWidth / 1920;
  previewContainer.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', adjustPreviewScale);

// Selector de Tamaño (Escala)
scalePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.scale-btn');
  if (!btn) return;
  const scale = parseInt(btn.dataset.scale, 10);
  socket.emit('set-scale', scale);

  document.querySelectorAll('.scale-btn').forEach(b => {
    b.className = 'scale-btn px-2.5 py-1 rounded font-medium text-gray-400 hover:text-white transition-all';
  });
  btn.className = 'scale-btn px-2.5 py-1 rounded font-bold transition-all bg-cyber-green text-black';
});

// Selector de Auto-Ocultar
autohidePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.autohide-btn');
  if (!btn) return;
  currentAutoHide = parseInt(btn.dataset.sec, 10);

  document.querySelectorAll('.autohide-btn').forEach(b => {
    b.className = 'autohide-btn px-2.5 py-1 rounded font-medium text-gray-400 hover:text-white transition-all';
  });
  btn.className = 'autohide-btn px-2.5 py-1 rounded font-bold transition-all bg-cyber-green text-black';
});

// Presets de colores en modal
document.querySelectorAll('.preset-color').forEach(btn => {
  btn.addEventListener('click', () => {
    formAccentColor.value = btn.dataset.color;
  });
});

// Socket connection
socket.on('connect', () => {
  socketDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-pulse';
  socketStatus.textContent = 'En Línea';
  socketStatus.className = 'text-cyber-green font-semibold';
});

socket.on('disconnect', () => {
  socketDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
  socketStatus.textContent = 'Desconectado';
  socketStatus.className = 'text-red-400 font-semibold';
});

socket.on('state-update', (state) => {
  if (!state) return;
  currentLiveState = state;

  // Actualizar botones de escala si coincide
  if (state.scale) {
    document.querySelectorAll('.scale-btn').forEach(b => {
      const match = parseInt(b.dataset.scale, 10) === state.scale;
      b.className = match
        ? 'scale-btn px-2.5 py-1 rounded font-bold transition-all bg-cyber-green text-black'
        : 'scale-btn px-2.5 py-1 rounded font-medium text-gray-400 hover:text-white transition-all';
    });
  }

  // Estado Slot Izquierdo
  if (state.left && state.left.isVisible && state.left.presenter) {
    assignedLeft = state.left.presenter;
    badgeLeft.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/50 text-[11px] font-bold font-chakra uppercase shadow-[0_0_10px_rgba(0,255,102,0.3)]';
    dotLeft.className = 'w-2 h-2 rounded-full bg-cyber-green animate-ping';
    textLeft.textContent = 'EN PANTALLA';
  } else {
    badgeLeft.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-[11px] font-bold font-chakra uppercase';
    dotLeft.className = 'w-2 h-2 rounded-full bg-gray-500';
    textLeft.textContent = 'OFF AIR';
  }

  // Estado Slot Derecho
  if (state.right && state.right.isVisible && state.right.presenter) {
    assignedRight = state.right.presenter;
    badgeRight.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/50 text-[11px] font-bold font-chakra uppercase shadow-[0_0_10px_rgba(145,70,255,0.3)]';
    dotRight.className = 'w-2 h-2 rounded-full bg-purple-400 animate-ping';
    textRight.textContent = 'EN PANTALLA';
  } else {
    badgeRight.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-[11px] font-bold font-chakra uppercase';
    dotRight.className = 'w-2 h-2 rounded-full bg-gray-500';
    textRight.textContent = 'OFF AIR';
  }

  updateAssignedSlotsUI();
  renderPresentersGrid();
});

socket.on('presenters-updated', (list) => {
  presentersList = list || [];
  if (!assignedLeft && presentersList.length > 0) {
    assignedLeft = presentersList[0];
  }
  if (!assignedRight && presentersList.length > 1) {
    assignedRight = presentersList[1];
  } else if (!assignedRight && presentersList.length > 0) {
    assignedRight = presentersList[0];
  }

  updateAssignedSlotsUI();
  renderPresentersGrid();
});

function updateAssignedSlotsUI() {
  if (assignedLeft) {
    nameLeft.textContent = assignedLeft.name || 'PRESENTER';
    nickLeft.textContent = assignedLeft.nickname || '';
    handleLeft.textContent = assignedLeft.handle || '';
  }
  if (assignedRight) {
    nameRight.textContent = assignedRight.name || 'PRESENTER';
    nickRight.textContent = assignedRight.nickname || '';
    handleRight.textContent = assignedRight.handle || '';
  }
}

// Botones de control Izquierda
btnShowLeft.addEventListener('click', () => {
  if (assignedLeft) {
    socket.emit('show-slot', {
      slot: 'left',
      presenter: assignedLeft,
      autoHideSeconds: currentAutoHide
    });
  }
});

btnHideLeft.addEventListener('click', () => {
  socket.emit('hide-slot', 'left');
});

// Botones de control Derecha
btnShowRight.addEventListener('click', () => {
  if (assignedRight) {
    socket.emit('show-slot', {
      slot: 'right',
      presenter: assignedRight,
      autoHideSeconds: currentAutoHide
    });
  }
});

btnHideRight.addEventListener('click', () => {
  socket.emit('hide-slot', 'right');
});

// Botones Mostrar / Ocultar Ambos
btnShowBoth.addEventListener('click', () => {
  socket.emit('show-both', {
    leftPresenter: assignedLeft,
    rightPresenter: assignedRight,
    autoHideSeconds: currentAutoHide
  });
});

btnHideBoth.addEventListener('click', () => {
  socket.emit('hide-all');
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

    const card = document.createElement('div');
    card.className = `bg-cyber-dark border rounded-xl p-4 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg ${
      isLiveLeft || isLiveRight
        ? 'border-cyber-green ring-2 ring-cyber-green/40 shadow-[0_0_15px_rgba(0,255,102,0.2)]'
        : 'border-cyber-border hover:border-gray-600'
    }`;

    // Tag badge de plataforma
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

          <!-- Badges de estado en vivo -->
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

      <!-- Botones de Lanzamiento Específicos para Izquierda y Derecha -->
      <div class="pt-3 border-t border-cyber-border/70 space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <!-- Botón Lanzar Izquierda -->
          <button class="btn-launch-left py-1.5 px-2 rounded-lg font-chakra font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
            isLiveLeft
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white'
              : 'bg-cyber-green/20 text-cyber-green border border-cyber-green/40 hover:bg-cyber-green hover:text-black'
          }">
            <i data-lucide="${isLiveLeft ? 'square' : 'arrow-left'}" class="w-3.5 h-3.5"></i>
            <span>${isLiveLeft ? 'Ocultar Izq' : '👈 Lanzar Izq'}</span>
          </button>

          <!-- Botón Lanzar Derecha -->
          <button class="btn-launch-right py-1.5 px-2 rounded-lg font-chakra font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
            isLiveRight
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white'
              : 'bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500 hover:text-white'
          }">
            <span>${isLiveRight ? 'Ocultar Der' : 'Lanzar Der 👉'}</span>
            <i data-lucide="${isLiveRight ? 'square' : 'arrow-right'}" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <!-- Botones Auxiliares: Editar / Eliminar -->
        <div class="flex items-center justify-end gap-1.5 text-xs">
          <button class="btn-card-edit px-2 py-1 rounded bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-300 hover:text-white flex items-center gap-1">
            <i data-lucide="edit-3" class="w-3 h-3"></i> Editar
          </button>
          <button class="btn-card-delete px-2 py-1 rounded bg-cyber-card border border-cyber-border hover:border-red-500 hover:text-red-400 text-gray-400 flex items-center gap-1">
            <i data-lucide="trash-2" class="w-3 h-3"></i> Eliminar
          </button>
        </div>
      </div>
    `;

    // Listeners
    const btnLaunchLeft = card.querySelector('.btn-launch-left');
    btnLaunchLeft.addEventListener('click', () => {
      if (isLiveLeft) {
        socket.emit('hide-slot', 'left');
      } else {
        assignedLeft = p;
        updateAssignedSlotsUI();
        socket.emit('show-slot', {
          slot: 'left',
          presenter: p,
          autoHideSeconds: currentAutoHide
        });
      }
    });

    const btnLaunchRight = card.querySelector('.btn-launch-right');
    btnLaunchRight.addEventListener('click', () => {
      if (isLiveRight) {
        socket.emit('hide-slot', 'right');
      } else {
        assignedRight = p;
        updateAssignedSlotsUI();
        socket.emit('show-slot', {
          slot: 'right',
          presenter: p,
          autoHideSeconds: currentAutoHide
        });
      }
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

// Modal Crear / Editar
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
