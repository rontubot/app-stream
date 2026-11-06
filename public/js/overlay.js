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
const sceneBadgeText = document.getElementById('scene-badge-text');
const sceneTitle = document.getElementById('scene-title');
const sceneSubtitle = document.getElementById('scene-subtitle');
let sceneHideTimeout = null;

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

// Manejo de Escena Pantalla Completa
function showScene(sceneData) {
  if (!sceneEl) return;

  if (sceneHideTimeout) {
    clearTimeout(sceneHideTimeout);
    sceneHideTimeout = null;
  }

  let badge = 'TRANSMISIÓN EN PAUSA';
  let title = sceneData.title || 'YA VOLVEMOS';
  let sub = sceneData.subtitle || 'Enseguida regresamos';

  if (sceneData.type === 'starting') {
    badge = 'INICIANDO TRANSMISIÓN';
    if (!sceneData.title) title = 'ESTAMOS POR EMPEZAR';
    if (!sceneData.subtitle) sub = 'La transmisión comenzará en breve • Prepara tu birra';
  } else if (sceneData.type === 'ended') {
    badge = 'STREAM FINALIZADO';
    if (!sceneData.title) title = 'STREAM FINALIZADO';
    if (!sceneData.subtitle) sub = '¡Muchas gracias por acompañarnos hoy! • Nos vemos en el próximo stream';
  } else if (sceneData.type === 'brb') {
    badge = 'TRANSMISIÓN EN PAUSA';
    if (!sceneData.title) title = 'YA VOLVEMOS';
    if (!sceneData.subtitle) sub = 'Breve pausa comercial • Enseguida regresamos';
  }

  sceneBadgeText.textContent = badge;
  sceneTitle.textContent = title;
  sceneSubtitle.textContent = sub;

  sceneEl.classList.remove('is-exiting');
  sceneEl.classList.remove('is-active');
  void sceneEl.offsetWidth; // Trigger reflow

  sceneEl.classList.add('is-active');
}

function hideScene() {
  if (!sceneEl || !sceneEl.classList.contains('is-active')) return;

  if (sceneHideTimeout) {
    clearTimeout(sceneHideTimeout);
    sceneHideTimeout = null;
  }

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
});
