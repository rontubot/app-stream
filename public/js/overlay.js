// overlay.js - Manejo de Overlays Duales y Escenas de Pantalla Completa
const socket = io();

// Slots de Lower Thirds
const slots = {
  left: {
    el: document.getElementById('slot-left'),
    name: document.querySelector('#slot-left .presenter-name'),
    nick: document.querySelector('#slot-left .presenter-nickname'),
    role: document.querySelector('#slot-left .presenter-role'),
    badge: document.querySelector('#slot-left .platform-badge'),
    handle: document.querySelector('#slot-left .presenter-handle'),
    hideTimeout: null
  },
  right: {
    el: document.getElementById('slot-right'),
    name: document.querySelector('#slot-right .presenter-name'),
    nick: document.querySelector('#slot-right .presenter-nickname'),
    role: document.querySelector('#slot-right .presenter-role'),
    badge: document.querySelector('#slot-right .platform-badge'),
    handle: document.querySelector('#slot-right .presenter-handle'),
    hideTimeout: null
  }
};

// Elementos de Escena Pantalla Completa
const sceneEl = document.getElementById('fullscreen-scene');
const sceneBadge = document.getElementById('scene-badge');
const sceneBadgeText = document.getElementById('scene-badge-text');
const sceneTitle = document.getElementById('scene-title');
const sceneSubtitle = document.getElementById('scene-subtitle');
const sceneTextBlock = document.getElementById('scene-text-block');
const sceneLogoWrapper = document.getElementById('scene-logo-wrapper');
const sceneLaser = document.getElementById('scene-laser');
const sceneRadarGlow = document.getElementById('scene-radar-glow');

let sceneHideTimeout = null;
let sceneTransitionTimer = null;
let sceneCleanupTimer = null;
let isSceneActive = false;
let currentSceneType = null;
let currentSceneTitle = '';
let currentSceneSubtitle = '';

// Elementos de la Tabla VS Boxeo (La Velada del Caos)
const vsOverlay = document.getElementById('vs-box-overlay');
const vsFightTitle = document.getElementById('vs-fight-title');
const vsFightSubtitle = document.getElementById('vs-fight-subtitle');

const vsF1CornerTag = document.getElementById('vs-f1-corner-tag');
const vsF1CornerText = document.getElementById('vs-f1-corner-text');
const vsF1Photo = document.getElementById('vs-f1-photo');
const vsF1Nick = document.getElementById('vs-f1-nick');
const vsF1Name = document.getElementById('vs-f1-name');
const vsF1Wins = document.getElementById('vs-f1-wins');
const vsF1Draws = document.getElementById('vs-f1-draws');
const vsF1Losses = document.getElementById('vs-f1-losses');
const vsF1Weight = document.getElementById('vs-f1-weight');
const vsF1Height = document.getElementById('vs-f1-height');

const vsF2CornerTag = document.getElementById('vs-f2-corner-tag');
const vsF2CornerText = document.getElementById('vs-f2-corner-text');
const vsF2Photo = document.getElementById('vs-f2-photo');
const vsF2Nick = document.getElementById('vs-f2-nick');
const vsF2Name = document.getElementById('vs-f2-name');
const vsF2Wins = document.getElementById('vs-f2-wins');
const vsF2Draws = document.getElementById('vs-f2-draws');
const vsF2Losses = document.getElementById('vs-f2-losses');
const vsF2Weight = document.getElementById('vs-f2-weight');
const vsF2Height = document.getElementById('vs-f2-height');

let vsHideTimeout = null;
let isVsActive = false;

