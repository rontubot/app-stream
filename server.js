const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
let Pool;
try {
  Pool = require('pg').Pool;
} catch (e) {
  Pool = null;
}

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
const MULTICAM_FILE = path.join(DATA_DIR, 'multicam.json');
const BANNED_IPS_FILE = path.join(DATA_DIR, 'banned_ips.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// ============================================================
// CONEXIÓN SQL (POSTGRESQL) PARA PERSISTENCIA DEFINITIVA
// ============================================================
let dbPool = null;
let isDbReady = false;
let dbInitPromise = null;

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
  multicam: {
    isActive: false,
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
    ttsStyle: 'equipo', // 'equipo' ("Equipo,...") | 'equipo_breve' | 'classic'
    ttsRate: 0.93,
    ttsPitch: 0.82,
    ttsVoiceName: '',
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

function savePresenters(presentersList, persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(presentersList, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('presenters', presentersList);
    }
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
        if (typeof data.chatOverlay.ttsStyle === 'string') {
          liveState.chatOverlay.ttsStyle = data.chatOverlay.ttsStyle;
        }
        if (typeof data.chatOverlay.ttsRate === 'number') {
          liveState.chatOverlay.ttsRate = data.chatOverlay.ttsRate;
        }
        if (typeof data.chatOverlay.ttsPitch === 'number') {
          liveState.chatOverlay.ttsPitch = data.chatOverlay.ttsPitch;
        }
        if (typeof data.chatOverlay.ttsVoiceName === 'string') {
          liveState.chatOverlay.ttsVoiceName = data.chatOverlay.ttsVoiceName;
        }
      }
      return data;
    }
  } catch (err) {
    console.error('Error al cargar settings:', err);
  }
  return {};
}

function getSettingsPayload() {
  return {
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
      commandPrefix: liveState.chatOverlay.commandPrefix,
      ttsStyle: liveState.chatOverlay.ttsStyle || 'equipo',
      ttsRate: liveState.chatOverlay.ttsRate || 0.93,
      ttsPitch: liveState.chatOverlay.ttsPitch || 0.82,
      ttsVoiceName: liveState.chatOverlay.ttsVoiceName || ''
    }
  };
}

function saveSettings(persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = getSettingsPayload();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('settings', payload);
    }
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

function saveFights(fightsList, persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FIGHTS_FILE, JSON.stringify(fightsList, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('fights', fightsList);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar combates:', err);
    return false;
  }
}

// Configuración y gestión de Multicam / Videollamadas
let multicamSettings = {
  activeScene: 'pip-corner-tr', // 'grid' | 'pip-corner-tr' | 'pip-corner-br' | 'pip-corner-tl' | 'pip-corner-bl' | 'pip-bottom-bar'
  showLabels: true,
  audioMutedOverall: false,
  aspectRatio: '16/9', // '16/9' | '4/3' | '1/1'
  borderGlow: true,
  streamBackgroundMode: true,
  camScale: 1.0, // Escala de cámaras (0.5 a 1.5)
  scale: 100, // porcentaje de escala visual
  maxVisibleCams: 6
};

function loadMulticamSettings() {
  try {
    if (fs.existsSync(MULTICAM_FILE)) {
      const data = JSON.parse(fs.readFileSync(MULTICAM_FILE, 'utf-8'));
      multicamSettings = { ...multicamSettings, ...data };
      return multicamSettings;
    }
  } catch (err) {
    console.error('Error al cargar multicam settings:', err);
  }
  return multicamSettings;
}

function saveMulticamSettings(persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MULTICAM_FILE, JSON.stringify(multicamSettings, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('multicam', multicamSettings);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar multicam settings:', err);
    return false;
  }
}

// Memoria volátil de participantes por sala de videollamada
let multicamRooms = {
  main: {
    peers: {}
  }
};

function getRoomPeers(roomId) {
  if (!multicamRooms[roomId]) {
    multicamRooms[roomId] = { peers: {} };
  }
  return Object.values(multicamRooms[roomId].peers);
}

// Búsqueda de IP real del cliente (con soporte para proxies de Railway/Cloudflare)
function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || (socket.conn && socket.conn.remoteAddress) || '127.0.0.1';
}

let bannedIps = new Set();

