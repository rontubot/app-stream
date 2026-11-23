const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MODS_CHAT_FILE = path.join(DATA_DIR, 'mods_chat.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// ============================================================
// SISTEMA DE SEGURIDAD, SESIONES Y BASE DE DATOS DE USUARIOS
// Niveles soportados: 'nivel_1' (Usuario Nivel 1 / Admin) y 'mods' (MODS)
// ============================================================
const SESSION_COOKIE_NAME = 'bv_session';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DATABASE_URL || 'birraverde-stream-control-secret-2026';
let users = [];

function hashPassword(plainPassword, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plainPassword), actualSalt, 64).toString('hex');
  return `${actualSalt}:${derived}`;
}

function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const derived = crypto.scryptSync(String(plainPassword), salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch (e) {
    return false;
  }
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    level: u.level === 'nivel_1' ? 'nivel_1' : 'mods',
    levelLabel: u.level === 'nivel_1' ? 'Usuario Nivel 1' : 'MODS',
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null
  };
}

function createSessionToken(user) {
  const payload = {
    uid: user.id,
    usr: user.username,
    lvl: user.level,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 días
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  try {
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    // Buscar usuario activo en base de datos en memoria
    const found = users.find(u => u.id === payload.uid || u.username.toLowerCase() === String(payload.usr || '').toLowerCase());
    if (!found) return null;
    return sanitizeUser(found);
  } catch (e) {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const val = parts.join('=').trim();
    if (name) {
      try {
        list[name] = decodeURIComponent(val);
      } catch (e) {
        list[name] = val;
      }
    }
  });
  return list;
}

function getAuthenticatedUserFromReq(req) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies[SESSION_COOKIE_NAME];
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }
  return verifySessionToken(token);
}

function getAuthenticatedUserFromSocket(socket) {
  const cookies = parseCookies(socket.handshake?.headers?.cookie);
  let token = cookies[SESSION_COOKIE_NAME];
  if (!token && socket.handshake?.auth?.token) {
    token = socket.handshake.auth.token;
  }
  return verifySessionToken(token);
}

async function requireAuth(req, res, next) {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const user = getAuthenticatedUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'No autorizado. Debes iniciar sesión.' });
  }
  req.user = user;
  next();
}

async function requireNivel1(req, res, next) {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const user = getAuthenticatedUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'No autorizado. Debes iniciar sesión.' });
  }
  if (user.level !== 'nivel_1') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere nivel Usuario Nivel 1 (Admin).' });
  }
  req.user = user;
  next();
}

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