function renderCornerTag(elTag, elText, corner) {
  if (!elTag) return;
  elTag.classList.remove('corner-red', 'corner-blue', 'corner-green', 'corner-gold');

  let c = corner || 'red';
  elTag.classList.add(`corner-${c}`);

  if (elText) {
    if (c === 'red') elText.textContent = 'ESQUINA ROJA';
    else if (c === 'blue') elText.textContent = 'ESQUINA AZUL';
    else if (c === 'green') elText.textContent = 'ESQUINA VERDE';
    else if (c === 'gold') elText.textContent = 'ESQUINA DORADA';
    else elText.textContent = `ESQUINA ${c.toUpperCase()}`;
  }
}

function showVsOverlay(fight) {
  if (!vsOverlay || !fight) return;

  if (vsHideTimeout) {
    clearTimeout(vsHideTimeout);
    vsHideTimeout = null;
  }

  // Título
  if (vsFightTitle) vsFightTitle.textContent = fight.title || 'PELEA ESTELAR';
  if (vsFightSubtitle) vsFightSubtitle.textContent = fight.subtitle || `${fight.category || 'PESO MEDIO'} • ${fight.rounds || '3 ROUNDS'}`;

  // Peleador 1
  const f1 = fight.fighter1 || {};
  if (vsF1Name) vsF1Name.textContent = f1.name || 'PELEADOR 1';
  if (vsF1Nick) vsF1Nick.textContent = f1.nickname ? `“${f1.nickname.replace(/["“”]/g, '')}”` : '';
  if (vsF1Weight) vsF1Weight.textContent = f1.weight || '-- KG';
  if (vsF1Height) vsF1Height.textContent = f1.height || '-- M';
  if (vsF1Photo) vsF1Photo.src = f1.photo || '/assets/boxer-placeholder.svg';
  if (vsF1Wins) vsF1Wins.textContent = f1.record?.wins ?? (f1.wins ?? 0);
  if (vsF1Draws) vsF1Draws.textContent = f1.record?.draws ?? (f1.draws ?? 0);
  if (vsF1Losses) vsF1Losses.textContent = f1.record?.losses ?? (f1.losses ?? 0);
  renderCornerTag(vsF1CornerTag, vsF1CornerText, f1.corner || 'red');

  // Peleador 2
  const f2 = fight.fighter2 || {};
  if (vsF2Name) vsF2Name.textContent = f2.name || 'PELEADOR 2';
  if (vsF2Nick) vsF2Nick.textContent = f2.nickname ? `“${f2.nickname.replace(/["“”]/g, '')}”` : '';
  if (vsF2Weight) vsF2Weight.textContent = f2.weight || '-- KG';
  if (vsF2Height) vsF2Height.textContent = f2.height || '-- M';
  if (vsF2Photo) vsF2Photo.src = f2.photo || '/assets/boxer-placeholder.svg';
  if (vsF2Wins) vsF2Wins.textContent = f2.record?.wins ?? (f2.wins ?? 0);
  if (vsF2Draws) vsF2Draws.textContent = f2.record?.draws ?? (f2.draws ?? 0);
  if (vsF2Losses) vsF2Losses.textContent = f2.record?.losses ?? (f2.losses ?? 0);
  renderCornerTag(vsF2CornerTag, vsF2CornerText, f2.corner || 'blue');

  isVsActive = true;
  vsOverlay.classList.remove('is-exiting');
  vsOverlay.classList.remove('is-active');
  void vsOverlay.offsetWidth; // Reflow para disparar el SLAM de impacto
  vsOverlay.classList.add('is-active');
}

function hideVsOverlay() {
  if (!vsOverlay || !vsOverlay.classList.contains('is-active')) return;

  if (vsHideTimeout) {
    clearTimeout(vsHideTimeout);
    vsHideTimeout = null;
  }

  isVsActive = false;
  vsOverlay.classList.remove('is-active');
  vsOverlay.classList.add('is-exiting');

  vsHideTimeout = setTimeout(() => {
    vsOverlay.classList.remove('is-exiting');
    vsHideTimeout = null;
  }, 480);
}

