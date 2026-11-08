const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'presenters.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const FIGHTS_FILE = path.join(DATA_DIR, 'fights.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Middleware con límite ampliado para fotos de peleadores
app.use(express.json({ limit: '30mb' }));

// Desactivar caché agresivo de OBS y navegadores para assets estáticos
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Ruta explícita para asegurar la carga del logo oficial transparente
app.get(['/assets/logo-velada-del-caos.png', '/assets/la%20velada%20del%20caos%20logo.png'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'assets', 'la velada del caos logo.png'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Estado actual del overlay en vivo, cola, escenas y banco de VS Boxeo
let liveState = {
  left: {
    isVisible: false,
    presenter: null,
    autoHideSeconds: 5,
    shownAt: null
  },
  right: {
    isVisible: false,
    presenter: null,
    autoHideSeconds: 5,
    shownAt: null
  },
  queue: {
    left: null,
    right: null
  },
  scale: 65,
  defaultAutoHide: 5,
  scene: {
    isActive: false,
    type: null, // 'starting' | 'brb' | 'ended' | 'custom'
    title: '',
    subtitle: '',
    startedAt: null
  },
  vs: {
    isActive: false,
    fight: null,
    shownAt: null
  },
  topHud: {
    isVisible: true,
    customText: ''
  },
  chatOverlay: {
    isVisible: false,
    ttsEnabled: true,
    commandPrefix: '!anuncio',
    lastMessage: null
  }
};

// Cargar presentadores del archivo
function loadPresenters() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error al cargar presentadores:', err);
  }
  return [];
}

function savePresenters(presentersList) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(presentersList, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error al guardar presentadores:', err);
    return false;
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (typeof data.scale === 'number') {
        liveState.scale = data.scale;
      }
      if (typeof data.defaultAutoHide === 'number') {
        liveState.defaultAutoHide = data.defaultAutoHide;
      }
      if (data.topHud && typeof data.topHud.isVisible === 'boolean') {
        liveState.topHud.isVisible = data.topHud.isVisible;
      }
      if (data.topHud && typeof data.topHud.customText === 'string') {
        liveState.topHud.customText = data.topHud.customText;
      }
      if (data.chatOverlay) {
        if (typeof data.chatOverlay.ttsEnabled === 'boolean') {
          liveState.chatOverlay.ttsEnabled = data.chatOverlay.ttsEnabled;
        }
        if (typeof data.chatOverlay.commandPrefix === 'string' && data.chatOverlay.commandPrefix.trim()) {
          liveState.chatOverlay.commandPrefix = data.chatOverlay.commandPrefix.trim();
        }
      }
      return data;
    }
  } catch (err) {
    console.error('Error al cargar settings:', err);
  }
  return {};
}

function saveSettings() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      scale: liveState.scale,
      defaultAutoHide: liveState.defaultAutoHide,
      queue: {
        leftId: liveState.queue.left ? liveState.queue.left.id : null,
        rightId: liveState.queue.right ? liveState.queue.right.id : null
      },
      topHud: {
        isVisible: liveState.topHud.isVisible,
        customText: liveState.topHud.customText
      },
      chatOverlay: {
        ttsEnabled: liveState.chatOverlay.ttsEnabled,
        commandPrefix: liveState.chatOverlay.commandPrefix
      }
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error al guardar settings:', err);
    return false;
  }
}