// Favicon oficial BirraVerde
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Ruta de Login Pública
app.get('/login', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const user = getAuthenticatedUserFromReq(req);
  if (user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protección estricta del Dominio Principal (/, /admin, /host, /index.html) ANTES de express.static
app.get(['/', '/admin', '/host', '/index.html'], async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const user = getAuthenticatedUserFromReq(req);
  if (!user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Respaldo dinámico desde PostgreSQL si el contenedor de Railway se reinició o hubo un nuevo deploy/push
app.get('/uploads/:filename', async (req, res) => {
  const safeName = path.basename(req.params.filename || '');
  if (!safeName) return res.status(404).end();
  const localPath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  if (dbPool && isDbReady) {
    try {
      const result = await dbPool.query(
        'SELECT mime_type, data_base64 FROM uploaded_files WHERE filename = $1',
        [safeName]
      );
      if (result.rows.length > 0) {
        const { mime_type, data_base64 } = result.rows[0];
        const buffer = Buffer.from(data_base64, 'base64');
        try {
          fs.mkdirSync(UPLOADS_DIR, { recursive: true });
          fs.writeFileSync(localPath, buffer);
        } catch (e) {}
        res.setHeader('Content-Type', mime_type || 'image/png');
        return res.send(buffer);
      }
    } catch (err) {
      console.error('Error recuperando imagen desde PostgreSQL:', err.message);
    }
  }
  return res.status(404).send('Imagen no encontrada');
});

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
  masterMuted: false,
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
  },
  eventCountdown: {
    enabled: false,
    title: 'LA VELADA DEL CAOS',
    description: 'Transmisión especial en vivo • Prepárate para el gran evento',
    image: '',
    targetDate: '',
    targetTime: '22:00',
    targetTimestamp: null,
    updatedAt: null
  },
  modAlert: {
    isActive: false,
    triggeredBy: '',
    triggeredAt: null
  },
  adminPresence: {
    status: 'offline', // 'online_mods' | 'online_panel' | 'away' | 'offline'
    activeTab: 'main',
    username: 'Admin',
    updatedAt: null
  },
  quiz: {
    isVisible: false,
    questionId: 'etapa1-q1',
    stage: 'etapa1',
    type: 'multiple', // 'multiple' (4 opciones A,B,C,D) | 'boolean' (Verdadero o Falso)
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 1 DE 10)',
    question: '¿Cuántas puertas abre Rock Lee en su enfrentamiento contra Gaara en Naruto clásico?',
    options: {
      A: 'Tres puertas',
      B: 'Cuatro puertas',
      C: 'Cinco puertas',
      D: 'Seis puertas'
    },
    correctOption: 'C', // 'A' | 'B' | 'C' | 'D'
    selectedOption: null, // 'A' | 'B' | 'C' | 'D' | null
    explanation: 'Rock Lee llega hasta la quinta de las ocho puertas internas para ejecutar el Loto Inverso. Esto ocurre durante el episodio 50 de Naruto clásico.',
    showCorrect: false,
    shownAt: null,
    updatedAt: null
  }
};

// Registro en memoria de sesiones conectadas del Admin (Nivel 1) para detectar si está En Línea o Ausente
const adminSocketsPresence = new Map();

function recomputeAdminPresence() {
  if (adminSocketsPresence.size === 0) {
    liveState.adminPresence = {
      status: 'offline',
      activeTab: 'main',
      username: 'Admin',
      updatedAt: Date.now()
    };
    io.emit('admin-presence-updated', liveState.adminPresence);
    return;
  }

  const priority = { online_mods: 4, online_panel: 3, away: 2, offline: 1 };
  let best = null;
  for (const entry of adminSocketsPresence.values()) {
    if (!best || (priority[entry.status] || 0) > (priority[best.status] || 0)) {
      best = entry;
    }
  }

  liveState.adminPresence = {
    status: best ? best.status : 'away',
    activeTab: best ? best.activeTab : 'main',
    username: best ? best.username : 'Admin',
    updatedAt: Date.now()
  };
  io.emit('admin-presence-updated', liveState.adminPresence);
}

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
      if (typeof data.masterMuted === 'boolean') {
        liveState.masterMuted = data.masterMuted;
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
      if (data.eventCountdown && typeof data.eventCountdown === 'object') {
        if (typeof data.eventCountdown.enabled === 'boolean') {
          liveState.eventCountdown.enabled = data.eventCountdown.enabled;
        }
        if (typeof data.eventCountdown.title === 'string') {
          liveState.eventCountdown.title = data.eventCountdown.title;
        }
        if (typeof data.eventCountdown.description === 'string') {
          liveState.eventCountdown.description = data.eventCountdown.description;
        }
        if (typeof data.eventCountdown.image === 'string') {
          liveState.eventCountdown.image = data.eventCountdown.image;
        }
        if (typeof data.eventCountdown.targetDate === 'string') {
          liveState.eventCountdown.targetDate = data.eventCountdown.targetDate;
        }
        if (typeof data.eventCountdown.targetTime === 'string') {
          liveState.eventCountdown.targetTime = data.eventCountdown.targetTime;
        }
        if (typeof data.eventCountdown.targetTimestamp === 'number' || data.eventCountdown.targetTimestamp === null) {
          liveState.eventCountdown.targetTimestamp = data.eventCountdown.targetTimestamp;
        }
        if (typeof data.eventCountdown.updatedAt === 'number' || data.eventCountdown.updatedAt === null) {
          liveState.eventCountdown.updatedAt = data.eventCountdown.updatedAt;
        }
      }
      if (data.quiz && typeof data.quiz === 'object') {
        if (typeof data.quiz.isVisible === 'boolean') liveState.quiz.isVisible = data.quiz.isVisible;
        if (typeof data.quiz.questionId === 'string') liveState.quiz.questionId = data.quiz.questionId;
        if (typeof data.quiz.stage === 'string') liveState.quiz.stage = data.quiz.stage;
        if (data.quiz.type === 'boolean' || data.quiz.type === 'multiple') liveState.quiz.type = data.quiz.type;
        if (typeof data.quiz.category === 'string') liveState.quiz.category = data.quiz.category;
        if (typeof data.quiz.question === 'string') liveState.quiz.question = data.quiz.question;
        if (typeof data.quiz.explanation === 'string') liveState.quiz.explanation = data.quiz.explanation;
        if (data.quiz.options && typeof data.quiz.options === 'object') {
          liveState.quiz.options = {
            A: typeof data.quiz.options.A === 'string' ? data.quiz.options.A : liveState.quiz.options.A,
            B: typeof data.quiz.options.B === 'string' ? data.quiz.options.B : liveState.quiz.options.B,
            C: typeof data.quiz.options.C === 'string' ? data.quiz.options.C : liveState.quiz.options.C,
            D: typeof data.quiz.options.D === 'string' ? data.quiz.options.D : liveState.quiz.options.D
          };
        }
        if (['A', 'B', 'C', 'D'].includes(data.quiz.correctOption)) {
          liveState.quiz.correctOption = data.quiz.correctOption;
        }
        if (['A', 'B', 'C', 'D'].includes(data.quiz.selectedOption) || data.quiz.selectedOption === null) {
          liveState.quiz.selectedOption = data.quiz.selectedOption;
        }
        if (typeof data.quiz.showCorrect === 'boolean') {
          liveState.quiz.showCorrect = data.quiz.showCorrect;
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
    masterMuted: !!liveState.masterMuted,
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
    },
    eventCountdown: {
      enabled: !!liveState.eventCountdown.enabled,
      title: liveState.eventCountdown.title || '',
      description: liveState.eventCountdown.description || '',
      image: liveState.eventCountdown.image || '',
      targetDate: liveState.eventCountdown.targetDate || '',
      targetTime: liveState.eventCountdown.targetTime || '',
      targetTimestamp: liveState.eventCountdown.targetTimestamp || null,
      updatedAt: liveState.eventCountdown.updatedAt || null
    },
    quiz: {
      isVisible: !!liveState.quiz.isVisible,
      questionId: liveState.quiz.questionId || null,
      stage: liveState.quiz.stage || 'etapa1',
      type: liveState.quiz.type === 'boolean' ? 'boolean' : 'multiple',
      category: liveState.quiz.category || '¿QUIÉN QUIERE SER MILLONARIO? • BIRRAVERDE',
      question: liveState.quiz.question || '',
      options: {
        A: (liveState.quiz.options && liveState.quiz.options.A) || '',
        B: (liveState.quiz.options && liveState.quiz.options.B) || '',
        C: (liveState.quiz.options && liveState.quiz.options.C) || '',
        D: (liveState.quiz.options && liveState.quiz.options.D) || ''
      },
      correctOption: ['A', 'B', 'C', 'D'].includes(liveState.quiz.correctOption) ? liveState.quiz.correctOption : 'A',
      selectedOption: ['A', 'B', 'C', 'D'].includes(liveState.quiz.selectedOption) ? liveState.quiz.selectedOption : null,
      explanation: liveState.quiz.explanation || '',
      showCorrect: !!liveState.quiz.showCorrect,
      shownAt: liveState.quiz.shownAt || null,
      updatedAt: liveState.quiz.updatedAt || null
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

// Memoria volátil de participantes y sala de espera por sala de videollamada
let multicamRooms = {
  main: {
    peers: {},
    waiting: {}
  }
};

// Conjunto de peerIds ya aprobados por el Host en la sesión actual (para reconexiones transparentes)
const approvedPeerIds = new Set();

function getRoomPeers(roomId) {
  if (!multicamRooms[roomId]) {
    multicamRooms[roomId] = { peers: {}, waiting: {} };
  }
  return Object.values(multicamRooms[roomId].peers).map(peer => ({
    ...peer,
    isStreamMuted: !!(peer.isStreamMuted || liveState.masterMuted)
  }));
}

// Timers de anuncio TTS para solicitudes de ingreso (evita objetos Timeout dentro de waitingPeer)
const waitingTtsTimers = new Map();

function getWaitingPeers(roomId) {
  if (!multicamRooms[roomId]) {
    multicamRooms[roomId] = { peers: {}, waiting: {} };
  }
  if (!multicamRooms[roomId].waiting) {
    multicamRooms[roomId].waiting = {};
  }
  // Solo enviar a las notificaciones de Escenas los usuarios cuyo anuncio TTS ya terminó de hablar
  return Object.values(multicamRooms[roomId].waiting).filter(p => p.ttsAnnounced !== false);
}

function completeJoinRequestTts(roomId = 'main', peerId) {
  if (!peerId || !multicamRooms[roomId] || !multicamRooms[roomId].waiting) return;
  const timerKey = `${roomId}:${peerId}`;
  if (waitingTtsTimers.has(timerKey)) {
    clearTimeout(waitingTtsTimers.get(timerKey));
    waitingTtsTimers.delete(timerKey);
  }
  const waitingPeer = multicamRooms[roomId].waiting[peerId];
  if (!waitingPeer || waitingPeer.ttsAnnounced) return;

  waitingPeer.ttsAnnounced = true;
  io.emit('multicam-join-request-tts-ended', { roomId, peerId });
  io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
  io.emit('multicam-join-request-alert', waitingPeer);
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

// Gestión y persistencia de Usuarios (Base de datos SQL + JSON local)
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error al cargar usuarios:', err);
  }
  return [];
}

async function syncUsersTableInDb(usersList) {
  if (!dbPool || !isDbReady || !Array.isArray(usersList)) return;
  try {
    for (const u of usersList) {
      await dbPool.query(
        `INSERT INTO app_users (id, username, display_name, level, password_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE
         SET username = EXCLUDED.username,
             display_name = EXCLUDED.display_name,
             level = EXCLUDED.level,
             password_hash = EXCLUDED.password_hash,
             updated_at = CURRENT_TIMESTAMP`,
        [u.id, u.username, u.displayName || u.username, u.level || 'mods', u.passwordHash]
      );
    }
  } catch (err) {
    console.error('Error sincronizando tabla app_users en PostgreSQL:', err.message);
  }
}

function saveUsers(usersList, persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('users', usersList);
      syncUsersTableInDb(usersList);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar usuarios:', err);
    return false;
  }
}

// Gestión y persistencia del Chat Interno entre Admin (Nivel 1) y MODS
let modsChatHistory = [];

function loadModsChat() {
  try {
    if (fs.existsSync(MODS_CHAT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MODS_CHAT_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        return parsed.slice(-200);
      }
    }
  } catch (err) {
    console.error('Error al cargar mods_chat:', err);
  }
  return [];
}

function saveModsChat(chatList, persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const trimmed = Array.isArray(chatList) ? chatList.slice(-200) : [];
    fs.writeFileSync(MODS_CHAT_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('mods_chat', trimmed);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar mods_chat:', err);
    return false;
  }
}

// Gestión y persistencia del Banco de Preguntas (Estilo ¿Quién Quiere Ser Millonario?)
const DEFAULT_OFFICIAL_QUESTIONS = [
  {
    id: 'etapa1-q1',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 1 DE 10)',
    question: '¿Cuántas puertas abre Rock Lee en su enfrentamiento contra Gaara en Naruto clásico?',
    options: { A: 'Tres puertas', B: 'Cuatro puertas', C: 'Cinco puertas', D: 'Seis puertas' },
    correctOption: 'C',
    explanation: 'Rock Lee llega hasta la quinta de las ocho puertas internas para ejecutar el Loto Inverso. Esto ocurre durante el episodio 50 de Naruto clásico.'
  },
  {
    id: 'etapa1-q2',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 2 DE 10)',
    question: '¿Cómo se llama el plato de ramen favorito de Naruto en Ichiraku?',
    options: { A: 'Shoyu Ramen', B: 'Miso Chashu Ramen', C: 'Tonkotsu Ramen', D: 'Shio Ramen' },
    correctOption: 'B',
    explanation: 'Su pedido favorito es un ramen de miso con abundante cerdo asado (chashu). En el episodio 497 de Shippuden se menciona como su plato favorito del menú de Ichiraku.'
  },
  {
    id: 'etapa1-q3',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 3 DE 10)',
    question: '¿Cómo se llama la persona que intenta matar a Gaara cuando era niño por última vez, antes de que Gaara cambie radicalmente su mentalidad?',
    options: { A: 'Rasa', B: 'Yashamaru', C: 'Karura', D: 'Temari' },
    correctOption: 'B',
    explanation: 'Yashamaru era el tío materno de Gaara. Por órdenes del Cuarto Kazekage, intentó asesinarlo y le reveló que su madre supuestamente lo había odiado. Este acontecimiento marcó profundamente la infancia de Gaara.'
  },
  {
    id: 'etapa1-q4',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 4 DE 10)',
    question: '¿Quién es el contrincante de Sasuke Uchiha durante los preliminares del Examen Chūnin?',
    options: { A: 'Dosu Kinuta', B: 'Zaku Abumi', C: 'Yoroi Akadō', D: 'Kankurō' },
    correctOption: 'C',
    explanation: 'Sasuke se enfrenta a Yoroi Akadō, un ninja infiltrado de la Aldea del Sonido que utiliza una habilidad para absorber el chakra de sus adversarios. Dosu y Zaku también pertenecen al grupo del Sonido, pero no son sus contrincantes en ese combate.'
  },
  {
    id: 'etapa1-q5',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 5 DE 10)',
    question: '¿Cuántas veces se enfrentan Naruto y Sasuke directamente en combate a lo largo de Naruto clásico y Naruto Shippuden?',
    options: { A: 'Tres veces', B: 'Cuatro veces', C: 'Cinco veces', D: 'Siete veces' },
    correctOption: 'C',
    explanation: 'Contando sus cinco principales enfrentamientos directos: 1) Azotea del hospital (Naruto clásico), 2) Valle del Fin (Naruto clásico), 3) Reencuentro en el escondite de Orochimaru (Shippuden), 4) Enfrentamiento posterior a la Cumbre de los Cinco Kage (Shippuden), 5) Batalla final en el Valle del Fin (Shippuden).'
  },
  {
    id: 'etapa1-q6',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 6 DE 10)',
    question: '¿Cómo se llama el Cuarto Raikage, hermano no consanguíneo de Killer B?',
    options: { A: 'Darui', B: 'A', C: 'C', D: 'Yugito Nii' },
    correctOption: 'B',
    explanation: 'Su nombre es A. Es el Cuarto Raikage de Kumogakure y hermano adoptivo de Killer B; ambos fueron elegidos para formar el dúo conocido como los hermanos A y B.'
  },
  {
    id: 'etapa1-q7',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 7 DE 10)',
    question: '¿Cuál de las cinco grandes aldeas ninja es considerada la más pequeña y aislada?',
    options: {
      A: 'Aldea Oculta de la Arena (Sunagakure)',
      B: 'Aldea Oculta de la Niebla (Kirigakure)',
      C: 'Aldea Oculta de la Roca (Iwagakure)',
      D: 'Aldea Oculta de las Nubes (Kumogakure)'
    },
    correctOption: 'B',
    explanation: 'Kirigakure (Aldea Oculta de la Niebla) está ubicada en el País del Agua, un territorio insular caracterizado por su aislamiento geográfico.'
  },
  {
    id: 'etapa1-q8',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 8 DE 10)',
    question: '¿Cuántas transformaciones diferentes presenta Naruto a lo largo de Naruto clásico y Naruto Shippuden?',
    options: { A: '8', B: '10', C: '13', D: '15' },
    correctOption: 'C',
    explanation: 'Para llegar a 13 contamos las principales etapas de transformación: las manifestaciones del chakra del Nueve Colas, sus diferentes niveles de liberación, el Modo Sabio, el Modo Chakra del Nueve Colas, el Modo Kurama y el Modo Sabio de los Seis Caminos, entre otras variantes.'
  },
  {
    id: 'etapa1-q9',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 9 DE 10)',
    question: 'En el mensaje cifrado que Jiraiya dejó escrito en la espalda de Fukasaku, Naruto reconoce que uno de los números es en realidad una letra por la forma de escribir de su maestro. ¿Cuál es ese número?',
    options: { A: '9', B: '7', C: '6', D: '4' },
    correctOption: 'A',
    explanation: 'Naruto reconoce que el símbolo que todos interpretaban como el número 9 era en realidad el carácter japonés katakana タ (Ta), escrito con la particular caligrafía de Jiraiya. Esa pista permite descifrar el mensaje utilizando sus novelas Icha Icha.'
  },
  {
    id: 'etapa1-q10',
    stage: 'etapa1',
    type: 'multiple',
    category: 'ETAPA 1 • SELECCIÓN MÚLTIPLE (PREGUNTA 10 DE 10)',
    question: '¿Cuál fue la primera vez que Jiraiya estuvo cerca de morir, antes de enfrentarse a Naruto en su transformación de cuatro colas?',
    options: {
      A: 'Durante su enfrentamiento contra Orochimaru.',
      B: 'Cuando Tsunade lo descubrió espiando en los baños termales.',
      C: 'Durante una misión contra la Aldea de la Lluvia.',
      D: 'Durante su enfrentamiento contra Hanzo.'
    },
    correctOption: 'B',
    explanation: 'Tsunade lo sorprendió espiando a unas mujeres mientras se bañaban y lo golpeó brutalmente, rompiéndole seis costillas, ambos brazos y provocándole daños en varios órganos internos (Episodio 53 de Naruto Shippuden).'
  },
  {
    id: 'etapa2-q1',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 1 DE 10)',
    question: 'El Primer Hokage era soltero.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'B',
    explanation: 'FALSO: Hashirama Senju estaba casado con Mito Uzumaki, perteneciente al clan Uzumaki. Juntos establecieron un vínculo importante entre ambos clanes.'
  },
  {
    id: 'etapa2-q2',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 2 DE 10)',
    question: 'A lo largo de la historia de Naruto y Naruto Shippuden existieron en total siete Hokages.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Los siete Hokages de Konoha, en orden, son: 1. Hashirama Senju, 2. Tobirama Senju, 3. Hiruzen Sarutobi, 4. Minato Namikaze, 5. Tsunade, 6. Kakashi Hatake y 7. Naruto Uzumaki. Danzō fue candidato al puesto de Sexto Hokage, pero no llegó a ser reconocido como Hokage oficial.'
  },
  {
    id: 'etapa2-q3',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 3 DE 10)',
    question: 'El Segundo Hokage fue quien creó el Examen Chūnin como una forma de fortalecer las relaciones entre las aldeas ninja.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Tobirama Senju impulsó el sistema de exámenes conjuntos entre aldeas, que también funcionaba como una demostración de poder militar y político.'
  },
  {
    id: 'etapa2-q4',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 4 DE 10)',
    question: 'Durante la Cuarta Gran Guerra Ninja, Kabuto no consiguió revivir a Jiraiya mediante el Edo Tensei porque su cuerpo se encontraba en las profundidades del océano, fuera de su alcance.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Kabuto no pudo recuperar el cuerpo de Jiraiya porque se encontraba en las profundidades del océano, fuera de su alcance.'
  },
  {
    id: 'etapa2-q5',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 5 DE 10)',
    question: 'Durante la batalla contra Hidan y Kakuzu, Kakashi consigue destruir uno de los corazones de Kakuzu utilizando el Raikiri.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Kakashi destruye uno de los corazones de Kakuzu durante el enfrentamiento, aunque no consigue eliminarlo definitivamente.'
  },
  {
    id: 'etapa2-q6',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 6 DE 10)',
    question: 'El Tercer Kazekage fue asesinado por Orochimaru y posteriormente convertido en una marioneta por Sasori.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'B',
    explanation: 'FALSO: Fue Sasori quien asesinó al Tercer Kazekage y convirtió su cuerpo en una marioneta humana. Orochimaru no fue responsable de su desaparición.'
  },
  {
    id: 'etapa2-q7',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 7 DE 10)',
    question: 'Yahiko fue el fundador original de Akatsuki, antes de que Nagato asumiera el liderazgo de la organización.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Yahiko reunió a los primeros integrantes de Akatsuki con la intención de conseguir la paz en el País de la Lluvia. Después de su muerte, Nagato tomó otro rumbo y transformó la organización.'
  },
  {
    id: 'etapa2-q8',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 8 DE 10)',
    question: 'Neji murió durante la Cuarta Gran Guerra Ninja intentando proteger únicamente a Naruto de los ataques del Diez Colas.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'B',
    explanation: 'FALSO: Neji intervino para proteger tanto a Naruto como a Hinata. Recibió los ataques destinados a ambos y murió por las heridas.'
  },
  {
    id: 'etapa2-q9',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 9 DE 10)',
    question: 'Danzo tenía diez Sharingan implantados en su brazo derecho, además de modificaciones realizadas con células del Primer Hokage.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'A',
    explanation: 'VERDADERO: Su brazo fue modificado con diez ojos Sharingan y células de Hashirama Senju. Estas modificaciones le permitían utilizar habilidades extraordinarias, aunque consumían una enorme cantidad de chakra.'
  },
  {
    id: 'etapa2-q10',
    stage: 'etapa2',
    type: 'boolean',
    category: 'ETAPA 2 • VERDADERO O FALSO (PREGUNTA 10 DE 10)',
    question: 'Durante la Cuarta Gran Guerra Ninja, cuando Kabuto reencarnó a los antiguos miembros de Akatsuki, Nagato conservó el control de sus movimientos y pudo decidir por voluntad propia a quién atacar.',
    options: { A: 'VERDADERO', B: 'FALSO', C: '', D: '' },
    correctOption: 'B',
    explanation: 'FALSO: Nagato estaba bajo el control de la técnica de reencarnación impura de Kabuto. Aunque conservaba su conciencia y podía hablar, no controlaba libremente sus acciones.'
  },
  {
    id: 'etapa3-q1',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 1 DE 10)',
    question: '¿Quién es el autor de la frase: «Es mejor cambiar de opinión que persistir en una equivocada»?',
    options: { A: 'Sócrates', B: 'Itachi Uchiha', C: 'Aristóteles', D: 'Madara Uchiha' },
    correctOption: 'A',
    explanation: 'Autor: Sócrates (en el diálogo Teeteto, de Platón).'
  },
  {
    id: 'etapa3-q2',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 2 DE 10)',
    question: '¿Quién dijo la frase: «Quienes no conocen el verdadero dolor nunca podrán comprender la verdadera paz»?',
    options: { A: 'Séneca', B: 'Nagato (Pain)', C: 'Madara Uchiha', D: 'Sócrates' },
    correctOption: 'B',
    explanation: 'Autor: Nagato (Pain), en Naruto Shippuden.'
  },
  {
    id: 'etapa3-q3',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 3 DE 10)',
    question: '¿Quién es el autor de la frase: «Todos los hombres desean por naturaleza saber»?',
    options: { A: 'Orochimaru', B: 'Platón', C: 'Aristóteles', D: 'Epicteto' },
    correctOption: 'C',
    explanation: 'Autor: Aristóteles, en el inicio de su obra Metafísica.'
  },
  {
    id: 'etapa3-q4',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 4 DE 10)',
    question: '¿Quién dijo la frase: «Cuando alguien protege algo verdaderamente importante, puede volverse tan fuerte como necesita ser»?',
    options: { A: 'Haku', B: 'Naruto Uzumaki', C: 'Epicteto', D: 'Rock Lee' },
    correctOption: 'A',
    explanation: 'Autor: Haku, en Naruto clásico.'
  },
  {
    id: 'etapa3-q5',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 5 DE 10)',
    question: '¿Quién pronunció la frase: «Despierta a la realidad: nada ocurre jamás como uno lo planea en este mundo»?',
    options: { A: 'Séneca', B: 'Obito Uchiha', C: 'Madara Uchiha', D: 'Epicteto' },
    correctOption: 'C',
    explanation: 'Autor: Madara Uchiha, en Naruto Shippuden.'
  },
  {
    id: 'etapa3-q6',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 6 DE 10)',
    question: '¿Quién es el autor de la frase: «Sufrimos más a menudo en la imaginación que en la realidad»?',
    options: { A: 'Itachi Uchiha', B: 'Séneca', C: 'Sócrates', D: 'Kakashi Hatake' },
    correctOption: 'B',
    explanation: 'Autor: Séneca, en Cartas a Lucilio.'
  },
  {
    id: 'etapa3-q7',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 7 DE 10)',
    question: '¿Quién dijo la frase: «La gente se vuelve más fuerte porque tiene recuerdos que no puede olvidar»?',
    options: { A: 'Jiraiya', B: 'Aristóteles', C: 'Tsunade', D: 'Haku' },
    correctOption: 'C',
    explanation: 'Autor: Tsunade, en Naruto Shippuden.'
  },
  {
    id: 'etapa3-q8',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 8 DE 10)',
    question: '¿Quién es el autor de la frase: «Una vida sin examen no merece ser vivida»?',
    options: { A: 'Sócrates', B: 'Séneca', C: 'Madara Uchiha', D: 'Aristóteles' },
    correctOption: 'A',
    explanation: 'Autor: Sócrates, según Platón en la Apología de Sócrates.'
  },
  {
    id: 'etapa3-q9',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 9 DE 10)',
    question: '¿Quién es el autor de la frase: «Algunas cosas dependen de nosotros y otras no»?',
    options: { A: 'Nagato (Pain)', B: 'Séneca', C: 'Itachi Uchiha', D: 'Epicteto' },
    correctOption: 'D',
    explanation: 'Autor: Epicteto, en el inicio de su obra Manual (Enquiridión).'
  },
  {
    id: 'etapa3-q10',
    stage: 'etapa3',
    type: 'multiple',
    category: 'ETAPA 3 • FRASES Y AUTORES (FRASE 10 DE 10)',
    question: '¿Quién pronunció la frase: «La vida de las personas no termina cuando mueren; termina cuando pierden la fe»?',
    options: { A: 'Sócrates', B: 'Itachi Uchiha', C: 'Jiraiya', D: 'Séneca' },
    correctOption: 'B',
    explanation: 'Autor: Itachi Uchiha, en Naruto Shippuden.'
  }
];