// Iconos oficiales
const PLATFORM_ICONS = {
  kick: `
    <span class="platform-badge kick-style">
      <svg class="kick-svg" viewBox="0 0 24 24" width="28" height="28" fill="#00ff66">
        <path d="M3 3h4v6h3V6h4v3h-3v6h3v3h-4v-3h-3v6H3V3zm15 3h3v12h-3V6z"/>
      </svg>
      KICK
    </span>
  `,
  twitch: `
    <span class="platform-badge modern-badge twitch-badge">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.149h17.194v11.463zm-3.582-7.343v6.268h-2.149V6.269h2.149zm-5.731 0v6.268H9.851V6.269h2.15z"/>
      </svg>
      TWITCH
    </span>
  `,
  youtube: `
    <span class="platform-badge modern-badge youtube-badge">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      YOUTUBE
    </span>
  `,
  x: `
    <span class="platform-badge modern-badge x-badge">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
      X
    </span>
  `,
  instagram: `
    <span class="platform-badge modern-badge instagram-badge">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
      INSTAGRAM
    </span>
  `,
  tiktok: `
    <span class="platform-badge modern-badge tiktok-badge">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.99v9.06c-.05 2.1-.8 4.17-2.2 5.76-1.4 1.58-3.4 2.53-5.5 2.58-1.76.04-3.52-.51-4.96-1.54-1.45-1.04-2.52-2.55-3.03-4.26-.51-1.71-.4-3.57.31-5.21.72-1.64 2-2.98 3.63-3.76.99-.47 2.08-.73 3.19-.77.16 0 .32 0 .48.02v4.06c-.34-.04-.69-.03-1.03.02-.91.13-1.76.62-2.34 1.34-.58.72-.85 1.64-.75 2.55.1 1 .64 1.91 1.48 2.47.84.56 1.89.73 2.87.46.98-.27 1.79-.98 2.22-1.91.24-.51.37-1.07.37-1.63V.02z"/>
      </svg>
      TIKTOK
    </span>
  `
};

function formatNickname(nick) {
  if (!nick) return '';
  nick = nick.trim();
  if (!nick.startsWith('“') && !nick.startsWith('"')) nick = `“${nick}`;
  if (!nick.endsWith('”') && !nick.endsWith('"')) nick = `${nick}”`;
  return nick;
}

function renderSlot(slotKey, presenter) {
  const s = slots[slotKey];
  if (!s || !presenter) return;

  s.name.textContent = presenter.name || 'PRESENTER';
  s.nick.textContent = formatNickname(presenter.nickname || '');
  s.role.textContent = presenter.role || '';
  s.handle.textContent = presenter.handle || '';

  // Todos los overlays usan obligatoriamente el logo real oficial de Kick
  s.badge.innerHTML = `<img src="/assets/logo-kick.png" class="kick-logo-img" alt="KICK">`;

  const accent = presenter.accentColor || '#00ff66';
  s.el.style.setProperty('--accent-color', accent);
  s.el.style.setProperty('--accent-glow', `${accent}B3`);
}

function showSlot(slotKey, presenter) {
  const s = slots[slotKey];
  if (!s || !presenter) return;

  if (s.hideTimeout) {
    clearTimeout(s.hideTimeout);
    s.hideTimeout = null;
  }

  renderSlot(slotKey, presenter);

  s.el.classList.remove('is-hiding');
  s.el.classList.remove('is-visible');
  void s.el.offsetWidth; // Trigger reflow

  s.el.classList.add('is-visible');
}

function hideSlot(slotKey) {
  const s = slots[slotKey];
  if (!s || !s.el.classList.contains('is-visible')) return;

  if (s.hideTimeout) {
    clearTimeout(s.hideTimeout);
    s.hideTimeout = null;
  }

  s.el.classList.remove('is-visible');
  s.el.classList.add('is-hiding');

  s.hideTimeout = setTimeout(() => {
    s.el.classList.remove('is-hiding');
    s.hideTimeout = null;
  }, 560);
}

