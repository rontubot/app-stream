// admin.js - Lógica interactiva del Panel de Control del Host
const socket = io();

// Elementos DOM
const socketBadge = document.getElementById('socket-badge');
const socketDot = document.getElementById('socket-dot');
const socketStatus = document.getElementById('socket-status');

const liveIndicatorBadge = document.getElementById('live-indicator-badge');
const liveDot = document.getElementById('live-dot');
const liveText = document.getElementById('live-text');

const liveAvatar = document.getElementById('live-avatar');
const liveName = document.getElementById('live-name');
const liveNick = document.getElementById('live-nick');
const liveRole = document.getElementById('live-role');
const liveSub = document.getElementById('live-sub');

const btnMasterShow = document.getElementById('btn-master-show');
const btnMasterHide = document.getElementById('btn-master-hide');
const autohidePills = document.getElementById('autohide-pills');
const btnCopyObs = document.getElementById('btn-copy-obs');
const btnRefreshPreview = document.getElementById('btn-refresh-preview');
const previewIframe = document.getElementById('preview-iframe');
const previewContainer = document.getElementById('preview-container');

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
const formPosition = document.getElementById('form-position');
const formAnimation = document.getElementById('form-animation');

// Modal OBS
const obsModal = document.getElementById('obs-modal');
const btnCloseObsModal = document.getElementById('btn-close-obs-modal');
const obsUrlInput = document.getElementById('obs-url-input');
const btnCopyUrlInside = document.getElementById('btn-copy-url-inside');

// Estado local
let presentersList = [];
let currentLiveState = {
  isVisible: false,
  activePresenter: null,
  autoHideSeconds: 0
};
let selectedPresenter = null;
let currentAutoHide = 0; // 0 = Manual

// Inicializar Lucide Icons
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Redimensionar preview iframe
function adjustPreviewScale() {
  if (!previewContainer) return;
  const parentWidth = previewContainer.parentElement.clientWidth;
  const scale = parentWidth / 1920;
  previewContainer.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', adjustPreviewScale);

// Auto-hide selector
autohidePills.addEventListener('click', (e) => {
  const btn = e.target.closest('.autohide-btn');
  if (!btn) return;
  const sec = parseInt(btn.dataset.sec, 10);
  currentAutoHide = sec;

  document.querySelectorAll('.autohide-btn').forEach(b => {
    b.className = 'autohide-btn px-2.5 py-1 rounded font-medium text-gray-400 hover:text-white transition-all';
  });
  btn.className = 'autohide-btn px-2.5 py-1 rounded font-bold transition-all bg-cyber-green text-black';
});

// Selector de colores presets en modal
document.querySelectorAll('.preset-color').forEach(btn => {
  btn.addEventListener('click', () => {
    formAccentColor.value = btn.dataset.color;
  });
});

// Socket Events
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
  currentLiveState = state;
  updateLiveStateUI();
});

socket.on('presenters-updated', (list) => {
  presentersList = list || [];
  renderPresentersGrid();

  // Si no hay presentador seleccionado, elegir el primero
  if (!selectedPresenter && presentersList.length > 0) {
    selectPresenter(presentersList[0]);
  } else if (selectedPresenter) {
    const updated = presentersList.find(p => p.id === selectedPresenter.id);
    if (updated) selectedPresenter = updated;
    updateSelectedPresenterUI();
  }
});

// Actualizar UI del estado en vivo
function updateLiveStateUI() {
  if (currentLiveState.isVisible && currentLiveState.activePresenter) {
    liveIndicatorBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/60 text-xs font-bold uppercase tracking-wider font-chakra shadow-[0_0_15px_rgba(0,255,102,0.3)]';
    liveDot.className = 'w-2 h-2 rounded-full bg-cyber-green animate-ping';
    liveText.textContent = 'EN PANTALLA (ON AIR)';

    liveSub.textContent = 'EMITIENDO EN VIVO AHORA';
    liveSub.className = 'text-xs text-cyber-green font-bold uppercase tracking-wider font-chakra animate-pulse';

    selectPresenter(currentLiveState.activePresenter, false);
  } else {
    liveIndicatorBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700 text-xs font-bold uppercase tracking-wider font-chakra';
    liveDot.className = 'w-2 h-2 rounded-full bg-gray-500';
    liveText.textContent = 'OFF AIR (Oculto)';

    liveSub.textContent = 'Seleccionado para emisión';
    liveSub.className = 'text-xs text-gray-400 uppercase tracking-wider font-chakra';
  }
  renderPresentersGrid();
}