function ensureOfficialQuestionsInList(list) {
  const cleanList = Array.isArray(list)
    ? list.filter(q => q && q.id !== 'quiz-default-1' && q.id !== 'quiz-default-2')
    : [];
  const existingMap = new Map();
  cleanList.forEach(q => existingMap.set(q.id, q));

  let addedOrUpdated = false;
  if (Array.isArray(list) && list.some(q => q && (q.id === 'quiz-default-1' || q.id === 'quiz-default-2'))) {
    addedOrUpdated = true;
  }

  DEFAULT_OFFICIAL_QUESTIONS.forEach(defQ => {
    if (!existingMap.has(defQ.id)) {
      cleanList.push({ ...defQ });
      addedOrUpdated = true;
    }
  });

  return { list: cleanList, changed: addedOrUpdated };
}

let questions = [];

function loadQuestions() {
  try {
    if (fs.existsSync(QUESTIONS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = ensureOfficialQuestionsInList(parsed);
        return merged.list;
      }
    }
  } catch (err) {
    console.error('Error al cargar questions:', err);
  }
  return DEFAULT_OFFICIAL_QUESTIONS.map(q => ({ ...q }));
}

function saveQuestions(questionsList, persistDb = true) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questionsList, null, 2), 'utf-8');
    if (persistDb) {
      saveToDb('questions', questionsList);
    }
    return true;
  } catch (err) {
    console.error('Error al guardar questions:', err);
    return false;
  }
}

