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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado actual del overlay en vivo
let liveState = {
  isVisible: false,
  activePresenter: null,
  autoHideSeconds: 0,
  shownAt: null
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

// Guardar presentadores en disco
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

// Inicializar lista en memoria
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
      theme: "kick-green",
      position: "bottom-left",
      animation: "slide-left",
      autoHideSeconds: 0
    }
  ];
  savePresenters(presenters);
}

// Timer para auto-ocultar
let autoHideTimer = null;

function triggerShow(presenter, autoHideSeconds = 0) {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  liveState = {
    isVisible: true,
    activePresenter: presenter,
    autoHideSeconds: Number(autoHideSeconds) || 0,
    shownAt: Date.now()
  };

  io.emit('overlay-show', liveState);
  io.emit('state-update', liveState);

  if (liveState.autoHideSeconds > 0) {
    autoHideTimer = setTimeout(() => {
      triggerHide();
    }, liveState.autoHideSeconds * 1000);
  }
}

function triggerHide() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  liveState.isVisible = false;
  io.emit('overlay-hide', liveState);
  io.emit('state-update', liveState);
}

// Rutas API REST
app.get('/api/state', (req, res) => {
  res.json(liveState);
});

app.get('/api/presenters', (req, res) => {
  res.json(presenters);
});

app.post('/api/presenters', (req, res) => {
  const newPres = {
    ...req.body,
    id: req.body.id || `pres-${Date.now()}`
  };
  presenters.push(newPres);
  savePresenters(presenters);
  io.emit('presenters-updated', presenters);
  res.status(201).json(newPres);
});

app.put('/api/presenters/:id', (req, res) => {
  const { id } = req.params;
  const index = presenters.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Presentador no encontrado' });
  }
  presenters[index] = { ...presenters[index], ...req.body, id };
  savePresenters(presenters);

  // Si el presentador modificado está en vivo actualmente, actualizar overlay en vivo
  if (liveState.activePresenter && liveState.activePresenter.id === id) {
    liveState.activePresenter = presenters[index];
    io.emit('overlay-update', liveState);
    io.emit('state-update', liveState);
  }

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

app.post('/api/control/show', (req, res) => {
  const { presenterId, presenter, autoHideSeconds } = req.body;
  let target = presenter;
  if (!target && presenterId) {
    target = presenters.find(p => p.id === presenterId);
  }
  if (!target && presenters.length > 0) {
    target = presenters[0];
  }
  if (!target) {
    return res.status(400).json({ error: 'No hay presentador disponible' });
  }

  triggerShow(target, autoHideSeconds);
  res.json({ success: true, liveState });
});

app.post('/api/control/hide', (req, res) => {
  triggerHide();
  res.json({ success: true, liveState });
});

// Rutas directas para OBS y Host
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get(['/', '/admin', '/host'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSockets para comunicación en tiempo real de latencia ultra-baja
io.on('connection', (socket) => {
  // Enviar estado inicial y lista al cliente recién conectado
  socket.emit('state-update', liveState);
  socket.emit('presenters-updated', presenters);

  // Controlar show
  socket.on('show-presenter', (data) => {
    let target = data.presenter;
    if (!target && data.id) {
      target = presenters.find(p => p.id === data.id);
    }
    if (target) {
      triggerShow(target, data.autoHideSeconds);
    }
  });

  // Controlar hide
  socket.on('hide-presenter', () => {
    triggerHide();
  });

  // Guardar o actualizar
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

  // Eliminar
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