function loadBannedIps() {
  try {
    if (fs.existsSync(BANNED_IPS_FILE)) {
      const list = JSON.parse(fs.readFileSync(BANNED_IPS_FILE, 'utf-8'));
      if (Array.isArray(list)) bannedIps = new Set(list);
    }
  } catch (err) {
    console.error('Error al cargar banned_ips:', err);
  }
  return bannedIps;
}

function saveBannedIps(persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = Array.from(bannedIps);
    fs.writeFileSync(BANNED_IPS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('banned_ips', list);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar banned_ips:', err);
    return false;
  }
}

// Inicialización de datos
let savedSettings = loadSettings();
let presenters = loadPresenters();
let fights = loadFights();
loadMulticamSettings();
loadBannedIps();

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
  saveFights(fights, false);
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
  savePresenters(presenters, false);
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

saveSettings(false);

// ============================================================
// CONEXIÓN Y SINCRONIZACIÓN SQL (POSTGRESQL) - PERSISTENCIA DEFINITIVA
// ============================================================
async function saveToDb(key, data) {
  if (dbPool && isDbReady) {
    try {
      await dbPool.query(
        `INSERT INTO app_storage (key, data, updated_at)
         VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
        [key, JSON.stringify(data)]
      );
    } catch (err) {
      console.error(`Error guardando ${key} en PostgreSQL:`, err.message);
    }
  }
}

async function syncDataFromDatabase() {
  if (!dbPool || !isDbReady) return;
  try {
    const res = await dbPool.query('SELECT key, data FROM app_storage');
    const dbData = {};
    res.rows.forEach(r => {
      let val = r.data;
      while (typeof val === 'string') {
        try {
          val = JSON.parse(val);
        } catch (e) {
          break;
        }
      }
      dbData[r.key] = val;
    });

    let changed = false;

    // 1. Sincronizar Presentadores
    if (dbData.presenters && Array.isArray(dbData.presenters) && dbData.presenters.length > 0) {
      presenters = dbData.presenters;
      savePresenters(presenters, false);
      io.emit('presenters-updated', presenters);
      changed = true;
    } else if (presenters.length > 0) {
      await saveToDb('presenters', presenters);
    }

    // 2. Sincronizar Combates (La Velada del Caos)
    if (dbData.fights && Array.isArray(dbData.fights) && dbData.fights.length > 0) {
      fights = dbData.fights;
      saveFights(fights, false);
      io.emit('fights-updated', fights);
      changed = true;
    } else if (fights.length > 0) {
      await saveToDb('fights', fights);
    }

    // 3. Sincronizar Settings (Escala, auto-hide, HUD superior, chat TTS, cola)
    if (dbData.settings && typeof dbData.settings === 'object') {
      const s = dbData.settings;
      if (typeof s.scale === 'number') liveState.scale = s.scale;
      if (typeof s.defaultAutoHide === 'number') liveState.defaultAutoHide = s.defaultAutoHide;
      if (s.topHud) liveState.topHud = { ...liveState.topHud, ...s.topHud };
      if (s.chatOverlay) liveState.chatOverlay = { ...liveState.chatOverlay, ...s.chatOverlay };
      if (s.queue) {
        if (s.queue.leftId) {
          liveState.queue.left = presenters.find(p => p.id === s.queue.leftId) || presenters[0] || null;
        }
        if (s.queue.rightId) {
          liveState.queue.right = presenters.find(p => p.id === s.queue.rightId) || presenters[1] || presenters[0] || null;
        }
      }
      saveSettings(false);
      io.emit('state-update', liveState);
      changed = true;
    } else {
      await saveToDb('settings', getSettingsPayload());
    }

    // 4. Sincronizar Multicam
    if (dbData.multicam && typeof dbData.multicam === 'object') {
      multicamSettings = { ...multicamSettings, ...dbData.multicam };
      saveMulticamSettings(false);
      io.emit('multicam-settings-updated', multicamSettings);
      changed = true;
    } else {
      await saveToDb('multicam', multicamSettings);
    }

    // 5. Sincronizar IPs Baneadas
    if (dbData.banned_ips && Array.isArray(dbData.banned_ips)) {
      bannedIps = new Set(dbData.banned_ips);
      saveBannedIps(false);
      changed = true;
    } else {
      await saveToDb('banned_ips', Array.from(bannedIps));
    }

    if (changed) {
      console.log('🔄 Estado sincronizado con éxito desde PostgreSQL');
    }
  } catch (err) {
    console.error('Error sincronizando datos con PostgreSQL:', err.message);
  }
}

async function initDatabase() {
  const connectionString = process.env.DATABASE_URL || 
                           process.env.POSTGRES_URL || 
                           process.env.DATABASE_PUBLIC_URL || 
                           process.env.DATABASE_PRIVATE_URL || 
                           process.env.PGURL;
  const hasPgEnv = !!connectionString || !!process.env.PGHOST;

  if (Pool && hasPgEnv) {
    try {
      const isLocal = connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'));
      if (connectionString) {
        dbPool = new Pool({
          connectionString,
          ssl: isLocal ? false : { rejectUnauthorized: false }
        });
      } else {
        dbPool = new Pool({
          host: process.env.PGHOST,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
          port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
          ssl: { rejectUnauthorized: false }
        });
      }

      await dbPool.query('SELECT 1');

      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS app_storage (
          key VARCHAR(100) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('🐘 PostgreSQL conectado exitosamente y tabla app_storage lista');
      isDbReady = true;
      await syncDataFromDatabase();
    } catch (err) {
      console.warn('⚠️ No se pudo inicializar tabla en PostgreSQL, usando almacenamiento local:', err.message);
    }
  } else {
    console.log('💾 Usando almacenamiento persistente en archivos JSON (data/)');
  }
}

dbInitPromise = initDatabase();

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
app.get('/api/state', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  res.json(liveState);
});
app.get('/api/presenters', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  res.json(presenters);
});
app.get('/api/settings', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  res.json({
    scale: liveState.scale,
    defaultAutoHide: liveState.defaultAutoHide,
    queue: liveState.queue
  });
});

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
  if (index === -1) {
    const newPres = { ...req.body, id };
    presenters.push(newPres);
    savePresenters(presenters);
    io.emit('presenters-updated', presenters);
    return res.status(201).json(newPres);
  }

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
app.get('/api/fights', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  res.json(fights);
});

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
  if (index === -1) {
    const newFight = { ...req.body, id };
    fights.push(newFight);
    saveFights(fights);
    io.emit('fights-updated', fights);
    return res.status(201).json(newFight);
  }

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

// Rutas de Sistema Multicam / Videollamada
app.get(['/multicam', '/overlay-multicam'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'multicam.html'));
});

app.get(['/guest', '/call', '/join', '/invitado'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guest.html'));
});

app.get('/api/multicam/state', (req, res) => {
  res.json({
    settings: multicamSettings,
    rooms: {
      main: getRoomPeers('main')
    }
  });
});

// Endpoint de diagnóstico del estado de PostgreSQL / SQL
app.get('/api/db-status', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const hasPgEnv = !!(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.PGHOST
  );
  const dbInfo = {
    hasDatabaseUrl: hasPgEnv,
    isPostgresConnected: isDbReady,
    storageType: isDbReady ? 'PostgreSQL (Cloud SQL)' : 'Local JSON Files (data/)',
    serverUptimeSeconds: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV || 'production'
  };

  if (dbPool && isDbReady) {
    try {
      const result = await dbPool.query('SELECT key, updated_at FROM app_storage');
      dbInfo.storedKeys = result.rows;
    } catch (e) {
      dbInfo.queryError = e.message;
    }
  }

  res.json(dbInfo);
});

app.post('/api/multicam/settings', (req, res) => {
  multicamSettings = { ...multicamSettings, ...req.body };
  saveMulticamSettings();
  io.emit('multicam-settings-updated', multicamSettings);
  res.json({ success: true, settings: multicamSettings });
});

app.post('/api/multicam/upload-avatar', (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No se envió imagen' });
    }
    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }
    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace('svg+xml', 'svg');
    const cleanName = `avatar-${Date.now()}-${Math.round(Math.random() * 1e5)}.${extension}`;
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, cleanName);
    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
    res.json({ success: true, url: `/uploads/${cleanName}` });
  } catch (err) {
    console.error('Error al subir avatar de invitado:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen' });
  }
});

app.get(['/', '/admin', '/host'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSockets en tiempo real
io.on('connection', async (socket) => {
  if (dbInitPromise) {
    try {
      await dbInitPromise;
    } catch (e) {}
  }
  socket.emit('state-update', liveState);
  socket.emit('presenters-updated', presenters);
  socket.emit('fights-updated', fights);
  socket.emit('multicam-settings-updated', multicamSettings);

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

  // 5.b.2. Banco de Animaciones - Escena Multicam / Videollamada en Vivo
  socket.on('show-multicam', (data) => {
    if (data && data.scene) {
      multicamSettings.activeScene = data.scene;
      saveMulticamSettings();
      io.emit('multicam-settings-updated', multicamSettings);
    }
    liveState.multicam = {
      isActive: true,
      shownAt: Date.now()
    };
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('hide-multicam', () => {
    liveState.multicam = {
      isActive: false,
      shownAt: null
    };
    saveSettings();
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
      ttsStyle: liveState.chatOverlay.ttsStyle || 'equipo',
      ttsRate: liveState.chatOverlay.ttsRate || 0.93,
      ttsPitch: liveState.chatOverlay.ttsPitch || 0.82,
      ttsVoiceName: liveState.chatOverlay.ttsVoiceName || '',
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

  socket.on('update-chat-tts-config', (data) => {
    if (!data) return;
    if (typeof data.style === 'string') liveState.chatOverlay.ttsStyle = data.style;
    if (typeof data.rate === 'number') liveState.chatOverlay.ttsRate = data.rate;
    if (typeof data.pitch === 'number') liveState.chatOverlay.ttsPitch = data.pitch;
    if (typeof data.voiceName === 'string') liveState.chatOverlay.ttsVoiceName = data.voiceName;
    saveSettings();
    io.emit('state-update', liveState);
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

  // ============================================================
  // EVENTOS DE WEBRTC Y SALAS MULTICAM
  // ============================================================

  // Enviar estado actual a nuevos clientes conectados
  socket.emit('multicam-settings-updated', multicamSettings);
  socket.emit('multicam-admin-peers-updated', { roomId: 'main', peers: getRoomPeers('main') });
  socket.emit('multicam-banned-ips-updated', { bannedIps: Array.from(bannedIps) });

  // Unirse a una sala (Invitado, Host u Overlay de OBS)
  socket.on('multicam-join', ({ roomId = 'main', peerId, userInfo = {}, role = 'guest' }, callback) => {
    if (!peerId) {
      if (typeof callback === 'function') callback({ success: false, error: 'peerId requerido' });
      return;
    }

    if (!multicamRooms[roomId]) {
      multicamRooms[roomId] = { peers: {} };
    }

    // Iniciales automáticas estilo Teams (primer letra de nombre y apellido, o 2 primeras letras)
    let initials = userInfo.initials;
    if (!initials && userInfo.name) {
      const parts = userInfo.name.trim().split(/\s+/);
      initials = (parts.length > 1)
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].substring(0, 2).toUpperCase();
    }
    if (!initials) initials = 'BV';

    const clientIp = getClientIp(socket);
    if (role === 'guest' && bannedIps.has(clientIp)) {
      socket.emit('multicam-banned', { reason: 'Has sido bloqueado de esta sala por el anfitrión.' });
      if (typeof callback === 'function') callback({ success: false, banned: true, error: 'Has sido bloqueado por el anfitrión.' });
      socket.disconnect(true);
      return;
    }

    const isHost = !!(userInfo.isHost || role === 'host');
    const peerData = {
      id: peerId,
      socketId: socket.id,
      roomId,
      role: isHost ? 'host' : role, // 'guest' | 'host' | 'overlay'
      isHost: isHost,
      name: userInfo.name || 'Invitado',
      photo: userInfo.photo || '',
      initials,
      hasVideo: userInfo.hasVideo !== false,
      hasAudio: userInfo.hasAudio !== false,
      isStreamMuted: false, // Silenciado en stream pero audible en sala
      isHidden: false,
      slot: null,
      clientIp,
      joinedAt: Date.now()
    };

    multicamRooms[roomId].peers[peerId] = peerData;
    socket.multicamRoomId = roomId;
    socket.multicamPeerId = peerId;
    socket.multicamRole = role;

    socket.join('multicam-' + roomId);

    const currentPeers = getRoomPeers(roomId);
    
    // Notificar a todos en la sala del nuevo participante
    io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
    // Notificar también al panel de Host general
    io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });

    if (typeof callback === 'function') {
      callback({
        success: true,
        settings: multicamSettings,
        peerId,
        peers: currentPeers
      });
    }
  });

  // Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on('multicam-signal', ({ toPeerId, fromPeerId, signal, roomId = 'main' }) => {
    const room = multicamRooms[roomId];
    if (room && room.peers[toPeerId]) {
      const targetSocketId = room.peers[toPeerId].socketId;
      io.to(targetSocketId).emit('multicam-signal', {
        fromPeerId: fromPeerId || socket.multicamPeerId,
        signal
      });
    }
  });

  // Actualizar perfil de participante en vivo (ej. apagar cámara, mutearse, cambiar nombre o foto)
  socket.on('multicam-update-profile', ({ roomId = 'main', userInfo }) => {
    const pId = socket.multicamPeerId;
    if (pId && multicamRooms[roomId] && multicamRooms[roomId].peers[pId]) {
      const peer = multicamRooms[roomId].peers[pId];
      if (typeof userInfo.name === 'string') peer.name = userInfo.name;
      if (typeof userInfo.photo === 'string') peer.photo = userInfo.photo;
      if (typeof userInfo.hasVideo === 'boolean') peer.hasVideo = userInfo.hasVideo;
      if (typeof userInfo.hasAudio === 'boolean') peer.hasAudio = userInfo.hasAudio;
      if (typeof userInfo.isHost === 'boolean') {
        peer.isHost = userInfo.isHost;
        peer.role = userInfo.isHost ? 'host' : 'guest';
      }
      if (userInfo.initials) peer.initials = userInfo.initials;

      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Designar / Desmarcar Anfitrión (Host) desde panel o cliente
  socket.on('multicam-set-host', ({ roomId = 'main', peerId, isHost }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].isHost = !!isHost;
      multicamRooms[roomId].peers[peerId].role = isHost ? 'host' : 'guest';
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Cambio de Escena Multicam desde el panel de Host
  socket.on('multicam-change-scene', ({ scene }) => {
    if (scene) {
      multicamSettings.activeScene = scene;
      saveMulticamSettings();
      io.emit('multicam-settings-updated', multicamSettings);
    }
  });

  // Guardar ajustes generales de multicam
  socket.on('multicam-save-settings', (newSettings) => {
    multicamSettings = { ...multicamSettings, ...newSettings };
    saveMulticamSettings();
    io.emit('multicam-settings-updated', multicamSettings);
  });

  // Ocultar o mostrar una cámara específica en el overlay
  socket.on('multicam-toggle-peer-visibility', ({ roomId = 'main', peerId, isHidden }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].isHidden = !!isHidden;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Asignar slot / posición a una cámara
  socket.on('multicam-assign-slot', ({ roomId = 'main', peerId, slot }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].slot = slot;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Expulsar participante de la sala
  socket.on('multicam-kick-peer', ({ roomId = 'main', peerId }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      const targetSocketId = multicamRooms[roomId].peers[peerId].socketId;
      io.to(targetSocketId).emit('multicam-kicked');
      delete multicamRooms[roomId].peers[peerId];
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Silenciar en Stream (en OBS queda mudo pero en la sala privada se sigue escuchando)
  socket.on('multicam-toggle-stream-mute', ({ roomId = 'main', peerId, isStreamMuted }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].isStreamMuted = !!isStreamMuted;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Forzar mute de micrófono al participante (en toda la sala)
  socket.on('multicam-force-mute-peer', ({ roomId = 'main', peerId }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      const targetSocketId = multicamRooms[roomId].peers[peerId].socketId;
      multicamRooms[roomId].peers[peerId].hasAudio = false;
      io.to(targetSocketId).emit('multicam-force-mute');
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Banear participante por IP
  socket.on('multicam-ban-peer', ({ roomId = 'main', peerId, reason }) => {
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      const peer = multicamRooms[roomId].peers[peerId];
      const targetSocketId = peer.socketId;
      const ip = peer.clientIp;

      if (ip && ip !== 'unknown') {
        bannedIps.add(ip);
        saveBannedIps();
      }

      io.to(targetSocketId).emit('multicam-banned', { reason: reason || 'Has sido expulsado y bloqueado por el anfitrión.' });
      delete multicamRooms[roomId].peers[peerId];

      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.to('multicam-' + roomId).emit('multicam-peer-left', { peerId });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-banned-ips-updated', { bannedIps: Array.from(bannedIps) });
    }
  });

  // Desbanear IP
  socket.on('multicam-unban-ip', ({ ip }) => {
    if (ip && bannedIps.has(ip)) {
      bannedIps.delete(ip);
      saveBannedIps();
      io.emit('multicam-banned-ips-updated', { bannedIps: Array.from(bannedIps) });
    }
  });

  // Obtener lista de IPs baneadas
  socket.on('multicam-get-banned-ips', (callback) => {
    if (typeof callback === 'function') {
      callback({ bannedIps: Array.from(bannedIps) });
    }
  });

  // Enviar estado de Kick Chat al conectarse el socket
  socket.emit('kick-chat-status', kickChatState);

  // Manejo de desconexión para limpiar WebRTC
  socket.on('disconnect', () => {
    const roomId = socket.multicamRoomId;
    const peerId = socket.multicamPeerId;
    if (roomId && peerId && multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      delete multicamRooms[roomId].peers[peerId];
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.to('multicam-' + roomId).emit('multicam-peer-left', { peerId });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });
});

// ============================================================
// INTEGRACIÓN KICK CHAT EN VIVO (!anuncio <texto> -> Banner + TTS)
// Canal: birraverde | ID: 113928888 | Chatroom ID: 113639376
// URL: https://kick.com/popout/birraverde/chat
// ============================================================
const KICK_CHANNEL_SLUG = 'birraverde';
const KICK_CHANNEL_ID = '113928888';
const KICK_CHATROOM_ID = '113639376';

let kickChatState = {
  connected: false,
  lastPing: null,
  channel: KICK_CHANNEL_SLUG,
  chatroomId: KICK_CHATROOM_ID,
  recentAnnouncements: []
};

const seenKickMsgIds = new Set();
let kickWsInstance = null;

app.get('/api/kick/status', (req, res) => {
  res.json(kickChatState);
});

async function initKickChatListener() {
  const WebSocket = require('ws');
  console.log(`[Kick Chat] Iniciando conexión Pusher para canal "${KICK_CHANNEL_SLUG}"...`);

  try {
    let appKey = '34bf7a0ff419a2a775b9';
    let cluster = 'us2';

    // 1. Obtener credenciales activas de Pusher desde la API de Kick
    try {
      const connRes = await fetch(`https://web.kick.com/api/v1/realtime/channels/${KICK_CHANNEL_ID}/chat/connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          client: { id: 'bot-client', type: 'web' },
          capabilities: { accepted_providers: [{ provider: 'pusher' }] }
        })
      });
      const connData = await connRes.json();
      const conn = connData?.data?.connections?.find(c => c.provider === 'pusher');
      if (conn?.credentials?.app_key) {
        appKey = conn.credentials.app_key;
        cluster = conn.credentials.cluster || 'us2';
      }
    } catch (e) {
      console.warn('[Kick Chat] Advertencia al obtener config dinámica, usando defaults:', e.message);
    }

    const wsUrl = `wss://ws-${cluster}.pusher.com/app/${appKey}?protocol=7&client=js&version=8.4.0&flash=false`;
    console.log(`[Kick Chat] Conectando WebSocket Pusher a ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    kickWsInstance = ws;

    ws.on('open', () => {
      console.log('[Kick Chat] Socket Pusher abierto, esperando establecimiento...');
    });

    ws.on('message', (raw) => {
      try {
        const rawStr = raw ? raw.toString() : '';
        if (!rawStr) return;

        const msg = JSON.parse(rawStr);

        // Handshake establecido -> Suscribirse al canal de chatroom de birraverde
        if (msg.event === 'pusher:connection_established') {
          console.log(`[Kick Chat] Handshake completado. Suscribiéndose al chatroom ${KICK_CHATROOM_ID}...`);
          ws.send(JSON.stringify({
            event: 'pusher:subscribe',
            data: {
              auth: '',
              channel: `chatrooms.${KICK_CHATROOM_ID}.v2`
            }
          }));
          return;
        }

        // Suscripción confirmada por Kick Pusher
        if (msg.event === 'pusher_internal:subscription_succeeded') {
          kickChatState.connected = true;
          console.log(`[Kick Chat] ✅ CONECTADO Y ESCUCHANDO CHAT DE KICK (@${KICK_CHANNEL_SLUG})`);
          io.emit('kick-chat-status', kickChatState);
          return;
        }

        // Responder heartbeat ping
        if (msg.event === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          return;
        }

        // Evento de Mensaje de Chat en Vivo
        if (msg.event === 'App\\Events\\ChatMessageEvent' || msg.event === 'App\\Events\\ChatMessageSentEvent') {
          let chatData = msg.data;
          if (typeof chatData === 'string') {
            try { chatData = JSON.parse(chatData); } catch (e) {}
          }
          if (chatData.data && typeof chatData.data === 'string') {
            try { chatData = JSON.parse(chatData.data); } catch (e) {}
          }

          const messageId = chatData.id || `${chatData.sender?.id || 'anon'}_${Date.now()}`;
          if (messageId && seenKickMsgIds.has(messageId)) return;
          if (messageId) {
            seenKickMsgIds.add(messageId);
            if (seenKickMsgIds.size > 200) {
              const first = seenKickMsgIds.values().next().value;
              seenKickMsgIds.delete(first);
            }
          }

          const content = (chatData.content || chatData.message || '').trim();
          const sender = chatData.sender?.username || chatData.sender?.slug || 'Espectador Kick';

          console.log(`[Kick Chat] @${sender}: ${content}`);

          // Comprobar si es un comando de anuncio: !anuncio <texto>
          const match = content.match(/^!anuncio(?:\s+([\s\S]+))?$/i);
          if (match) {
            const announcementText = (match[1] || '').trim();
            if (announcementText) {
              console.log(`[Kick Chat] 📢 ¡COMANDO !anuncio RECIBIDO de @${sender}: "${announcementText}"`);
              const payload = {
                user: `@${sender}`,
                text: announcementText,
                prefix: '!anuncio',
                tts: liveState.chatOverlay.ttsEnabled,
                ttsStyle: liveState.chatOverlay.ttsStyle || 'equipo',
                ttsRate: liveState.chatOverlay.ttsRate || 0.93,
                ttsPitch: liveState.chatOverlay.ttsPitch || 0.82,
                ttsVoiceName: liveState.chatOverlay.ttsVoiceName || '',
                timestamp: Date.now(),
                source: 'kick'
              };

              liveState.chatOverlay.isVisible = true;
              liveState.chatOverlay.lastMessage = payload;
              io.emit('state-update', liveState);
              io.emit('chat-announcement', payload);

              kickChatState.recentAnnouncements.unshift(payload);
              if (kickChatState.recentAnnouncements.length > 20) {
                kickChatState.recentAnnouncements.pop();
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Kick Chat] Error al procesar mensaje Pusher:', err);
      }
    });

    ws.on('error', (err) => {
      console.warn('[Kick Chat] Error en WebSocket Pusher:', err.message || err);
    });

    ws.on('close', () => {
      kickChatState.connected = false;
      io.emit('kick-chat-status', kickChatState);
      console.warn('[Kick Chat] Conexión cerrada. Reconectando en 4s...');
      setTimeout(initKickChatListener, 4000);
    });

  } catch (err) {
    kickChatState.connected = false;
    io.emit('kick-chat-status', kickChatState);
    console.warn('[Kick Chat] Falló inicialización:', err.message, 'Reintentando en 6s...');
    setTimeout(initKickChatListener, 6000);
  }
}

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Stream Overlay App corriendo en puerto ${PORT}`);
  console.log(`🎮 Panel de Host:      http://localhost:${PORT}/`);
  console.log(`🎥 Fuente OBS Overlay: http://localhost:${PORT}/overlay`);
  console.log(`📹 Fuente OBS Multicam: http://localhost:${PORT}/multicam`);
  console.log(`👥 Sala de Invitados:  http://localhost:${PORT}/guest`);
  console.log(`💾 Persistencia:       ACTIVA`);
  console.log(`🟢 Kick Chat Bot:      @${KICK_CHANNEL_SLUG} (Canal ${KICK_CHANNEL_ID})`);
  console.log(`===============================================`);

  // Iniciar conexión automática con el chat en vivo de Kick
  setTimeout(initKickChatListener, 1500);
});