// Inicialización de datos
let savedSettings = loadSettings();
let presenters = loadPresenters();
let fights = loadFights();
questions = loadQuestions();
saveQuestions(questions, false);
users = loadUsers();
modsChatHistory = loadModsChat();
loadMulticamSettings();
loadBannedIps();

// Si no hay usuarios por primera vez, creamos los dos niveles base: Usuario Nivel 1 (admin) y MODS (mods)
if (users.length === 0) {
  users = [
    {
      id: 'user-nivel-1',
      username: 'admin',
      displayName: 'Admin Principal (Nivel 1)',
      level: 'nivel_1',
      passwordHash: hashPassword('birraverde2026'),
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'user-mods',
      username: 'mods',
      displayName: 'Equipo Moderadores (MODS)',
      level: 'mods',
      passwordHash: hashPassword('mods2026'),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  saveUsers(users, false);
}

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

async function saveUploadedFileToDb(filename, mimeType, base64Data) {
  if (dbPool && isDbReady && filename && base64Data) {
    try {
      await dbPool.query(
        `INSERT INTO uploaded_files (filename, mime_type, data_base64, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (filename) DO UPDATE
         SET mime_type = EXCLUDED.mime_type,
             data_base64 = EXCLUDED.data_base64,
             created_at = CURRENT_TIMESTAMP`,
        [filename, mimeType || 'image/png', base64Data]
      );
    } catch (err) {
      console.error(`Error guardando archivo ${filename} en PostgreSQL:`, err.message);
    }
  }
}

async function syncUploadedFilesWithDatabase() {
  if (!dbPool || !isDbReady) return;
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    // 1. Restaurar desde PostgreSQL hacia disco local (public/uploads) tras un deploy o push
    const res = await dbPool.query('SELECT filename, data_base64 FROM uploaded_files');
    const dbFiles = new Set();
    let restoredCount = 0;

    for (const row of res.rows) {
      if (!row.filename || !row.data_base64) continue;
      const safeName = path.basename(row.filename);
      dbFiles.add(safeName);
      const localPath = path.join(UPLOADS_DIR, safeName);
      if (!fs.existsSync(localPath)) {
        try {
          fs.writeFileSync(localPath, Buffer.from(row.data_base64, 'base64'));
          restoredCount++;
        } catch (e) {
          console.error(`No se pudo restaurar ${safeName} en disco:`, e.message);
        }
      }
    }

    // 2. Respaldar hacia PostgreSQL cualquier imagen que exista en disco y aún no esté en la BD
    const diskFiles = fs.readdirSync(UPLOADS_DIR);
    for (const file of diskFiles) {
      if (file.startsWith('.') || dbFiles.has(file)) continue;
      const fullPath = path.join(UPLOADS_DIR, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase().replace('.', '');
          const mime = ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'svg'
              ? 'image/svg+xml'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'gif'
                  ? 'image/gif'
                  : 'image/png';
          const b64 = fs.readFileSync(fullPath).toString('base64');
          await saveUploadedFileToDb(file, mime, b64);
        }
      } catch (e) {}
    }

    if (restoredCount > 0) {
      console.log(`🖼️ ${restoredCount} imágenes restauradas desde PostgreSQL a /uploads`);
    }
  } catch (err) {
    console.error('Error sincronizando imágenes con PostgreSQL:', err.message);
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
      if (typeof s.masterMuted === 'boolean') liveState.masterMuted = s.masterMuted;
      if (s.topHud) liveState.topHud = { ...liveState.topHud, ...s.topHud };
      if (s.chatOverlay) liveState.chatOverlay = { ...liveState.chatOverlay, ...s.chatOverlay };
      if (s.eventCountdown) liveState.eventCountdown = { ...liveState.eventCountdown, ...s.eventCountdown };
      if (s.quiz && typeof s.quiz === 'object') {
        liveState.quiz = {
          ...liveState.quiz,
          ...s.quiz,
          options: {
            ...liveState.quiz.options,
            ...(s.quiz.options || {})
          }
        };
      }
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

    // 6. Sincronizar Usuarios y Niveles (Usuario Nivel 1 y MODS)
    const usersTableRes = await dbPool.query('SELECT id, username, display_name, level, password_hash, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_ms FROM app_users ORDER BY id ASC').catch(() => null);
    if (usersTableRes && usersTableRes.rows && usersTableRes.rows.length > 0) {
      users = usersTableRes.rows.map(r => ({
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        level: r.level === 'nivel_1' ? 'nivel_1' : 'mods',
        passwordHash: r.password_hash,
        updatedAt: Math.round(Number(r.updated_ms) || Date.now())
      }));
      saveUsers(users, false);
      await saveToDb('users', users);
      changed = true;
    } else if (dbData.users && Array.isArray(dbData.users) && dbData.users.length > 0) {
      users = dbData.users;
      saveUsers(users, false);
      await syncUsersTableInDb(users);
      changed = true;
    } else if (users.length > 0) {
      await saveToDb('users', users);
      await syncUsersTableInDb(users);
    }

    // 7. Sincronizar Historial de Chat Interno (Admin <-> MODS)
    if (dbData.mods_chat && Array.isArray(dbData.mods_chat)) {
      modsChatHistory = dbData.mods_chat.slice(-200);
      saveModsChat(modsChatHistory, false);
      io.emit('mods-chat-history', modsChatHistory);
      changed = true;
    } else if (modsChatHistory.length > 0) {
      await saveToDb('mods_chat', modsChatHistory);
    }

    // 8. Sincronizar Banco de Preguntas (Estilo ¿Quién Quiere Ser Millonario?)
    if (dbData.questions && Array.isArray(dbData.questions) && dbData.questions.length > 0) {
      const merged = ensureOfficialQuestionsInList(dbData.questions);
      questions = merged.list;
      saveQuestions(questions, false);
      if (merged.changed) {
        await saveToDb('questions', questions);
      }
      io.emit('questions-updated', questions);
      changed = true;
    } else if (questions.length > 0) {
      await saveToDb('questions', questions);
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

      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS uploaded_files (
          filename VARCHAR(255) PRIMARY KEY,
          mime_type VARCHAR(100) NOT NULL,
          data_base64 TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id VARCHAR(100) PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          display_name VARCHAR(150) NOT NULL,
          level VARCHAR(50) NOT NULL,
          password_hash TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('🐘 PostgreSQL conectado exitosamente y tablas app_storage / uploaded_files / app_users listas');
      isDbReady = true;
      await syncUploadedFilesWithDatabase();
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

// ============================================================
// RUTAS API DE AUTENTICACIÓN Y GESTIÓN DE USUARIOS (NIVEL 1 Y MODS)
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Ingresa tu usuario y contraseña.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const found = users.find(u => String(u.username || '').toLowerCase() === cleanUser);
  if (!found || !verifyPassword(password, found.passwordHash)) {
    return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
  }

  const token = createSessionToken(found);
  const maxAgeSec = 30 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`
  );

  res.json({
    success: true,
    user: sanitizeUser(found)
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  const user = getAuthenticatedUserFromReq(req);
  if (!user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user });
});

// CRUD de Usuarios en Base de Datos (Solo Usuario Nivel 1 puede crear/editar/borrar usuarios)
app.get('/api/users', requireAuth, (req, res) => {
  res.json(users.map(sanitizeUser));
});

app.post('/api/users', requireNivel1, async (req, res) => {
  const { username, displayName, level, password } = req.body || {};
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername || !password) {
    return res.status(400).json({ error: 'El nombre de usuario y la contraseña están requeridos.' });
  }

  if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un usuario con ese nombre.' });
  }

  const validLevel = level === 'nivel_1' ? 'nivel_1' : 'mods';
  const newUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    username: cleanUsername,
    displayName: String(displayName || cleanUsername).trim(),
    level: validLevel,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  users.push(newUser);
  saveUsers(users);
  io.emit('users-updated', users.map(sanitizeUser));
  res.status(201).json({ success: true, user: sanitizeUser(newUser) });
});

app.put('/api/users/:id', requireNivel1, async (req, res) => {
  const { id } = req.params;
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  const { username, displayName, level, password } = req.body || {};
  const current = users[idx];

  if (username && String(username).trim()) {
    const cleanUsername = String(username).trim();
    const duplicate = users.find(u => u.id !== id && u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (duplicate) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso.' });
    }
    current.username = cleanUsername;
  }

  if (typeof displayName === 'string' && displayName.trim()) {
    current.displayName = displayName.trim();
  }

  if (level === 'nivel_1' || level === 'mods') {
    // Evitar dejar el sistema sin ningún Usuario Nivel 1
    if (current.level === 'nivel_1' && level !== 'nivel_1') {
      const nivel1Count = users.filter(u => u.level === 'nivel_1').length;
      if (nivel1Count <= 1) {
        return res.status(400).json({ error: 'Debe existir al menos un Usuario Nivel 1 (Admin).' });
      }
    }
    current.level = level;
  }

  if (password && String(password).trim().length > 0) {
    current.passwordHash = hashPassword(String(password).trim());
  }

  current.updatedAt = Date.now();
  saveUsers(users);
  io.emit('users-updated', users.map(sanitizeUser));
  res.json({ success: true, user: sanitizeUser(current) });
});

app.delete('/api/users/:id', requireNivel1, async (req, res) => {
  const { id } = req.params;
  const target = users.find(u => u.id === id);
  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (target.level === 'nivel_1') {
    const nivel1Count = users.filter(u => u.level === 'nivel_1').length;
    if (nivel1Count <= 1) {
      return res.status(400).json({ error: 'No puedes eliminar al único Usuario Nivel 1 (Admin).' });
    }
  }

  users = users.filter(u => u.id !== id);
  saveUsers(users);
  if (dbPool && isDbReady) {
    dbPool.query('DELETE FROM app_users WHERE id = $1', [id]).catch(() => {});
  }
  io.emit('users-updated', users.map(sanitizeUser));
  res.json({ success: true });
});

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

app.post('/api/settings', requireAuth, (req, res) => {
  const { scale, defaultAutoHide } = req.body;
  if (typeof scale === 'number') liveState.scale = scale;
  if (typeof defaultAutoHide === 'number') liveState.defaultAutoHide = defaultAutoHide;
  saveSettings();
  io.emit('state-update', liveState);
  res.json({ success: true, settings: { scale: liveState.scale, defaultAutoHide: liveState.defaultAutoHide } });
});

app.post('/api/event-countdown', requireAuth, (req, res) => {
  const data = req.body || {};
  if (typeof data.enabled === 'boolean') liveState.eventCountdown.enabled = data.enabled;
  if (typeof data.title === 'string') liveState.eventCountdown.title = data.title.trim();
  if (typeof data.description === 'string') liveState.eventCountdown.description = data.description.trim();
  if (typeof data.image === 'string') liveState.eventCountdown.image = data.image.trim();
  if (typeof data.targetDate === 'string') liveState.eventCountdown.targetDate = data.targetDate.trim();
  if (typeof data.targetTime === 'string') liveState.eventCountdown.targetTime = data.targetTime.trim();
  if (typeof data.targetTimestamp === 'number' || data.targetTimestamp === null) {
    liveState.eventCountdown.targetTimestamp = data.targetTimestamp;
  }
  liveState.eventCountdown.updatedAt = Date.now();
  saveSettings();
  io.emit('state-update', liveState);
  res.json({ success: true, eventCountdown: liveState.eventCountdown });
});

app.post('/api/presenters', requireAuth, (req, res) => {
  const newPres = { ...req.body, id: req.body.id || `pres-${Date.now()}` };
  presenters.push(newPres);
  savePresenters(presenters);
  io.emit('presenters-updated', presenters);
  res.status(201).json(newPres);
});

app.put('/api/presenters/:id', requireAuth, (req, res) => {
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

app.delete('/api/presenters/:id', requireAuth, (req, res) => {
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

app.post('/api/fights', requireAuth, (req, res) => {
  const newFight = { ...req.body, id: req.body.id || `fight-${Date.now()}` };
  fights.push(newFight);
  saveFights(fights);
  io.emit('fights-updated', fights);
  res.status(201).json(newFight);
});

app.put('/api/fights/:id', requireAuth, (req, res) => {
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

app.delete('/api/fights/:id', requireAuth, (req, res) => {
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

// Rutas API REST para Banco de Preguntas (Estilo ¿Quién Quiere Ser Millonario?)
app.get('/api/questions', async (req, res) => {
  if (dbInitPromise) await dbInitPromise.catch(() => {});
  res.json(questions);
});

app.post('/api/questions', requireAuth, (req, res) => {
  const body = req.body || {};
  const qType = body.type === 'boolean' ? 'boolean' : 'multiple';
  const newQ = {
    id: body.id || `quiz-${Date.now()}`,
    stage: String(body.stage || (qType === 'boolean' ? 'etapa2' : 'etapa1')).trim(),
    type: qType,
    category: String(body.category || '¿QUIÉN QUIERE SER MILLONARIO? • BIRRAVERDE').trim(),
    question: String(body.question || '').trim(),
    options: {
      A: qType === 'boolean' ? (String(body.options?.A || 'VERDADERO').trim() || 'VERDADERO') : String(body.options?.A || '').trim(),
      B: qType === 'boolean' ? (String(body.options?.B || 'FALSO').trim() || 'FALSO') : String(body.options?.B || '').trim(),
      C: qType === 'boolean' ? '' : String(body.options?.C || '').trim(),
      D: qType === 'boolean' ? '' : String(body.options?.D || '').trim()
    },
    correctOption: ['A', 'B', 'C', 'D'].includes(body.correctOption) ? body.correctOption : 'A',
    explanation: String(body.explanation || '').trim(),
    createdAt: Date.now()
  };
  questions.push(newQ);
  saveQuestions(questions);
  io.emit('questions-updated', questions);
  res.status(201).json(newQ);
});

app.put('/api/questions/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const idx = questions.findIndex(q => q.id === id);
  const qType = body.type === 'boolean' ? 'boolean' : 'multiple';
  const updatedQ = {
    id,
    stage: String(body.stage || (qType === 'boolean' ? 'etapa2' : 'etapa1')).trim(),
    type: qType,
    category: String(body.category || '¿QUIÉN QUIERE SER MILLONARIO? • BIRRAVERDE').trim(),
    question: String(body.question || '').trim(),
    options: {
      A: qType === 'boolean' ? (String(body.options?.A || 'VERDADERO').trim() || 'VERDADERO') : String(body.options?.A || '').trim(),
      B: qType === 'boolean' ? (String(body.options?.B || 'FALSO').trim() || 'FALSO') : String(body.options?.B || '').trim(),
      C: qType === 'boolean' ? '' : String(body.options?.C || '').trim(),
      D: qType === 'boolean' ? '' : String(body.options?.D || '').trim()
    },
    correctOption: ['A', 'B', 'C', 'D'].includes(body.correctOption) ? body.correctOption : 'A',
    explanation: String(body.explanation || '').trim(),
    updatedAt: Date.now()
  };

  if (idx === -1) {
    questions.push(updatedQ);
  } else {
    questions[idx] = { ...questions[idx], ...updatedQ };
  }
  saveQuestions(questions);
  io.emit('questions-updated', questions);
  res.json(updatedQ);
});

app.delete('/api/questions/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  questions = questions.filter(q => q.id !== id);
  saveQuestions(questions);
  io.emit('questions-updated', questions);
  res.json({ success: true });
});

// Endpoint de subida de imágenes (Eventos, Boxeadores, etc.) con persistencia en PostgreSQL
app.post('/api/upload', requireAuth, async (req, res) => {
  try {
    const { dataUrl, filename } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'No se envió imagen en base64' });
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato base64 no válido' });
    }

    const mimeType = matches[1] || 'image/png';
    const base64Data = matches[2];
    const ext = filename ? path.extname(filename) || '.png' : '.png';
    const cleanName = `boxer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
    
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, cleanName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    await saveUploadedFileToDb(cleanName, mimeType, base64Data);

    res.json({ success: true, url: `/uploads/${cleanName}` });
  } catch (err) {
    console.error('Error al subir imagen:', err);
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

app.post('/api/multicam/settings', requireAuth, (req, res) => {
  multicamSettings = { ...multicamSettings, ...req.body };
  saveMulticamSettings();
  io.emit('multicam-settings-updated', multicamSettings);
  res.json({ success: true, settings: multicamSettings });
});

app.post('/api/multicam/upload-avatar', async (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No se envió imagen' });
    }
    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }
    const mimeType = `image/${matches[1]}`;
    const base64Data = matches[2];
    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace('svg+xml', 'svg');
    const cleanName = `avatar-${Date.now()}-${Math.round(Math.random() * 1e5)}.${extension}`;
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, cleanName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    await saveUploadedFileToDb(cleanName, mimeType, base64Data);
    res.json({ success: true, url: `/uploads/${cleanName}` });
  } catch (err) {
    console.error('Error al subir avatar de invitado:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen' });
  }
});