// Cargar y guardar combates (La Velada del Caos)
function loadFights() {
  try {
    if (fs.existsSync(FIGHTS_FILE)) {
      const data = fs.readFileSync(FIGHTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error al cargar combates:', err);
  }
  return [];
}

function saveFights(fightsList) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FIGHTS_FILE, JSON.stringify(fightsList, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error al guardar combates:', err);
    return false;
  }
}

// Inicialización de datos
let savedSettings = loadSettings();
let presenters = loadPresenters();
let fights = loadFights();

// Si no hay combates por primera vez, creamos los por defecto para La Velada del Caos
if (fights.length === 0) {
  fights = [
    {
      id: "fight-velada-1",
      title: "PELEA ESTELAR",
      subtitle: "CAMPEONATO LA VELADA DEL CAOS",
      rounds: "3 ROUNDS x 3 MIN",
      category: "PESO MEDIO",
      fighter1: {
        name: "LIONEL ARRIETA",
        nickname: "EL TORO",
        weight: "74.5 KG",
        height: "1.78 M",
        record: {
          wins: 5,
          draws: 0,
          losses: 1
        },
        corner: "red",
        photo: "/assets/boxer-placeholder.svg"
      },
      fighter2: {
        name: "CARLOS MENDOZA",
        nickname: "LA ROCA",
        weight: "73.8 KG",
        height: "1.82 M",
        record: {
          wins: 4,
          draws: 1,
          losses: 0
        },
        corner: "blue",
        photo: "/assets/boxer-placeholder.svg"
      }
    },
    {
      id: "fight-velada-2",
      title: "CO-ESTELAR",
      subtitle: "DUELO DE PESOS PESADOS",
      rounds: "3 ROUNDS x 3 MIN",
      category: "PESO PESADO",
      fighter1: {
        name: "FRANCO DEMOLEDOR",
        nickname: "TITAN",
        weight: "88.2 KG",
        height: "1.86 M",
        record: {
          wins: 7,
          draws: 0,
          losses: 0
        },
        corner: "red",
        photo: "/assets/boxer-placeholder.svg"
      },
      fighter2: {
        name: "JAVIER GOMEZ",
        nickname: "EL CAOS",
        weight: "89.0 KG",
        height: "1.88 M",
        record: {
          wins: 6,
          draws: 1,
          losses: 1
        },
        corner: "blue",
        photo: "/assets/boxer-placeholder.svg"
      }
    }
  ];
  saveFights(fights);
}

// Si no hay presentadores por primera vez, creamos los por defecto
if (presenters.length === 0) {
  presenters = [
    {
      id: "pres-1",
      name: "LUIS MIGUEL ARRIETA",
      nickname: "“LUISMI”",
      platform: "kick",
      platformName: "KICK",
      handle: "@LUISMISHIT",
      role: "DESIG",
      accentColor: "#00ff66",
      defaultSide: "left"
    },
    {
      id: "pres-2",
      name: "CARLOS MENDOZA",
      nickname: "“CHARLIE”",
      platform: "kick",
      platformName: "KICK",
      handle: "@CHARLIE_STREAM",
      role: "CASTER",
      accentColor: "#00ff66",
      defaultSide: "right"
    }
  ];
  savePresenters(presenters);
}

// Rehidratar Cola (Queue) desde settings guardados o defaults
if (savedSettings && savedSettings.queue) {
  if (savedSettings.queue.leftId) {
    liveState.queue.left = presenters.find(p => p.id === savedSettings.queue.leftId) || presenters[0] || null;
  }
  if (savedSettings.queue.rightId) {
    liveState.queue.right = presenters.find(p => p.id === savedSettings.queue.rightId) || presenters[1] || presenters[0] || null;
  }
}

if (!liveState.queue.left && presenters.length > 0) {
  liveState.queue.left = presenters[0];
}
if (!liveState.queue.right && presenters.length > 0) {
  liveState.queue.right = presenters[1] || presenters[0];
}

saveSettings();

// Timers independientes para auto-ocultar
let timerLeft = null;
let timerRight = null;

function triggerShowSlot(slot, presenter, autoHideSeconds = null) {
  const targetSlot = (slot === 'right') ? 'right' : 'left';

  if (targetSlot === 'left' && timerLeft) {
    clearTimeout(timerLeft);
    timerLeft = null;
  }
  if (targetSlot === 'right' && timerRight) {
    clearTimeout(timerRight);
    timerRight = null;
  }

  const duration = (autoHideSeconds !== null && autoHideSeconds !== undefined) 
    ? Number(autoHideSeconds) 
    : liveState.defaultAutoHide;

  liveState[targetSlot] = {
    isVisible: true,
    presenter: presenter,
    autoHideSeconds: duration,
    shownAt: Date.now()
  };

  io.emit('state-update', liveState);

  if (duration > 0) {
    const t = setTimeout(() => {
      triggerHideSlot(targetSlot);
    }, duration * 1000);

    if (targetSlot === 'left') timerLeft = t;
    if (targetSlot === 'right') timerRight = t;
  }
}

function triggerHideSlot(slot) {
  if (slot === 'all' || slot === 'both') {
    triggerHideSlot('left');
    triggerHideSlot('right');
    return;
  }

  const targetSlot = (slot === 'right') ? 'right' : 'left';

  if (targetSlot === 'left' && timerLeft) {
    clearTimeout(timerLeft);
    timerLeft = null;
  }
  if (targetSlot === 'right' && timerRight) {
    clearTimeout(timerRight);
    timerRight = null;
  }

  if (liveState[targetSlot]) {
    liveState[targetSlot].isVisible = false;
  }

  io.emit('state-update', liveState);
}

// Rutas API REST
app.get('/api/state', (req, res) => res.json(liveState));
app.get('/api/presenters', (req, res) => res.json(presenters));
app.get('/api/settings', (req, res) => res.json({
  scale: liveState.scale,
  defaultAutoHide: liveState.defaultAutoHide,
  queue: liveState.queue
}));

app.post('/api/settings', (req, res) => {
  const { scale, defaultAutoHide } = req.body;
  if (typeof scale === 'number') liveState.scale = scale;
  if (typeof defaultAutoHide === 'number') liveState.defaultAutoHide = defaultAutoHide;
  saveSettings();
  io.emit('state-update', liveState);
  res.json({ success: true, settings: { scale: liveState.scale, defaultAutoHide: liveState.defaultAutoHide } });
});

app.post('/api/presenters', (req, res) => {
  const newPres = { ...req.body, id: req.body.id || `pres-${Date.now()}` };
  presenters.push(newPres);
  savePresenters(presenters);
  io.emit('presenters-updated', presenters);
  res.status(201).json(newPres);
});

app.put('/api/presenters/:id', (req, res) => {
  const { id } = req.params;
  const index = presenters.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'No encontrado' });

  presenters[index] = { ...presenters[index], ...req.body, id };
  savePresenters(presenters);

  if (liveState.left.presenter && liveState.left.presenter.id === id) {
    liveState.left.presenter = presenters[index];
  }
  if (liveState.right.presenter && liveState.right.presenter.id === id) {
    liveState.right.presenter = presenters[index];
  }
  if (liveState.queue.left && liveState.queue.left.id === id) {
    liveState.queue.left = presenters[index];
  }
  if (liveState.queue.right && liveState.queue.right.id === id) {
    liveState.queue.right = presenters[index];
  }

  saveSettings();
  io.emit('state-update', liveState);
  io.emit('presenters-updated', presenters);
  res.json(presenters[index]);
});