// Obtener información normalizada y clases según el tipo de escena
function getSceneInfo(sceneData) {
  let badge = 'TRANSMISIÓN EN PAUSA';
  let title = sceneData.title || 'YA VOLVEMOS';
  let sub = sceneData.subtitle || 'Enseguida regresamos';
  let badgeClass = 'badge-brb';

  if (sceneData.type === 'starting') {
    badge = 'INICIANDO TRANSMISIÓN';
    if (!sceneData.title) title = 'ESTAMOS POR EMPEZAR';
    if (!sceneData.subtitle) sub = 'La transmisión comenzará en breve • Prepara tu birra';
    badgeClass = 'badge-starting';
  } else if (sceneData.type === 'ended') {
    badge = 'STREAM FINALIZADO';
    if (!sceneData.title) title = 'STREAM FINALIZADO';
    if (!sceneData.subtitle) sub = '¡Muchas gracias por acompañarnos hoy! • Nos vemos en el próximo stream';
    badgeClass = 'badge-ended';
  } else if (sceneData.type === 'brb') {
    badge = 'TRANSMISIÓN EN PAUSA';
    if (!sceneData.title) title = 'YA VOLVEMOS';
    if (!sceneData.subtitle) sub = 'Breve pausa comercial • Enseguida regresamos';
    badgeClass = 'badge-brb';
  }

  return { badge, title, sub, badgeClass, type: sceneData.type || 'brb' };
}

// Aplicar textos y estilos de badge en la escena
function applySceneContent(info) {
  if (sceneBadgeText) sceneBadgeText.textContent = info.badge;
  if (sceneTitle) sceneTitle.textContent = info.title;
  if (sceneSubtitle) sceneSubtitle.textContent = info.sub;

  if (sceneBadge) {
    sceneBadge.classList.remove('badge-starting', 'badge-brb', 'badge-ended');
    sceneBadge.classList.add(info.badgeClass);
  }
}

// Disparar animación de transición con escaneo láser minimalista de arriba a abajo
function triggerSceneTransition(info) {
  if (sceneTransitionTimer) {
    clearTimeout(sceneTransitionTimer);
    sceneTransitionTimer = null;
  }
  if (sceneCleanupTimer) {
    clearTimeout(sceneCleanupTimer);
    sceneCleanupTimer = null;
  }

  // 1. Activar la línea láser en primer plano barriendo de arriba a abajo
  if (sceneLaser) {
    sceneLaser.classList.remove('is-active');
    void sceneLaser.offsetWidth; // Trigger reflow
    sceneLaser.classList.add('is-active');
  }

  // 2. Justo al paso de la línea láser (~260ms) se coloca la nueva escena de inmediato
  // (sin recargas posteriores ni re-animaciones en los bloques)
  sceneTransitionTimer = setTimeout(() => {
    applySceneContent(info);
    sceneTransitionTimer = null;
  }, 260);

  // 3. Al completar el paso del láser por abajo (~720ms), se desactiva el láser
  sceneCleanupTimer = setTimeout(() => {
    if (sceneLaser) sceneLaser.classList.remove('is-active');
    sceneCleanupTimer = null;
  }, 720);
}