function selectPresenter(p, updateGlobal = true) {
  if (!p) return;
  selectedPresenter = p;
  updateSelectedPresenterUI();
  if (updateGlobal) {
    renderPresentersGrid();
  }
}

function updateSelectedPresenterUI() {
  if (!selectedPresenter) return;

  const initials = (selectedPresenter.name || 'P')
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  liveAvatar.textContent = initials;
  liveAvatar.style.borderColor = selectedPresenter.accentColor || '#00ff66';
  liveAvatar.style.color = selectedPresenter.accentColor || '#00ff66';

  liveName.innerHTML = `
    ${selectedPresenter.name || 'PRESENTER'}
    <span class="font-bold text-sm" style="color: ${selectedPresenter.accentColor || '#00ff66'};">${selectedPresenter.nickname || ''}</span>
  `;
  liveRole.textContent = selectedPresenter.role || selectedPresenter.handle || 'HOST';
}

// Renderizar las tarjetas de presentadores
function renderPresentersGrid() {
  presentersGrid.innerHTML = '';

  presentersList.forEach((p, idx) => {
    const isLiveNow = currentLiveState.isVisible && currentLiveState.activePresenter && currentLiveState.activePresenter.id === p.id;
    const isSelected = selectedPresenter && selectedPresenter.id === p.id;

    const card = document.createElement('div');
    card.className = `bg-cyber-dark border rounded-xl p-5 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg ${
      isLiveNow 
        ? 'border-cyber-green ring-2 ring-cyber-green/50 shadow-[0_0_20px_rgba(0,255,102,0.25)]' 
        : isSelected 
          ? 'border-gray-500 ring-1 ring-gray-400' 
          : 'border-cyber-border hover:border-gray-600'
    }`;

    // Tag badge de plataforma
    let platLabel = (p.platform || 'kick').toUpperCase();
    let platColor = 'border-cyber-green/40 text-cyber-green bg-cyber-green/10';
    if (p.platform === 'twitch') platColor = 'border-purple-500/40 text-purple-400 bg-purple-500/10';
    if (p.platform === 'youtube') platColor = 'border-red-500/40 text-red-400 bg-red-500/10';
    if (p.platform === 'x') platColor = 'border-white/40 text-white bg-white/10';

    card.innerHTML = `
      <!-- Cabecera de la tarjeta -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs px-2.5 py-0.5 rounded-full border font-mono font-bold ${platColor}">
              ${platLabel}
            </span>
            <span class="text-xs text-gray-400 font-mono">${p.handle || ''}</span>
          </div>

          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-full border border-black/40" style="background-color: ${p.accentColor || '#00ff66'};" title="Color de acento"></span>
            ${isLiveNow ? `
              <span class="flex items-center gap-1 text-[11px] font-chakra font-bold text-cyber-green bg-cyber-green/20 px-2 py-0.5 rounded-full border border-cyber-green/50 animate-pulse">
                <span class="w-1.5 h-1.5 rounded-full bg-cyber-green"></span> EN VIVO
              </span>
            ` : `
              <span class="text-[11px] font-mono text-gray-500">#${idx + 1}</span>
            `}
          </div>
        </div>

        <!-- Nombre Principal y Nickname -->
        <div class="mb-3">
          <h4 class="text-xl font-bold font-rajdhani text-white uppercase tracking-wide leading-tight group-hover:text-cyber-green transition-colors">
            ${p.name || 'Sin Nombre'}
          </h4>
          <div class="text-base font-bold font-rajdhani uppercase tracking-wider" style="color: ${p.accentColor || '#00ff66'};">
            ${p.nickname || ''}
          </div>
        </div>

        <!-- Rol y posición -->
        <div class="flex items-center gap-2 text-xs text-gray-400 mb-4">
          <span class="px-2 py-0.5 rounded bg-black/40 border border-cyber-border font-mono">${p.role || 'HOST'}</span>
          <span class="text-gray-600">•</span>
          <span class="capitalize">${(p.position || 'bottom-left').replace('-', ' ')}</span>
        </div>
      </div>

      <!-- Acciones de la Tarjeta -->
      <div class="pt-4 border-t border-cyber-border/70 flex items-center justify-between gap-2">
        <!-- Botón Mostrar / En Vivo -->
        <button class="btn-card-launch flex-1 py-2 px-3 rounded-lg font-chakra font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
          isLiveNow 
            ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white' 
            : 'bg-cyber-green/20 text-cyber-green border border-cyber-green/40 hover:bg-cyber-green hover:text-black shadow-sm'
        }">
          <i data-lucide="${isLiveNow ? 'square' : 'play'}" class="w-3.5 h-3.5 fill-current"></i>
          <span>${isLiveNow ? 'Ocultar' : 'Lanzar al Stream'}</span>
        </button>

        <!-- Botón Editar -->
        <button class="btn-card-edit p-2 rounded-lg bg-cyber-card border border-cyber-border hover:border-gray-500 text-gray-300 hover:text-white transition-all" title="Editar">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>

        <!-- Botón Eliminar -->
        <button class="btn-card-delete p-2 rounded-lg bg-cyber-card border border-cyber-border hover:border-red-500 hover:text-red-400 text-gray-400 transition-all" title="Eliminar">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;

    // Eventos de la tarjeta
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectPresenter(p);
    });

    const btnLaunch = card.querySelector('.btn-card-launch');
    btnLaunch.addEventListener('click', () => {
      if (isLiveNow) {
        socket.emit('hide-presenter');
      } else {
        selectPresenter(p);
        socket.emit('show-presenter', {
          presenter: p,
          autoHideSeconds: currentAutoHide
        });
      }
    });

    const btnEdit = card.querySelector('.btn-card-edit');
    btnEdit.addEventListener('click', () => {
      openEditModal(p);
    });

    const btnDelete = card.querySelector('.btn-card-delete');
    btnDelete.addEventListener('click', () => {
      if (confirm(`¿Seguro que deseas eliminar a "${p.name}"?`)) {
        socket.emit('delete-presenter', p.id);
      }
    });

    presentersGrid.appendChild(card);
  });

  refreshIcons();
}

// Master Controls Click Handlers
btnMasterShow.addEventListener('click', () => {
  if (!selectedPresenter && presentersList.length > 0) {
    selectedPresenter = presentersList[0];
  }
  if (selectedPresenter) {
    socket.emit('show-presenter', {
      presenter: selectedPresenter,
      autoHideSeconds: currentAutoHide
    });
  }
});

btnMasterHide.addEventListener('click', () => {
  socket.emit('hide-presenter');
});

// Refresh Preview iframe
btnRefreshPreview.addEventListener('click', () => {
  previewIframe.src = '/overlay?t=' + Date.now();
});

// Modal Logic: Crear / Editar
function openCreateModal() {
  modalTitle.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-cyber-green"></i> CREAR NUEVO PRESENTADOR`;
  formId.value = '';
  formName.value = '';
  formNick.value = '';
  formPlatform.value = 'kick';
  formHandle.value = '@';
  formRole.value = 'HOST';
  formAccentColor.value = '#00ff66';
  formPosition.value = 'bottom-left';
  formAnimation.value = 'slide-left';

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
  formPosition.value = p.position || 'bottom-left';
  formAnimation.value = p.animation || 'slide-left';

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

// Guardar formulario
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
    position: formPosition.value,
    animation: formAnimation.value
  };

  socket.emit('save-presenter', presenterData);
  selectedPresenter = presenterData;
  updateSelectedPresenterUI();
  closeModal();
});

// Modal OBS & Copiar Link
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

// Teclas Rápidas (Hotkeys)
window.addEventListener('keydown', (e) => {
  // Si está escribiendo en un input, no disparar atajos
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }

  // Barra espaciadora: Alternar Mostrar / Ocultar
  if (e.code === 'Space') {
    e.preventDefault();
    if (currentLiveState.isVisible) {
      socket.emit('hide-presenter');
    } else {
      if (selectedPresenter) {
        socket.emit('show-presenter', {
          presenter: selectedPresenter,
          autoHideSeconds: currentAutoHide
        });
      }
    }
  }

  // Teclas 1 al 9: Lanzar presentador según índice
  if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1;
    if (presentersList[idx]) {
      selectPresenter(presentersList[idx]);
      socket.emit('show-presenter', {
        presenter: presentersList[idx],
        autoHideSeconds: currentAutoHide
      });
    }
  }

  // ESC: Cerrar modales
  if (e.key === 'Escape') {
    closeModal();
    obsModal.classList.add('hidden');
    obsModal.classList.remove('flex');
  }
});

// Ajuste inicial al cargar
setTimeout(adjustPreviewScale, 100);
refreshIcons();