app.delete('/api/presenters/:id', (req, res) => {
  const { id } = req.params;
  presenters = presenters.filter(p => p.id !== id);
  savePresenters(presenters);

  if (liveState.left.presenter && liveState.left.presenter.id === id) {
    liveState.left.isVisible = false;
    liveState.left.presenter = null;
  }
  if (liveState.right.presenter && liveState.right.presenter.id === id) {
    liveState.right.isVisible = false;
    liveState.right.presenter = null;
  }
  if (liveState.queue.left && liveState.queue.left.id === id) {
    liveState.queue.left = presenters[0] || null;
  }
  if (liveState.queue.right && liveState.queue.right.id === id) {
    liveState.queue.right = presenters[1] || presenters[0] || null;
  }

  saveSettings();
  io.emit('state-update', liveState);
  io.emit('presenters-updated', presenters);
  res.json({ success: true });
});

// Rutas API REST para Combates de Boxeo (La Velada del Caos)
app.get('/api/fights', (req, res) => res.json(fights));

app.post('/api/fights', (req, res) => {
  const newFight = { ...req.body, id: req.body.id || `fight-${Date.now()}` };
  fights.push(newFight);
  saveFights(fights);
  io.emit('fights-updated', fights);
  res.status(201).json(newFight);
});

app.put('/api/fights/:id', (req, res) => {
  const { id } = req.params;
  const index = fights.findIndex(f => f.id === id);
  if (index === -1) return res.status(404).json({ error: 'Combate no encontrado' });

  fights[index] = { ...fights[index], ...req.body, id };
  saveFights(fights);

  // Si el combate actualizado está en pantalla, sincronizarlo en tiempo real
  if (liveState.vs.isActive && liveState.vs.fight && liveState.vs.fight.id === id) {
    liveState.vs.fight = fights[index];
    io.emit('state-update', liveState);
  }

  io.emit('fights-updated', fights);
  res.json(fights[index]);
});