// Manejo de Escena Pantalla Completa
function showScene(sceneData) {
  if (!sceneEl) return;

  const info = getSceneInfo(sceneData);

  // Si había un temporizador de salida pendiente, cancelarlo
  if (sceneHideTimeout) {
    clearTimeout(sceneHideTimeout);
    sceneHideTimeout = null;
    sceneEl.classList.remove('is-exiting');
  }

  // Verificar si la escena ya está visible y activa en pantalla
  const isAlreadyActive = isSceneActive && 
                          sceneEl.classList.contains('is-active') && 
                          !sceneEl.classList.contains('is-exiting');

  // CASO A: Si ya estamos en una escena activa (ej: pasar de "ya vuelvo" a "stream finalizado")
  if (isAlreadyActive) {
    // Si la información no cambió, ignorar para evitar transiciones innecesarias
    if (currentSceneType === info.type && 
        currentSceneTitle === info.title && 
        currentSceneSubtitle === info.sub) {
      return;
    }

    currentSceneType = info.type;
    currentSceneTitle = info.title;
    currentSceneSubtitle = info.sub;

    // Ejecutar escaneo láser minimalista de arriba a abajo sin transparentar la pantalla
    triggerSceneTransition(info);
    return;
  }

  // CASO B: Entrada inicial desde escena inactiva / apagada
  isSceneActive = true;
  currentSceneType = info.type;
  currentSceneTitle = info.title;
  currentSceneSubtitle = info.sub;

  applySceneContent(info);

  if (sceneLaser) sceneLaser.classList.remove('is-active');

  sceneEl.classList.remove('is-exiting');
  sceneEl.classList.remove('is-active');
  sceneEl.classList.remove('is-initial-entering');
  void sceneEl.offsetWidth; // Trigger reflow para la entrada inicial

  sceneEl.classList.add('is-active');
  sceneEl.classList.add('is-initial-entering');

  setTimeout(() => {
    if (sceneEl) sceneEl.classList.remove('is-initial-entering');
  }, 850);
}

function hideScene() {
  if (!sceneEl || !sceneEl.classList.contains('is-active')) return;

  if (sceneHideTimeout) {
    clearTimeout(sceneHideTimeout);
    sceneHideTimeout = null;
  }
  if (sceneTransitionTimer) {
    clearTimeout(sceneTransitionTimer);
    sceneTransitionTimer = null;
  }
  if (sceneCleanupTimer) {
    clearTimeout(sceneCleanupTimer);
    sceneCleanupTimer = null;
  }

  isSceneActive = false;
  currentSceneType = null;
  currentSceneTitle = '';
  currentSceneSubtitle = '';

  if (sceneLaser) sceneLaser.classList.remove('is-active');
  sceneEl.classList.remove('is-initial-entering');
  sceneEl.classList.remove('is-active');
  sceneEl.classList.add('is-exiting');

  sceneHideTimeout = setTimeout(() => {
    sceneEl.classList.remove('is-exiting');
    sceneHideTimeout = null;
  }, 580);
}

// Sincronizar estado global
socket.on('state-update', (state) => {
  if (!state) return;

  // Escala
  if (state.scale) {
    const scaleVal = state.scale / 100;
    document.documentElement.style.setProperty('--overlay-scale', scaleVal);
  }

  // Escena Pantalla Completa
  if (state.scene && state.scene.isActive) {
    showScene(state.scene);
  } else {
    hideScene();
  }

  // Banco de Animaciones - Tabla VS Boxeo (La Velada del Caos)
  if (state.vs && state.vs.isActive && state.vs.fight) {
    showVsOverlay(state.vs.fight);
  } else {
    hideVsOverlay();
  }

  // Lower Thirds
  if (state.left && state.left.isVisible && state.left.presenter) {
    showSlot('left', state.left.presenter);
  } else {
    hideSlot('left');
  }

  if (state.right && state.right.isVisible && state.right.presenter) {
    showSlot('right', state.right.presenter);
  } else {
    hideSlot('right');
  }

  // Overlay Superior Dinámico (HUD BirraVerde y Barra de Eventos)
  if (state.topHud) {
    updateTopHud(state.topHud);
  }
});

