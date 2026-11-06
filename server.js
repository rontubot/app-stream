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
const DATA_FILE = path.join(__dirname, 'data', 'presenters.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado actual del overlay en vivo, cola y escenas de pantalla completa
let liveState = {
  left: {
    isVisible: false,
    presenter: null,
    autoHideSeconds: 0,
    shownAt: null
  },
  right: {
    isVisible: false,
    presenter: null,
    autoHideSeconds: 0,
    shownAt: null
  },
  queue: {
    left: null,
    right: null
  },
  scale: 65,
  scene: {
    isActive: false,
    type: null, // 'starting' | 'brb' | 'ended' | 'custom'
    title: '',
    subtitle: '',
    startedAt: null
  }
};

// Cargar presentadores del archivo
function loadPresenters() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error al cargar presentadores:', err);
  }
  return [];
}

function savePresenters(presenters) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(presenters, null, 2), 'utf-8');
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
      if (data.scale) liveState.scale = data.scale;
    }
  } catch (err) {
    console.error('Error al cargar settings:', err);
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ scale: liveState.scale }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error al guardar settings:', err);
  }
}

loadSettings();

let presenters = loadPresenters();
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
      platform: "twitch",
      platformName: "TWITCH",
      handle: "@CHARLIE_STREAM",
      role: "CASTER",
      accentColor: "#9146FF",
      defaultSide: "right"
    }
  ];
  savePresenters(presenters);
}

if (presenters.length > 0) {
  liveState.queue.left = presenters[0];
  liveState.queue.right = presenters[1] || presenters[0];
}

// Timers independientes para auto-ocultar
let timerLeft = null;
let timerRight = null;

function triggerShowSlot(slot, presenter, autoHideSeconds = 0) {
  const targetSlot = (slot === 'right') ? 'right' : 'left';

  if (targetSlot === 'left' && timerLeft) {
    clearTimeout(timerLeft);
    timerLeft = null;
  }
  if (targetSlot === 'right' && timerRight) {
    clearTimeout(timerRight);
    timerRight = null;
  }

  liveState[targetSlot] = {
    isVisible: true,
    presenter: presenter,
    autoHideSeconds: Number(autoHideSeconds) || 0,
    shownAt: Date.now()
  };

  io.emit('state-update', liveState);

  if (liveState[targetSlot].autoHideSeconds > 0) {
    const t = setTimeout(() => {
      triggerHideSlot(targetSlot);
    }, liveState[targetSlot].autoHideSeconds * 1000);

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

  io.emit('state-update', liveState);
  io.emit('presenters-updated', presenters);
  res.json(presenters[index]);
});

app.delete('/api/presenters/:id', (req, res) => {
  const { id } = req.params;
  presenters = presenters.filter(p => p.id !== id);
  savePresenters(presenters);
  io.emit('presenters-updated', presenters);
  res.json({ success: true });
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

  // 1. Preparar un slot (Queue / Preview sin mostrarlo en stream)
  socket.on('prepare-slot', (data) => {
    let target = data.presenter;
    if (!target && data.id) {
      target = presenters.find(p => p.id === data.id);
    }
    const targetSlot = (data.slot === 'right') ? 'right' : 'left';
    liveState.queue[targetSlot] = target || null;
    io.emit('state-update', liveState);
  });

  // 2. Lanzar a en vivo lo que ya está preparado
  socket.on('launch-prepared', (data) => {
    const slot = data.slot || 'both';
    const autoHide = data.autoHideSeconds || 0;

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
      triggerShowSlot(data.slot || 'left', target, data.autoHideSeconds);
    }
  });

  socket.on('show-both', (data) => {
    if (data.leftPresenter) {
      triggerShowSlot('left', data.leftPresenter, data.autoHideSeconds);
    }
    if (data.rightPresenter) {
      triggerShowSlot('right', data.rightPresenter, data.autoHideSeconds);
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
    // data: { type, title, subtitle }
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

  // 6. Escala
  socket.on('set-scale', (scalePercent) => {
    const s = Math.min(100, Math.max(40, Number(scalePercent) || 65));
    liveState.scale = s;
    saveSettings();
    io.emit('state-update', liveState);
  });

  // 7. Guardar / Eliminar
  socket.on('save-presenter', (presData) => {
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
    io.emit('presenters-updated', presenters);
  });

  socket.on('delete-presenter', (id) => {
    presenters = presenters.filter(p => p.id !== id);
    savePresenters(presenters);
    io.emit('presenters-updated', presenters);
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Stream Overlay App corriendo en puerto ${PORT}`);
  console.log(`🎮 Panel de Host:      http://localhost:${PORT}/`);
  console.log(`🎥 Fuente OBS Overlay: http://localhost:${PORT}/overlay`);
  console.log(`===============================================`);
});