app.delete('/api/fights/:id', (req, res) => {
  const { id } = req.params;
  fights = fights.filter(f => f.id !== id);
  saveFights(fights);

  if (liveState.vs.isActive && liveState.vs.fight && liveState.vs.fight.id === id) {
    liveState.vs.isActive = false;
    liveState.vs.fight = null;
    io.emit('state-update', liveState);
  }

  io.emit('fights-updated', fights);
  res.json({ success: true });
});

// Endpoint de subida de imágenes PNG para boxeadores
app.post('/api/upload', (req, res) => {
  try {
    const { dataUrl, filename } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'No se envió imagen en base64' });
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato base64 no válido' });
    }

    const ext = filename ? path.extname(filename) || '.png' : '.png';
    const cleanName = `boxer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
    
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, cleanName);
    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));

    res.json({ success: true, url: `/uploads/${cleanName}` });
  } catch (err) {
    console.error('Error al subir imagen de boxeador:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen' });
  }
});

// Rutas directas para OBS y Host
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get(['/', '/admin', '/host'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSockets en tiempo real
io.on('connection', (socket) => {
  socket.emit('state-update', liveState);
  socket.emit('presenters-updated', presenters);
  socket.emit('fights-updated', fights);

  // 1. Preparar un slot (Queue / Preview sin mostrarlo en stream)
  socket.on('prepare-slot', (data) => {
    let target = data.presenter;
    if (!target && data.id) {
      target = presenters.find(p => p.id === data.id);
    }
    const targetSlot = (data.slot === 'right') ? 'right' : 'left';
    liveState.queue[targetSlot] = target || null;
    saveSettings();
    io.emit('state-update', liveState);
  });

  // 2. Lanzar a en vivo lo que ya está preparado
  socket.on('launch-prepared', (data) => {
    const slot = data.slot || 'both';
    const autoHide = (data.autoHideSeconds !== undefined) ? data.autoHideSeconds : liveState.defaultAutoHide;

    if (slot === 'left' || slot === 'both') {
      if (liveState.queue.left) {
        triggerShowSlot('left', liveState.queue.left, autoHide);
      }
    }
    if (slot === 'right' || slot === 'both') {
      if (liveState.queue.right) {
        triggerShowSlot('right', liveState.queue.right, autoHide);
      }
    }
  });

  // 3. Lanzar directo
  socket.on('show-slot', (data) => {
    let target = data.presenter;
    if (!target && data.id) {
      target = presenters.find(p => p.id === data.id);
    }
    if (target) {
      const autoHide = (data.autoHideSeconds !== undefined) ? data.autoHideSeconds : liveState.defaultAutoHide;
      triggerShowSlot(data.slot || 'left', target, autoHide);
    }
  });

  socket.on('show-both', (data) => {
    const autoHide = (data.autoHideSeconds !== undefined) ? data.autoHideSeconds : liveState.defaultAutoHide;
    if (data.leftPresenter) {
      triggerShowSlot('left', data.leftPresenter, autoHide);
    }
    if (data.rightPresenter) {
      triggerShowSlot('right', data.rightPresenter, autoHide);
    }
  });

  // 4. Ocultar overlays
  socket.on('hide-slot', (slot) => {
    triggerHideSlot(slot || 'left');
  });

  socket.on('hide-all', () => {
    triggerHideSlot('all');
  });

  // 5. Escenas de pantalla completa (Ya volvemos, Empezando, Finalizado)
  socket.on('show-scene', (data) => {
    liveState.scene = {
      isActive: true,
      type: data.type || 'brb',
      title: data.title || '',
      subtitle: data.subtitle || '',
      startedAt: Date.now()
    };
    io.emit('state-update', liveState);
  });

  socket.on('hide-scene', () => {
    liveState.scene.isActive = false;
    io.emit('state-update', liveState);
  });

  // 5.b. Banco de Animaciones - Tabla VS Boxeo (La Velada del Caos)
  socket.on('show-vs', (data) => {
    let targetFight = data.fight;
    if (!targetFight && data.id) {
      targetFight = fights.find(f => f.id === data.id);
    }
    if (!targetFight && fights.length > 0) {
      targetFight = fights[0];
    }

    if (targetFight) {
      liveState.vs = {
        isActive: true,
        fight: targetFight,
        shownAt: Date.now()
      };
      io.emit('state-update', liveState);
    }
  });

  socket.on('hide-vs', () => {
    liveState.vs.isActive = false;
    io.emit('state-update', liveState);
  });

  // 5.c. Overlay Superior Dinámico BirraVerde (HUD y Marquesina)
  socket.on('toggle-top-hud', (payload) => {
    if (payload && typeof payload.isVisible === 'boolean') {
      liveState.topHud.isVisible = payload.isVisible;
    } else {
      liveState.topHud.isVisible = !liveState.topHud.isVisible;
    }
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('update-top-hud-text', (data) => {
    if (data && typeof data.text === 'string') {
      liveState.topHud.customText = data.text.trim();
      saveSettings();
      io.emit('state-update', liveState);
    }
  });

  socket.on('trigger-hud-alert', (alertData) => {
    // alertData: { type: 'follow'|'donation'|'comment', user, detail, amount }
    io.emit('hud-alert', alertData);
  });

  // 5.d. Overlay Inferior de Chat Destacado y TTS
  socket.on('trigger-chat-announcement', (data) => {
    // data: { user: '@...', text: '...', tts: boolean }
    if (!data || !data.text) return;

    let cleanText = data.text.trim();
    const prefix = liveState.chatOverlay.commandPrefix || '!anuncio';
    if (cleanText.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleanText = cleanText.slice(prefix.length).trim();
    }

    const payload = {
      user: data.user || '@espectador',
      text: cleanText,
      prefix: prefix,
      tts: typeof data.tts === 'boolean' ? data.tts : liveState.chatOverlay.ttsEnabled,
      timestamp: Date.now()
    };

    liveState.chatOverlay.isVisible = true;
    liveState.chatOverlay.lastMessage = payload;
    io.emit('state-update', liveState);
    io.emit('chat-announcement', payload);
  });

  socket.on('hide-chat-announcement', () => {
    liveState.chatOverlay.isVisible = false;
    io.emit('state-update', liveState);
  });

  socket.on('toggle-chat-tts', (payload) => {
    if (payload && typeof payload.enabled === 'boolean') {
      liveState.chatOverlay.ttsEnabled = payload.enabled;
    } else {
      liveState.chatOverlay.ttsEnabled = !liveState.chatOverlay.ttsEnabled;
    }
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('update-chat-prefix', (data) => {
    if (data && typeof data.prefix === 'string' && data.prefix.trim()) {
      liveState.chatOverlay.commandPrefix = data.prefix.trim();
      saveSettings();
      io.emit('state-update', liveState);
    }
  });

  socket.on('save-fight', (fightData, callback) => {
    if (!fightData) return;

    if (!fightData.id) {
      fightData.id = `fight-${Date.now()}`;
      fights.push(fightData);
    } else {
      const idx = fights.findIndex(f => f.id === fightData.id);
      if (idx !== -1) {
        fights[idx] = { ...fights[idx], ...fightData };
      } else {
        fights.push(fightData);
      }
    }
    saveFights(fights);

    // Si el combate guardado está actualmente activo en pantalla, actualizarlo
    if (liveState.vs.isActive && liveState.vs.fight && liveState.vs.fight.id === fightData.id) {
      liveState.vs.fight = fightData;
      io.emit('state-update', liveState);
    }

    io.emit('fights-updated', fights);
    if (typeof callback === 'function') callback({ success: true, fight: fightData });
  });

  socket.on('delete-fight', (id, callback) => {
    fights = fights.filter(f => f.id !== id);
    saveFights(fights);

    if (liveState.vs.isActive && liveState.vs.fight && liveState.vs.fight.id === id) {
      liveState.vs.isActive = false;
      liveState.vs.fight = null;
      io.emit('state-update', liveState);
    }

    io.emit('fights-updated', fights);
    if (typeof callback === 'function') callback({ success: true });
  });

  // 6. Configuración: Escala y Auto-Hide (Persistencia total)
  socket.on('set-scale', (scalePercent) => {
    const s = Math.min(100, Math.max(40, Number(scalePercent) || 65));
    liveState.scale = s;
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('set-autohide', (seconds) => {
    const sec = Math.max(0, parseInt(seconds, 10) || 0);
    liveState.defaultAutoHide = sec;
    saveSettings();
    io.emit('state-update', liveState);
  });

  // 7. Guardar / Editar / Eliminar / Sincronizar Presentadores
  socket.on('save-presenter', (presData, callback) => {
    if (!presData) return;

    if (!presData.id) {
      presData.id = `pres-${Date.now()}`;
      presenters.push(presData);
    } else {
      const idx = presenters.findIndex(p => p.id === presData.id);
      if (idx !== -1) {
        presenters[idx] = { ...presenters[idx], ...presData };
      } else {
        presenters.push(presData);
      }
    }
    savePresenters(presenters);

    // Si el presentador guardado está en vivo o en cola, actualizarlo de inmediato
    let stateChanged = false;
    if (liveState.left.presenter && liveState.left.presenter.id === presData.id) {
      liveState.left.presenter = { ...liveState.left.presenter, ...presData };
      stateChanged = true;
    }
    if (liveState.right.presenter && liveState.right.presenter.id === presData.id) {
      liveState.right.presenter = { ...liveState.right.presenter, ...presData };
      stateChanged = true;
    }
    if (liveState.queue.left && liveState.queue.left.id === presData.id) {
      liveState.queue.left = { ...liveState.queue.left, ...presData };
      stateChanged = true;
    }
    if (liveState.queue.right && liveState.queue.right.id === presData.id) {
      liveState.queue.right = { ...liveState.queue.right, ...presData };
      stateChanged = true;
    }

    if (stateChanged) {
      saveSettings();
      io.emit('state-update', liveState);
    }
    io.emit('presenters-updated', presenters);

    if (typeof callback === 'function') {
      callback({ success: true, presenter: presData });
    }
  });

  socket.on('delete-presenter', (id, callback) => {
    presenters = presenters.filter(p => p.id !== id);
    savePresenters(presenters);

    let stateChanged = false;
    if (liveState.left.presenter && liveState.left.presenter.id === id) {
      liveState.left.isVisible = false;
      liveState.left.presenter = null;
      stateChanged = true;
    }
    if (liveState.right.presenter && liveState.right.presenter.id === id) {
      liveState.right.isVisible = false;
      liveState.right.presenter = null;
      stateChanged = true;
    }
    if (liveState.queue.left && liveState.queue.left.id === id) {
      liveState.queue.left = presenters[0] || null;
      stateChanged = true;
    }
    if (liveState.queue.right && liveState.queue.right.id === id) {
      liveState.queue.right = presenters[1] || presenters[0] || null;
      stateChanged = true;
    }

    if (stateChanged) {
      saveSettings();
      io.emit('state-update', liveState);
    }
    io.emit('presenters-updated', presenters);

    if (typeof callback === 'function') {
      callback({ success: true, id });
    }
  });

  // 8. Sincronización masiva (para respaldos o auto-recuperación de localStorage)
  socket.on('sync-all-presenters', (list, callback) => {
    if (Array.isArray(list) && list.length > 0) {
      // Merge preservando IDs únicos
      const map = new Map();
      presenters.forEach(p => map.set(p.id, p));
      list.forEach(p => map.set(p.id, p));
      presenters = Array.from(map.values());
      savePresenters(presenters);
      io.emit('presenters-updated', presenters);
      if (typeof callback === 'function') callback({ success: true, count: presenters.length });
    }
  });

  socket.on('import-backup', (backupData, callback) => {
    try {
      if (backupData.presenters && Array.isArray(backupData.presenters)) {
        presenters = backupData.presenters;
        savePresenters(presenters);
      }
      if (backupData.settings) {
        if (typeof backupData.settings.scale === 'number') liveState.scale = backupData.settings.scale;
        if (typeof backupData.settings.defaultAutoHide === 'number') liveState.defaultAutoHide = backupData.settings.defaultAutoHide;
      }
      if (presenters.length > 0) {
        liveState.queue.left = presenters[0];
        liveState.queue.right = presenters[1] || presenters[0];
      }
      saveSettings();
      io.emit('state-update', liveState);
      io.emit('presenters-updated', presenters);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Stream Overlay App corriendo en puerto ${PORT}`);
  console.log(`🎮 Panel de Host:      http://localhost:${PORT}/`);
  console.log(`🎥 Fuente OBS Overlay: http://localhost:${PORT}/overlay`);
  console.log(`💾 Persistencia:       ACTIVA (data/presenters.json y data/settings.json)`);
  console.log(`===============================================`);
});