app.post('/api/master-mute', requireAuth, (req, res) => {
  const nextMuted = (req.body && typeof req.body.muted === 'boolean')
    ? req.body.muted
    : !liveState.masterMuted;
  liveState.masterMuted = nextMuted;
  multicamSettings.audioMutedOverall = nextMuted;
  saveSettings();
  saveMulticamSettings();
  const currentPeers = getRoomPeers('main');
  io.emit('state-update', liveState);
  io.emit('multicam-settings-updated', multicamSettings);
  io.emit('master-mute-changed', { muted: nextMuted });
  io.emit('multicam-peers-updated', { roomId: 'main', peers: currentPeers });
  io.emit('multicam-admin-peers-updated', { roomId: 'main', peers: currentPeers });
  res.json({ success: true, muted: nextMuted });
});

// WebSockets en tiempo real
io.on('connection', async (socket) => {
  if (dbInitPromise) {
    try {
      await dbInitPromise;
    } catch (e) {}
  }

  // Verificar si el socket pertenece a un usuario autenticado (Usuario Nivel 1 o MODS)
  // El overlay (/overlay) y /guest pueden conectarse sin sesión, pero NO pueden ejecutar comandos de control del stream
  const isAuthorized = () => !!getAuthenticatedUserFromSocket(socket);
  const currentUser = getAuthenticatedUserFromSocket(socket);
  socket.user = currentUser;

  socket.emit('state-update', liveState);
  socket.emit('presenters-updated', presenters);
  socket.emit('fights-updated', fights);
  socket.emit('questions-updated', questions);
  socket.emit('multicam-settings-updated', multicamSettings);
  socket.emit('master-mute-changed', { muted: !!liveState.masterMuted });
  if (currentUser) {
    socket.emit('auth-user', currentUser);
    socket.emit('users-updated', users.map(sanitizeUser));
    socket.emit('mods-chat-history', modsChatHistory);
    socket.emit('admin-presence-updated', liveState.adminPresence);
    if (currentUser.level === 'nivel_1') {
      adminSocketsPresence.set(socket.id, {
        status: 'online_panel',
        activeTab: 'main',
        username: currentUser.displayName || currentUser.username || 'Admin',
        updatedAt: Date.now()
      });
      recomputeAdminPresence();
    }
  }

  // Mute Maestro Global (Silenciar o activar todo el audio de la app en OBS)
  socket.on('toggle-master-mute', (payload, callback) => {
    if (!isAuthorized()) return;
    const nextMuted = (payload && typeof payload.muted === 'boolean')
      ? payload.muted
      : !liveState.masterMuted;
    liveState.masterMuted = nextMuted;
    multicamSettings.audioMutedOverall = nextMuted;
    saveSettings();
    saveMulticamSettings();
    const currentPeers = getRoomPeers('main');
    io.emit('state-update', liveState);
    io.emit('multicam-settings-updated', multicamSettings);
    io.emit('master-mute-changed', { muted: nextMuted });
    io.emit('multicam-peers-updated', { roomId: 'main', peers: currentPeers });
    io.emit('multicam-admin-peers-updated', { roomId: 'main', peers: currentPeers });
    if (typeof callback === 'function') {
      callback({ success: true, muted: nextMuted });
    }
  });

  // 1. Preparar un slot (Queue / Preview sin mostrarlo en stream)
  socket.on('prepare-slot', (data) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    triggerHideSlot(slot || 'left');
  });

  socket.on('hide-all', () => {
    if (!isAuthorized()) return;
    triggerHideSlot('all');
  });

  // 5. Escenas de pantalla completa (Ya volvemos, Empezando, Finalizado)
  socket.on('show-scene', (data) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    liveState.scene.isActive = false;
    io.emit('state-update', liveState);
  });

  // 5.b. Banco de Animaciones - Tabla VS Boxeo (La Velada del Caos)
  socket.on('show-vs', (data) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    liveState.vs.isActive = false;
    io.emit('state-update', liveState);
  });

  // 5.b.2. Banco de Animaciones - Escena Multicam / Videollamada en Vivo
  socket.on('show-multicam', (data) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    liveState.multicam = {
      isActive: false,
      shownAt: null
    };
    saveSettings();
    io.emit('state-update', liveState);
  });

  // 5.b.3. Banco de Animaciones - Sistema de Preguntas (Estilo ¿Quién Quiere Ser Millonario?)
  socket.on('quiz-show-hud', (data, callback) => {
    if (!isAuthorized()) return;
    if (data && typeof data === 'object') {
      if (typeof data.questionId === 'string') liveState.quiz.questionId = data.questionId;
      if (typeof data.stage === 'string') liveState.quiz.stage = data.stage;
      if (data.type === 'boolean' || data.type === 'multiple') liveState.quiz.type = data.type;
      if (typeof data.category === 'string') liveState.quiz.category = data.category.trim();
      if (typeof data.question === 'string') liveState.quiz.question = data.question.trim();
      if (typeof data.explanation === 'string') liveState.quiz.explanation = data.explanation.trim();
      if (data.options && typeof data.options === 'object') {
        liveState.quiz.options = {
          A: typeof data.options.A === 'string' ? data.options.A.trim() : (liveState.quiz.options?.A || ''),
          B: typeof data.options.B === 'string' ? data.options.B.trim() : (liveState.quiz.options?.B || ''),
          C: typeof data.options.C === 'string' ? data.options.C.trim() : (liveState.quiz.options?.C || ''),
          D: typeof data.options.D === 'string' ? data.options.D.trim() : (liveState.quiz.options?.D || '')
        };
      }
      if (liveState.quiz.type === 'boolean') {
        liveState.quiz.options.A = liveState.quiz.options.A || 'VERDADERO';
        liveState.quiz.options.B = liveState.quiz.options.B || 'FALSO';
      }
      if (['A', 'B', 'C', 'D'].includes(data.correctOption)) {
        liveState.quiz.correctOption = data.correctOption;
      }
      if (['A', 'B', 'C', 'D'].includes(data.selectedOption) || data.selectedOption === null) {
        liveState.quiz.selectedOption = data.selectedOption;
      }
      if (typeof data.showCorrect === 'boolean') {
        liveState.quiz.showCorrect = data.showCorrect;
      } else {
        // Por defecto al mostrar la pregunta en OBS se muestra en modo normal (sin revelar aún la respuesta)
        liveState.quiz.showCorrect = false;
      }
    }
    liveState.quiz.isVisible = true;
    liveState.quiz.shownAt = Date.now();
    liveState.quiz.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof callback === 'function') callback({ success: true, quiz: liveState.quiz });
  });

  socket.on('quiz-hide-hud', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    if (!isAuthorized()) return;
    liveState.quiz.isVisible = false;
    liveState.quiz.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof cb === 'function') cb({ success: true, quiz: liveState.quiz });
  });

  socket.on('quiz-update-data', (data, callback) => {
    if (!isAuthorized()) return;
    if (data && typeof data === 'object') {
      if (typeof data.questionId === 'string') liveState.quiz.questionId = data.questionId;
      if (typeof data.stage === 'string') liveState.quiz.stage = data.stage;
      if (data.type === 'boolean' || data.type === 'multiple') liveState.quiz.type = data.type;
      if (typeof data.category === 'string') liveState.quiz.category = data.category.trim();
      if (typeof data.question === 'string') liveState.quiz.question = data.question.trim();
      if (typeof data.explanation === 'string') liveState.quiz.explanation = data.explanation.trim();
      if (data.options && typeof data.options === 'object') {
        liveState.quiz.options = {
          A: typeof data.options.A === 'string' ? data.options.A.trim() : (liveState.quiz.options?.A || ''),
          B: typeof data.options.B === 'string' ? data.options.B.trim() : (liveState.quiz.options?.B || ''),
          C: typeof data.options.C === 'string' ? data.options.C.trim() : (liveState.quiz.options?.C || ''),
          D: typeof data.options.D === 'string' ? data.options.D.trim() : (liveState.quiz.options?.D || '')
        };
      }
      if (liveState.quiz.type === 'boolean') {
        liveState.quiz.options.A = liveState.quiz.options.A || 'VERDADERO';
        liveState.quiz.options.B = liveState.quiz.options.B || 'FALSO';
      }
      if (['A', 'B', 'C', 'D'].includes(data.correctOption)) {
        liveState.quiz.correctOption = data.correctOption;
      }
      if (['A', 'B', 'C', 'D'].includes(data.selectedOption) || data.selectedOption === null) {
        liveState.quiz.selectedOption = data.selectedOption;
      }
      if (typeof data.showCorrect === 'boolean') {
        liveState.quiz.showCorrect = data.showCorrect;
      }
      if (typeof data.isVisible === 'boolean') {
        liveState.quiz.isVisible = data.isVisible;
      }
    }
    liveState.quiz.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof callback === 'function') callback({ success: true, quiz: liveState.quiz });
  });

  socket.on('quiz-toggle-correct', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    if (!isAuthorized()) return;
    const nextShow = (data && typeof data.showCorrect === 'boolean')
      ? data.showCorrect
      : !liveState.quiz.showCorrect;
    liveState.quiz.showCorrect = nextShow;
    // Si muestran la respuesta correcta y el HUD estaba oculto, asegurarse de que sea visible si así lo piden
    if (data && data.ensureVisible === true) {
      liveState.quiz.isVisible = true;
    }
    liveState.quiz.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (nextShow) {
      io.emit('quiz-correct-revealed', {
        correctOption: liveState.quiz.correctOption,
        selectedOption: liveState.quiz.selectedOption
      });
    }
    if (typeof cb === 'function') cb({ success: true, quiz: liveState.quiz });
  });

  socket.on('quiz-select-option', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    if (!isAuthorized()) return;
    const opt = data && ['A', 'B', 'C', 'D'].includes(data.option) ? data.option : null;
    liveState.quiz.selectedOption = opt;
    liveState.quiz.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof cb === 'function') cb({ success: true, quiz: liveState.quiz });
  });

  socket.on('save-question', (qData, callback) => {
    if (!isAuthorized() || !qData) return;
    const qType = qData.type === 'boolean' ? 'boolean' : 'multiple';
    const cleanQ = {
      id: qData.id || `quiz-${Date.now()}`,
      stage: String(qData.stage || (qType === 'boolean' ? 'etapa2' : 'etapa1')).trim(),
      type: qType,
      category: String(qData.category || '¿QUIÉN QUIERE SER MILLONARIO? • BIRRAVERDE').trim(),
      question: String(qData.question || '').trim(),
      options: {
        A: qType === 'boolean' ? (String(qData.options?.A || 'VERDADERO').trim() || 'VERDADERO') : String(qData.options?.A || '').trim(),
        B: qType === 'boolean' ? (String(qData.options?.B || 'FALSO').trim() || 'FALSO') : String(qData.options?.B || '').trim(),
        C: qType === 'boolean' ? '' : String(qData.options?.C || '').trim(),
        D: qType === 'boolean' ? '' : String(qData.options?.D || '').trim()
      },
      correctOption: ['A', 'B', 'C', 'D'].includes(qData.correctOption) ? qData.correctOption : 'A',
      explanation: String(qData.explanation || '').trim(),
      updatedAt: Date.now()
    };

    const idx = questions.findIndex(q => q.id === cleanQ.id);
    if (idx !== -1) {
      questions[idx] = { ...questions[idx], ...cleanQ };
    } else {
      cleanQ.createdAt = Date.now();
      questions.push(cleanQ);
    }
    saveQuestions(questions);
    io.emit('questions-updated', questions);
    if (typeof callback === 'function') callback({ success: true, question: cleanQ });
  });

  socket.on('quiz-restore-official', (callback) => {
    if (!isAuthorized()) return;
    const merged = ensureOfficialQuestionsInList(questions);
    questions = merged.list;
    saveQuestions(questions);
    io.emit('questions-updated', questions);
    if (typeof callback === 'function') callback({ success: true, count: questions.length });
  });

  socket.on('delete-question', (id, callback) => {
    if (!isAuthorized()) return;
    questions = questions.filter(q => q.id !== id);
    saveQuestions(questions);
    io.emit('questions-updated', questions);
    if (typeof callback === 'function') callback({ success: true, id });
  });

  // 5.c. Overlay Superior Dinámico BirraVerde (HUD y Marquesina)
  socket.on('toggle-top-hud', (payload) => {
    if (!isAuthorized()) return;
    if (payload && typeof payload.isVisible === 'boolean') {
      liveState.topHud.isVisible = payload.isVisible;
    } else {
      liveState.topHud.isVisible = !liveState.topHud.isVisible;
    }
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('update-top-hud-text', (data) => {
    if (!isAuthorized()) return;
    if (data && typeof data.text === 'string') {
      liveState.topHud.customText = data.text.trim();
      saveSettings();
      io.emit('state-update', liveState);
    }
  });

  socket.on('trigger-hud-alert', (alertData) => {
    if (!isAuthorized()) return;
    // alertData: { type: 'follow'|'donation'|'comment', user, detail, amount }
    io.emit('hud-alert', alertData);
  });

  // 5.c.2. Contador de Próximo Evento en Pantallas de Espera
  socket.on('toggle-event-countdown', (payload, callback) => {
    if (!isAuthorized()) return;
    if (payload && typeof payload.enabled === 'boolean') {
      liveState.eventCountdown.enabled = payload.enabled;
    } else {
      liveState.eventCountdown.enabled = !liveState.eventCountdown.enabled;
    }
    liveState.eventCountdown.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof callback === 'function') {
      callback({ success: true, eventCountdown: liveState.eventCountdown });
    }
  });

  socket.on('update-event-countdown', (data, callback) => {
    if (!isAuthorized()) return;
    if (!data || typeof data !== 'object') return;
    if (typeof data.enabled === 'boolean') {
      liveState.eventCountdown.enabled = data.enabled;
    }
    if (typeof data.title === 'string') {
      liveState.eventCountdown.title = data.title.trim();
    }
    if (typeof data.description === 'string') {
      liveState.eventCountdown.description = data.description.trim();
    }
    if (typeof data.image === 'string') {
      liveState.eventCountdown.image = data.image.trim();
    }
    if (typeof data.targetDate === 'string') {
      liveState.eventCountdown.targetDate = data.targetDate.trim();
    }
    if (typeof data.targetTime === 'string') {
      liveState.eventCountdown.targetTime = data.targetTime.trim();
    }
    if (typeof data.targetTimestamp === 'number' || data.targetTimestamp === null) {
      liveState.eventCountdown.targetTimestamp = data.targetTimestamp;
    }
    liveState.eventCountdown.updatedAt = Date.now();
    saveSettings();
    io.emit('state-update', liveState);
    if (typeof callback === 'function') {
      callback({ success: true, eventCountdown: liveState.eventCountdown });
    }
  });

  // 5.d. Overlay Inferior de Chat Destacado y TTS
  socket.on('trigger-chat-announcement', (data) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    liveState.chatOverlay.isVisible = false;
    io.emit('state-update', liveState);
  });

  // ============================================================
  // 5.e. APARTADO DE MODS: CHAT INTERNO ADMIN <-> MODS, ALERTA EN STREAM Y TTS ESPECIAL DE MODS
  // ============================================================
  socket.on('send-mods-chat', (data, callback) => {
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser) return;
    const text = data && typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return;

    const msg = {
      id: `modmsg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: authUser.id,
      username: authUser.username,
      displayName: authUser.displayName || authUser.username,
      level: authUser.level, // 'nivel_1' | 'mods'
      text: text.slice(0, 800),
      timestamp: Date.now()
    };

    modsChatHistory.push(msg);
    if (modsChatHistory.length > 200) {
      modsChatHistory = modsChatHistory.slice(-200);
    }
    saveModsChat(modsChatHistory);
    io.emit('mods-chat-message', msg);

    if (typeof callback === 'function') {
      callback({ ok: true, success: true, message: msg });
    }
  });

  socket.on('clear-mods-chat', (callback) => {
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser) return;
    modsChatHistory = [];
    saveModsChat(modsChatHistory);
    io.emit('mods-chat-history', []);
    if (typeof callback === 'function') {
      callback({ ok: true, success: true });
    }
  });

  // Activar alerta visual en esquina inferior izquierda del stream (con sonido de 1 segundo al recibirla)
  socket.on('activate-mod-alert', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser) return;

    liveState.modAlert = {
      isActive: true,
      triggeredBy: authUser.displayName || authUser.username || 'MODS',
      triggeredAt: Date.now()
    };

    io.emit('state-update', liveState);
    io.emit('mod-alert-triggered', liveState.modAlert);

    if (typeof cb === 'function') {
      cb({ ok: true, success: true, modAlert: liveState.modAlert });
    }
  });

  // Desactivar alerta (Solo cuando el MOD la desactiva o el Admin entra al apartado de MODS)
  socket.on('deactivate-mod-alert', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser) return;

    if (liveState.modAlert.isActive) {
      liveState.modAlert.isActive = false;
      io.emit('state-update', liveState);
      io.emit('mod-alert-cleared', {
        clearedBy: authUser.displayName || authUser.username,
        reason: (data && typeof data === 'object' && data.reason) || 'manual-mod'
      });
    }

    if (typeof cb === 'function') {
      cb({ ok: true, success: true, modAlert: liveState.modAlert });
    }
  });

  // Cuando el Admin (Usuario Nivel 1) entra o interactúa activamente en el apartado de MODS, se desactiva la alerta si estaba activa
  socket.on('admin-entered-mods', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser || authUser.level !== 'nivel_1') return;

    if (liveState.modAlert && liveState.modAlert.isActive) {
      liveState.modAlert.isActive = false;
      io.emit('state-update', liveState);
      io.emit('mod-alert-cleared', {
        clearedBy: authUser.displayName || authUser.username,
        reason: 'admin-entered-mods'
      });
    }

    if (typeof cb === 'function') {
      cb({ ok: true, success: true, modAlert: liveState.modAlert });
    }
  });

  // Reporte de presencia real del Admin (En Línea vs Ausente / Ventana Minimizada / Otra Pestaña)
  socket.on('admin-presence-report', (data) => {
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser || authUser.level !== 'nivel_1') return;

    const activeTab = (data && typeof data.activeTab === 'string') ? data.activeTab : 'main';
    const isVisible = !!(data && data.isVisible);
    const isFocused = !!(data && data.isFocused);
    const isIdle = !!(data && data.isIdle);

    let status = 'away';
    if (isVisible && isFocused && !isIdle) {
      status = activeTab === 'mods' ? 'online_mods' : 'online_panel';
    } else {
      status = 'away';
    }

    adminSocketsPresence.set(socket.id, {
      status,
      activeTab,
      isVisible,
      isFocused,
      isIdle,
      username: authUser.displayName || authUser.username || 'Admin',
      updatedAt: Date.now()
    });
    recomputeAdminPresence();
  });

  // TTS Especial de MODS para hablar en el stream
  socket.on('trigger-mod-tts', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    const authUser = getAuthenticatedUserFromSocket(socket);
    if (!authUser) return;
    const rawText = data && typeof data.text === 'string' ? data.text.trim() : '';
    if (!rawText) return;

    const payload = {
      isModSpecial: true,
      user: authUser.displayName || authUser.username || 'MODS',
      username: authUser.username || 'mods',
      level: authUser.level,
      text: rawText,
      introStyle: (data && data.introStyle) || 'mod_equipo',
      prefix: 'MODS TTS',
      tts: true,
      ttsRate: liveState.chatOverlay.ttsRate || 0.93,
      ttsPitch: liveState.chatOverlay.ttsPitch || 0.82,
      ttsVoiceName: liveState.chatOverlay.ttsVoiceName || '',
      timestamp: Date.now()
    };

    liveState.chatOverlay.isVisible = true;
    liveState.chatOverlay.lastMessage = payload;
    io.emit('state-update', liveState);
    io.emit('mod-tts-announcement', payload);

    if (typeof cb === 'function') {
      cb({ ok: true, success: true, payload });
    }
  });

  socket.on('hide-mod-tts', () => {
    if (!isAuthorized()) return;
    liveState.chatOverlay.isVisible = false;
    io.emit('state-update', liveState);
    io.emit('stop-mod-tts');
  });

  socket.on('toggle-chat-tts', (payload) => {
    if (!isAuthorized()) return;
    if (payload && typeof payload.enabled === 'boolean') {
      liveState.chatOverlay.ttsEnabled = payload.enabled;
    } else {
      liveState.chatOverlay.ttsEnabled = !liveState.chatOverlay.ttsEnabled;
    }
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('update-chat-prefix', (data) => {
    if (!isAuthorized()) return;
    if (data && typeof data.prefix === 'string' && data.prefix.trim()) {
      liveState.chatOverlay.commandPrefix = data.prefix.trim();
      saveSettings();
      io.emit('state-update', liveState);
    }
  });

  socket.on('update-chat-tts-config', (data) => {
    if (!isAuthorized()) return;
    if (!data) return;
    if (typeof data.style === 'string') liveState.chatOverlay.ttsStyle = data.style;
    if (typeof data.rate === 'number') liveState.chatOverlay.ttsRate = data.rate;
    if (typeof data.pitch === 'number') liveState.chatOverlay.ttsPitch = data.pitch;
    if (typeof data.voiceName === 'string') liveState.chatOverlay.ttsVoiceName = data.voiceName;
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('save-fight', (fightData, callback) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    const s = Math.min(100, Math.max(40, Number(scalePercent) || 65));
    liveState.scale = s;
    saveSettings();
    io.emit('state-update', liveState);
  });

  socket.on('set-autohide', (seconds) => {
    if (!isAuthorized()) return;
    const sec = Math.max(0, parseInt(seconds, 10) || 0);
    liveState.defaultAutoHide = sec;
    saveSettings();
    io.emit('state-update', liveState);
  });

  // 7. Guardar / Editar / Eliminar / Sincronizar Presentadores
  socket.on('save-presenter', (presData, callback) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    try {
      if (backupData.presenters && Array.isArray(backupData.presenters)) {
        presenters = backupData.presenters;
        savePresenters(presenters);
      }
      if (backupData.settings) {
        if (typeof backupData.settings.scale === 'number') liveState.scale = backupData.settings.scale;
        if (typeof backupData.settings.defaultAutoHide === 'number') liveState.defaultAutoHide = backupData.settings.defaultAutoHide;
        if (backupData.settings.eventCountdown && typeof backupData.settings.eventCountdown === 'object') {
          liveState.eventCountdown = { ...liveState.eventCountdown, ...backupData.settings.eventCountdown };
        }
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
  socket.emit('multicam-waiting-updated', { roomId: 'main', waiting: getWaitingPeers('main') });
  socket.emit('multicam-banned-ips-updated', { bannedIps: Array.from(bannedIps) });

  // Solicitud de ingreso a la sala (Verificación / Sala de Espera para que el Host acepte o rechace)
  socket.on('multicam-request-join', ({ roomId = 'main', peerId, userInfo = {}, role = 'guest' }, callback) => {
    if (!peerId) {
      if (typeof callback === 'function') callback({ success: false, error: 'peerId requerido' });
      return;
    }

    if (!multicamRooms[roomId]) {
      multicamRooms[roomId] = { peers: {}, waiting: {} };
    }
    if (!multicamRooms[roomId].waiting) {
      multicamRooms[roomId].waiting = {};
    }

    const clientIp = getClientIp(socket);
    if (role !== 'overlay' && bannedIps.has(clientIp)) {
      socket.emit('multicam-banned', { reason: 'Has sido bloqueado de esta sala por el anfitrión.' });
      if (typeof callback === 'function') callback({ success: false, banned: true, error: 'Has sido bloqueado por el anfitrión.' });
      socket.disconnect(true);
      return;
    }

    // Si es un overlay de OBS o un participante que ya fue aprobado previamente en esta sesión, aprobar directo
    if (role === 'overlay' || approvedPeerIds.has(peerId)) {
      if (typeof callback === 'function') {
        callback({ success: true, status: 'approved' });
      }
      return;
    }

    let initials = userInfo.initials;
    if (!initials && userInfo.name) {
      const parts = userInfo.name.trim().split(/\s+/);
      initials = (parts.length > 1)
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].substring(0, 2).toUpperCase();
    }
    if (!initials) initials = 'BV';

    const isHost = !!(userInfo.isHost || role === 'host');
    const existingWaiting = multicamRooms[roomId].waiting[peerId];
    const waitingPeer = {
      id: peerId,
      socketId: socket.id,
      roomId,
      role: isHost ? 'host' : 'guest',
      isHost,
      name: userInfo.name || 'Invitado',
      photo: userInfo.photo || '',
      initials,
      hasVideo: userInfo.hasVideo !== false,
      hasAudio: userInfo.hasAudio !== false,
      clientIp,
      requestedAt: existingWaiting ? existingWaiting.requestedAt : Date.now(),
      ttsAnnounced: false
    };

    multicamRooms[roomId].waiting[peerId] = waitingPeer;
    socket.multicamRoomId = roomId;
    socket.multicamPeerId = peerId;
    socket.multicamWaiting = true;

    const timerKey = `${roomId}:${peerId}`;
    if (waitingTtsTimers.has(timerKey)) {
      clearTimeout(waitingTtsTimers.get(timerKey));
    }

    // 1. Primero disparar el TTS y el vector de audio brillante en verde en la esquina inferior derecha de OBS
    io.emit('multicam-join-request-tts-start', { roomId, peer: waitingPeer });

    // 2. Respaldo automático: si el audio está muteado o ningún navegador confirma el fin del TTS en 5.2s, mostrar la notificación en Escenas
    const fallbackMs = (liveState.masterMuted || multicamSettings.audioMutedOverall || (liveState.chatOverlay && liveState.chatOverlay.ttsEnabled === false))
      ? 600
      : 5200;
    const t = setTimeout(() => {
      completeJoinRequestTts(roomId, peerId);
    }, fallbackMs);
    waitingTtsTimers.set(timerKey, t);

    if (typeof callback === 'function') {
      callback({ success: true, status: 'waiting' });
    }
  });

  // Confirmación de que OBS Overlay tomó la reproducción del TTS de ingreso (evita eco doble en Admin)
  socket.on('join-request-tts-ack', (data) => {
    io.emit('join-request-tts-ack', data);
  });

  // Cuando el TTS termina de anunciar al usuario que intenta entrar, mostrar la notificación en Escenas
  socket.on('multicam-join-request-tts-complete', ({ roomId = 'main', peerId } = {}) => {
    completeJoinRequestTts(roomId, peerId);
  });

  // Cancelar solicitud de ingreso desde /guest
  socket.on('multicam-cancel-join', ({ roomId = 'main', peerId }) => {
    const targetId = peerId || socket.multicamPeerId;
    const timerKey = `${roomId}:${targetId}`;
    if (waitingTtsTimers.has(timerKey)) {
      clearTimeout(waitingTtsTimers.get(timerKey));
      waitingTtsTimers.delete(timerKey);
    }
    if (targetId && multicamRooms[roomId] && multicamRooms[roomId].waiting && multicamRooms[roomId].waiting[targetId]) {
      delete multicamRooms[roomId].waiting[targetId];
      socket.multicamWaiting = false;
      io.emit('multicam-join-request-tts-ended', { roomId, peerId: targetId });
      io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
    }
  });

  // Aprobar ingreso de un participante desde el Panel de Host
  socket.on('multicam-approve-join', ({ roomId = 'main', peerId, asHost = null }) => {
    if (!isAuthorized()) return;
    if (!peerId || !multicamRooms[roomId] || !multicamRooms[roomId].waiting) return;
    const waitingPeer = multicamRooms[roomId].waiting[peerId];
    approvedPeerIds.add(peerId);
    delete multicamRooms[roomId].waiting[peerId];

    if (waitingPeer && waitingPeer.socketId) {
      const finalIsHost = typeof asHost === 'boolean' ? asHost : !!waitingPeer.isHost;
      io.to(waitingPeer.socketId).emit('multicam-join-approved', {
        roomId,
        peerId,
        isHost: finalIsHost
      });
    }

    io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
  });

  // Aprobar a todos los que están en sala de espera
  socket.on('multicam-approve-all-waiting', ({ roomId = 'main' } = {}) => {
    if (!isAuthorized()) return;
    if (!multicamRooms[roomId] || !multicamRooms[roomId].waiting) return;
    const waitingList = Object.values(multicamRooms[roomId].waiting);
    multicamRooms[roomId].waiting = {};

    waitingList.forEach(waitingPeer => {
      approvedPeerIds.add(waitingPeer.id);
      if (waitingPeer.socketId) {
        io.to(waitingPeer.socketId).emit('multicam-join-approved', {
          roomId,
          peerId: waitingPeer.id,
          isHost: !!waitingPeer.isHost
        });
      }
    });

    io.emit('multicam-waiting-updated', { roomId, waiting: [] });
  });

  // Rechazar ingreso de un participante desde el Panel de Host (con opción de banear IP)
  socket.on('multicam-reject-join', ({ roomId = 'main', peerId, banIp = false }) => {
    if (!isAuthorized()) return;
    if (!peerId || !multicamRooms[roomId] || !multicamRooms[roomId].waiting) return;
    const waitingPeer = multicamRooms[roomId].waiting[peerId];
    approvedPeerIds.delete(peerId);
    delete multicamRooms[roomId].waiting[peerId];

    if (waitingPeer) {
      if (banIp && waitingPeer.clientIp && waitingPeer.clientIp !== 'unknown') {
        bannedIps.add(waitingPeer.clientIp);
        saveBannedIps();
        io.emit('multicam-banned-ips-updated', { bannedIps: Array.from(bannedIps) });
        if (waitingPeer.socketId) {
          io.to(waitingPeer.socketId).emit('multicam-banned', {
            reason: 'Tu solicitud de ingreso fue rechazada y tu IP fue bloqueada por el anfitrión.'
          });
        }
      } else if (waitingPeer.socketId) {
        io.to(waitingPeer.socketId).emit('multicam-join-rejected', {
          reason: 'El anfitrión no autorizó tu ingreso a la sala en este momento.'
        });
      }
    }

    io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
  });

  // Unirse a una sala (Invitado, Host u Overlay de OBS)
  socket.on('multicam-join', ({ roomId = 'main', peerId, userInfo = {}, role = 'guest' }, callback) => {
    if (!peerId) {
      if (typeof callback === 'function') callback({ success: false, error: 'peerId requerido' });
      return;
    }

    if (!multicamRooms[roomId]) {
      multicamRooms[roomId] = { peers: {}, waiting: {} };
    }
    if (multicamRooms[roomId].waiting && multicamRooms[roomId].waiting[peerId]) {
      delete multicamRooms[roomId].waiting[peerId];
      io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
    }
    socket.multicamWaiting = false;
    approvedPeerIds.add(peerId);

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

    const existingPeer = multicamRooms[roomId].peers[peerId];
    const isHost = existingPeer ? !!existingPeer.isHost : !!(userInfo.isHost || role === 'host');
    const peerData = {
      id: peerId,
      socketId: socket.id,
      roomId,
      role: isHost ? 'host' : role, // 'guest' | 'host' | 'overlay'
      isHost: isHost,
      name: userInfo.name || (existingPeer && existingPeer.name) || 'Invitado',
      photo: userInfo.photo || (existingPeer && existingPeer.photo) || '',
      initials,
      hasVideo: userInfo.hasVideo !== false,
      hasAudio: userInfo.hasAudio !== false,
      isStreamMuted: existingPeer ? !!existingPeer.isStreamMuted : false, // Silenciado en stream pero audible en sala
      isHidden: existingPeer ? !!existingPeer.isHidden : false,
      slot: existingPeer ? existingPeer.slot : null,
      clientIp,
      joinedAt: existingPeer ? existingPeer.joinedAt : Date.now()
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
      // Solo cambiar isHost desde el cliente si fue un cambio explícito del checkbox de Host, NUNCA al encender/apagar cámara o mic
      if (userInfo.explicitHostChange === true && typeof userInfo.isHost === 'boolean') {
        peer.isHost = userInfo.isHost;
        peer.role = userInfo.isHost ? 'host' : 'guest';
      }
      if (userInfo.initials) peer.initials = userInfo.initials;

      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Señalización en tiempo real de quién está hablando (permite iluminar en verde en OBS incluso al Host cuyo audio no pasa a OBS)
  socket.on('multicam-speaking', ({ roomId = 'main', peerId, speaking }) => {
    const pId = peerId || socket.multicamPeerId;
    if (!pId) return;
    io.emit('multicam-peer-speaking', { roomId, peerId: pId, speaking: !!speaking });
  });

  // Designar / Desmarcar Anfitrión (Host) desde panel o cliente
  socket.on('multicam-set-host', ({ roomId = 'main', peerId, isHost }) => {
    if (!isAuthorized()) return;
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      const peer = multicamRooms[roomId].peers[peerId];
      peer.isHost = !!isHost;
      peer.role = isHost ? 'host' : 'guest';
      if (peer.socketId) {
        io.to(peer.socketId).emit('multicam-host-status-changed', { isHost: !!isHost });
      }
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Cambio de Escena Multicam desde el panel de Host
  socket.on('multicam-change-scene', ({ scene }) => {
    if (!isAuthorized()) return;
    if (scene) {
      multicamSettings.activeScene = scene;
      saveMulticamSettings();
      io.emit('multicam-settings-updated', multicamSettings);
    }
  });

  // Guardar ajustes generales de multicam
  socket.on('multicam-save-settings', (newSettings) => {
    if (!isAuthorized()) return;
    multicamSettings = { ...multicamSettings, ...newSettings };
    saveMulticamSettings();
    io.emit('multicam-settings-updated', multicamSettings);
  });

  // Ocultar o mostrar una cámara específica en el overlay
  socket.on('multicam-toggle-peer-visibility', ({ roomId = 'main', peerId, isHidden }) => {
    if (!isAuthorized()) return;
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].isHidden = !!isHidden;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Asignar slot / posición a una cámara
  socket.on('multicam-assign-slot', ({ roomId = 'main', peerId, slot }) => {
    if (!isAuthorized()) return;
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].slot = slot;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Expulsar participante de la sala
  socket.on('multicam-kick-peer', ({ roomId = 'main', peerId }) => {
    if (!isAuthorized()) return;
    approvedPeerIds.delete(peerId);
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
    if (!isAuthorized()) return;
    if (multicamRooms[roomId] && multicamRooms[roomId].peers[peerId]) {
      multicamRooms[roomId].peers[peerId].isStreamMuted = !!isStreamMuted;
      const currentPeers = getRoomPeers(roomId);
      io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
      io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
    }
  });

  // Forzar mute de micrófono al participante (en toda la sala)
  socket.on('multicam-force-mute-peer', ({ roomId = 'main', peerId }) => {
    if (!isAuthorized()) return;
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
    if (!isAuthorized()) return;
    approvedPeerIds.delete(peerId);
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
    if (!isAuthorized()) return;
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

  // Manejo de desconexión para limpiar WebRTC, presencia de Admin y sala de espera
  socket.on('disconnect', () => {
    if (adminSocketsPresence.has(socket.id)) {
      adminSocketsPresence.delete(socket.id);
      recomputeAdminPresence();
    }
    const roomId = socket.multicamRoomId;
    const peerId = socket.multicamPeerId;
    if (roomId && peerId && multicamRooms[roomId]) {
      const timerKey = `${roomId}:${peerId}`;
      if (waitingTtsTimers.has(timerKey)) {
        clearTimeout(waitingTtsTimers.get(timerKey));
        waitingTtsTimers.delete(timerKey);
      }
      if (multicamRooms[roomId].waiting && multicamRooms[roomId].waiting[peerId]) {
        delete multicamRooms[roomId].waiting[peerId];
        io.emit('multicam-join-request-tts-ended', { roomId, peerId });
        io.emit('multicam-waiting-updated', { roomId, waiting: getWaitingPeers(roomId) });
      }
      if (multicamRooms[roomId].peers && multicamRooms[roomId].peers[peerId]) {
        delete multicamRooms[roomId].peers[peerId];
        const currentPeers = getRoomPeers(roomId);
        io.to('multicam-' + roomId).emit('multicam-peers-updated', { roomId, peers: currentPeers });
        io.to('multicam-' + roomId).emit('multicam-peer-left', { peerId });
        io.emit('multicam-admin-peers-updated', { roomId, peers: currentPeers });
      }
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