// ============================================================
// OVERLAY SUPERIOR DINÁMICO (HUD BIRRAVERDE Y BARRA DE EVENTOS)
// ============================================================
const streamTopHud = document.getElementById('stream-top-hud');
const hudTickerTrack = document.getElementById('hud-ticker-track');
const hudTickerItemLive = document.getElementById('hud-ticker-item-live');
const hudTickerItemFeed = document.getElementById('hud-ticker-item-feed');
const hudTickerMainText = document.getElementById('hud-ticker-main-text');
const hudFeedText = document.getElementById('hud-feed-text');
const hudAlertLayer = document.getElementById('hud-alert-layer');
const hudAlertBadge = document.getElementById('hud-alert-badge');
const hudAlertIcon = document.getElementById('hud-alert-icon');
const hudAlertType = document.getElementById('hud-alert-type');
const hudAlertUser = document.getElementById('hud-alert-user');
const hudAlertDetail = document.getElementById('hud-alert-detail');

let hudTickerIndex = 0;
let hudAlertTimeout = null;
let isHudAlertActive = false;

function updateTopHud(topHud) {
  if (!streamTopHud) return;

  if (topHud.isVisible !== false) {
    streamTopHud.classList.add('is-visible');
  } else {
    streamTopHud.classList.remove('is-visible');
  }

  if (topHud.customText && hudFeedText) {
    hudFeedText.textContent = topHud.customText;
  }
}

// Rotación automática del ticker
setInterval(() => {
  if (isHudAlertActive) return;

  hudTickerIndex = (hudTickerIndex + 1) % 2;
  if (hudTickerIndex === 0) {
    if (hudTickerItemFeed) hudTickerItemFeed.classList.remove('is-active');
    if (hudTickerItemLive) hudTickerItemLive.classList.add('is-active');
  } else {
    if (hudTickerItemLive) hudTickerItemLive.classList.remove('is-active');
    if (hudTickerItemFeed) hudTickerItemFeed.classList.add('is-active');
  }
}, 6000);

// Escuchar alertas de eventos (Follows, Donaciones, Comentarios)
socket.on('hud-alert', (data) => {
  if (!streamTopHud || !hudAlertLayer || !data) return;

  streamTopHud.classList.add('is-visible');
  isHudAlertActive = true;

  if (hudAlertTimeout) clearTimeout(hudAlertTimeout);

  if (data.type === 'donation') {
    if (hudAlertBadge) hudAlertBadge.className = 'hud-alert-badge type-donation';
    if (hudAlertIcon) hudAlertIcon.textContent = '💎';
    if (hudAlertType) hudAlertType.textContent = 'DONACIÓN';
    if (hudAlertUser) hudAlertUser.textContent = data.user || 'Donador';
    if (hudAlertDetail) hudAlertDetail.textContent = data.detail ? `(${data.amount || '$5.00'}) ${data.detail}` : `donó ${data.amount || '$5.00'}`;
  } else if (data.type === 'comment') {
    if (hudAlertBadge) hudAlertBadge.className = 'hud-alert-badge type-comment';
    if (hudAlertIcon) hudAlertIcon.textContent = '💬';
    if (hudAlertType) hudAlertType.textContent = 'CHAT';
    if (hudAlertUser) hudAlertUser.textContent = data.user || '@usuario';
    if (hudAlertDetail) hudAlertDetail.textContent = data.detail || 'comentó en el stream';
  } else {
    if (hudAlertBadge) hudAlertBadge.className = 'hud-alert-badge';
    if (hudAlertIcon) hudAlertIcon.textContent = '⭐';
    if (hudAlertType) hudAlertType.textContent = 'NUEVO FOLLOWER';
    if (hudAlertUser) hudAlertUser.textContent = data.user || '@nuevo_seguidor';
    if (hudAlertDetail) hudAlertDetail.textContent = data.detail || 'se acaba de suscribir / seguir';
  }

  if (hudTickerTrack) hudTickerTrack.style.opacity = '0';
  hudAlertLayer.classList.add('is-showing');

  hudAlertTimeout = setTimeout(() => {
    hudAlertLayer.classList.remove('is-showing');
    setTimeout(() => {
      if (hudTickerTrack) hudTickerTrack.style.opacity = '1';
      isHudAlertActive = false;
    }, 400);
  }, 7000);
});
