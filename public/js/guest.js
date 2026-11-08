/**
 * BirraVerde Multicam - Cliente de Invitado / Sala de Videollamada
 * Soporte WebRTC Mesh + Iniciales estilo Teams + Audio Meter + Screen Share
 */

(function () {
  'use strict';

  // Configuración WebRTC con STUN público de Google
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Paleta de gradientes atractivos estilo Teams / Cyber
  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #10b981, #047857)', // Esmeralda BirraVerde
    'linear-gradient(135deg, #06b6d4, #0e7490)', // Cyan
    'linear-gradient(135deg, #8b5cf6, #5b21b6)', // Púrpura Cyber
    'linear-gradient(135deg, #f59e0b, #b45309)', // Ámbar / Dorado
    'linear-gradient(135deg, #ec4899, #be185d)', // Magenta
    'linear-gradient(135deg, #3b82f6, #1d4ed8)', // Azul Neón
    'linear-gradient(135deg, #f43f5e, #9f1239)'  // Carmesí
  ];

  function getGradientForName(name) {
    if (!name) return AVATAR_GRADIENTS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[index];
  }

  function computeInitials(name) {
    if (!name || typeof name !== 'string') return 'BV';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'BV';
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Estado del cliente
  const state = {
    peerId: 'peer-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36),
    roomId: 'main',
    name: '',
    photo: '',
    initials: 'BV',
    hasVideo: false,
    hasAudio: true,
    isJoined: false,
    localStream: null,
    screenStream: null,
    audioContext: null,
    audioAnalyser: null,
    audioSource: null,
    meterAnimationId: null,
    selectedVideoId: '',
    selectedAudioId: ''
  };

  // Mapa de conexiones WebRTC con otros peers: peerId -> RTCPeerConnection
  const peerConnections = new Map();
  // Streams remotos guardados: peerId -> MediaStream
  const remoteStreams = new Map();
  // Info de peers conocidos en la sala: peerId -> peerData
  const knownPeers = new Map();

  // Socket
  const socket = io();

  // Elementos del DOM
  const lobbyView = document.getElementById('lobby-view');
  const callView = document.getElementById('call-view');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');

  // Lobby Inputs
  const inputName = document.getElementById('input-guest-name');
  const inputAvatarFile = document.getElementById('input-guest-avatar-file');
  const btnRemoveAvatar = document.getElementById('btn-remove-avatar');
  const avatarFilename = document.getElementById('avatar-filename');
  const selectVideoDevice = document.getElementById('select-video-device');
  const selectAudioDevice = document.getElementById('select-audio-device');
  const btnToggleCamLobby = document.getElementById('btn-toggle-cam-lobby');
  const btnToggleMicLobby = document.getElementById('btn-toggle-mic-lobby');
  const btnJoinRoom = document.getElementById('btn-join-room');

  // Preview elements
  const previewVideo = document.getElementById('preview-video');
  const previewAvatarBox = document.getElementById('preview-avatar-box');
  const previewAvatarCircle = document.getElementById('preview-avatar-circle');
  const previewInitials = document.getElementById('preview-initials');
  const previewAvatarImg = document.getElementById('preview-avatar-img');
  const previewAvatarName = document.getElementById('preview-avatar-name');
  const badgeCamState = document.getElementById('badge-cam-state');
  const micLevelBar = document.getElementById('mic-level-bar');
  const micTestStatus = document.getElementById('mic-test-status');

  // Call elements
  const participantsGrid = document.getElementById('participants-grid');
  const participantsCountBadge = document.getElementById('call-participants-count');
  const btnCallToggleMic = document.getElementById('btn-call-toggle-mic');
  const btnCallToggleCam = document.getElementById('btn-call-toggle-cam');
  const btnCallShareScreen = document.getElementById('btn-call-share-screen');
  const btnCallLeave = document.getElementById('btn-call-leave');

  // URL Params (posibilidad de pasar ?name=... o ?room=...)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('room')) {
    state.roomId = urlParams.get('room');
  }
  if (urlParams.get('name')) {
    inputName.value = urlParams.get('name');
  }

  // ============================================================
  // INICIALIZACIÓN Y PERMISOS DE MEDIOS
  // ============================================================

  // Cargar nombre guardado en LocalStorage si existe
  const savedName = localStorage.getItem('birra_multicam_name');
  if (savedName && !inputName.value) {
    inputName.value = savedName;
  }
  const savedPhoto = localStorage.getItem('birra_multicam_photo');
  if (savedPhoto) {
    state.photo = savedPhoto;
    previewAvatarImg.src = savedPhoto;
    previewAvatarImg.classList.remove('hidden');
    previewInitials.classList.add('hidden');
    btnRemoveAvatar.classList.remove('hidden');
    avatarFilename.textContent = 'Foto personalizada cargada';
  }

  updateLobbyPreview();

  // Listar dispositivos de medios
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      selectVideoDevice.innerHTML = '<option value="">Cámara por defecto</option>';
      selectAudioDevice.innerHTML = '<option value="">Micrófono por defecto</option>';

      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        if (device.kind === 'videoinput') {
          option.textContent = device.label || `Cámara ${selectVideoDevice.options.length}`;
          selectVideoDevice.appendChild(option);
        } else if (device.kind === 'audioinput') {
          option.textContent = device.label || `Micrófono ${selectAudioDevice.options.length}`;
          selectAudioDevice.appendChild(option);
        }
      });
    } catch (err) {
      console.warn('No se pudieron listar dispositivos aún:', err);
    }
  }

  // Iniciar stream local para preview
  async function initLocalStream(requestVideo = false) {
    try {
      const constraints = {
        audio: state.selectedAudioId ? { deviceId: { exact: state.selectedAudioId } } : true,
        video: requestVideo ? (state.selectedVideoId ? { deviceId: { exact: state.selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }) : false
      };

      // Si ya existía stream previo, detener sus tracks
      if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
      }

      state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      state.hasVideo = requestVideo;
      state.hasAudio = true;

      // Dispositivos ahora etiquetados
      await enumerateDevices();

      // Configurar preview de video
      if (requestVideo) {
        previewVideo.srcObject = state.localStream;
        previewVideo.classList.remove('hidden');
        previewAvatarBox.classList.add('hidden');
        badgeCamState.innerHTML = '<i data-lucide="video" class="w-3.5 h-3.5 text-cyber-green"></i> Cámara Activa';
        btnToggleCamLobby.innerHTML = '<i data-lucide="video-off" class="w-4 h-4 text-cyber-red"></i> <span>Apagar Cámara</span>';
      } else {
        previewVideo.srcObject = null;
        previewVideo.classList.add('hidden');
        previewAvatarBox.classList.remove('hidden');
        badgeCamState.innerHTML = '<i data-lucide="video-off" class="w-3.5 h-3.5 text-cyber-red"></i> Cámara Desactivada';
        btnToggleCamLobby.innerHTML = '<i data-lucide="video" class="w-4 h-4 text-cyber-green"></i> <span>Encender Cámara</span>';
      }

      // Iniciar Vúmetro de audio
      setupAudioMeter(state.localStream);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.warn('Error al obtener stream local:', err);
      badgeCamState.innerHTML = '<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-yellow-500"></i> Sin permisos de cámara/mic';
      if (window.lucide) lucide.createIcons();
    }
  }

  // Intentar iniciar audio inicialmente para verificar micro
  initLocalStream(false);

  // Vúmetro con Web Audio API
  function setupAudioMeter(stream) {
    try {
      if (state.audioContext) {
        state.audioContext.close();
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      state.audioContext = new AudioContext();
      state.audioSource = state.audioContext.createMediaStreamSource(stream);
      state.audioAnalyser = state.audioContext.createAnalyser();
      state.audioAnalyser.fftSize = 256;
      state.audioAnalyser.smoothingTimeConstant = 0.4;
      state.audioSource.connect(state.audioAnalyser);

      const bufferLength = state.audioAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function renderMeter() {
        if (!state.audioAnalyser) return;
        state.audioAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const percent = Math.min(100, Math.round((avg / 80) * 100));

        if (micLevelBar) {
          micLevelBar.style.width = percent + '%';
        }
        if (micTestStatus) {
          if (percent > 18) {
            micTestStatus.textContent = 'Detectando voz';
            micTestStatus.className = 'text-cyber-green font-bold';
          } else {
            micTestStatus.textContent = 'Silencio';
            micTestStatus.className = 'text-gray-400';
          }
        }

        // Si ya estamos en la llamada, actualizar halo local
        if (state.isJoined) {
          const localBox = document.getElementById('card-peer-' + state.peerId);
          if (localBox) {
            if (percent > 18 && state.hasAudio) {
              localBox.classList.add('speaking-glow');
            } else {
              localBox.classList.remove('speaking-glow');
            }
          }
        }

        state.meterAnimationId = requestAnimationFrame(renderMeter);
      }

      cancelAnimationFrame(state.meterAnimationId);
      renderMeter();
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }

  // ============================================================
  // PREVIEW REACTIVO ESTILO TEAMS
  // ============================================================
  function updateLobbyPreview() {
    const rawName = inputName.value.trim();
    state.name = rawName || 'Tu Nombre';
    state.initials = computeInitials(state.name);

    previewAvatarName.textContent = state.name;
    previewInitials.textContent = state.initials;

    if (!state.photo) {
      previewAvatarCircle.style.background = getGradientForName(state.name);
      previewAvatarImg.classList.add('hidden');
      previewInitials.classList.remove('hidden');
    } else {
      previewAvatarImg.src = state.photo;
      previewAvatarImg.classList.remove('hidden');
      previewInitials.classList.add('hidden');
    }
  }

  inputName.addEventListener('input', () => {
    updateLobbyPreview();
    localStorage.setItem('birra_multicam_name', inputName.value.trim());
  });

  // Subir Foto opcional
  inputAvatarFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target.result;
      state.photo = base64Data;
      localStorage.setItem('birra_multicam_photo', base64Data);
      avatarFilename.textContent = file.name;
      btnRemoveAvatar.classList.remove('hidden');
      updateLobbyPreview();

      // Si ya está en la sala, notificar actualización
      if (state.isJoined) {
        notifyProfileUpdate();
      }
    };
    reader.readAsDataURL(file);
  });

  btnRemoveAvatar.addEventListener('click', () => {
    state.photo = '';
    localStorage.removeItem('birra_multicam_photo');
    inputAvatarFile.value = '';
    avatarFilename.textContent = 'Sin foto (usar iniciales)';
    btnRemoveAvatar.classList.add('hidden');
    updateLobbyPreview();
    if (state.isJoined) {
      notifyProfileUpdate();
    }
  });

  // Toggle Cámara en Lobby
  btnToggleCamLobby.addEventListener('click', async () => {
    const newVideoState = !state.hasVideo;
    await initLocalStream(newVideoState);
  });

  // Toggle Micrófono en Lobby
  btnToggleMicLobby.addEventListener('click', () => {
    state.hasAudio = !state.hasAudio;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(track => {
        track.enabled = state.hasAudio;
      });
    }
    if (state.hasAudio) {
      btnToggleMicLobby.innerHTML = '<i data-lucide="mic" class="w-4 h-4 text-cyber-green"></i> <span>Micrófono ON</span>';
    } else {
      btnToggleMicLobby.innerHTML = '<i data-lucide="mic-off" class="w-4 h-4 text-cyber-red"></i> <span>Micrófono MUTE</span>';
    }
    if (window.lucide) lucide.createIcons();
  });

  // Selección de dispositivos
  selectVideoDevice.addEventListener('change', async () => {
    state.selectedVideoId = selectVideoDevice.value;
    if (state.hasVideo) {
      await initLocalStream(true);
    }
  });

  selectAudioDevice.addEventListener('change', async () => {
    state.selectedAudioId = selectAudioDevice.value;
    await initLocalStream(state.hasVideo);
  });

  // ============================================================
  // UNIRSE A LA SALA
  // ============================================================
  btnJoinRoom.addEventListener('click', () => {
    const enteredName = inputName.value.trim();
    if (!enteredName) {
      inputName.focus();
      inputName.classList.add('ring-2', 'ring-cyber-red');
      setTimeout(() => inputName.classList.remove('ring-2', 'ring-cyber-red'), 1500);
      return;
    }

    state.name = enteredName;
    state.initials = computeInitials(state.name);

    // Asegurar que AudioContext esté activo por política de interacción de navegadores
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }

    joinMulticamRoom();
  });

  function joinMulticamRoom() {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-pulse';
    connText.textContent = 'En sala: ' + state.roomId;

    socket.emit('multicam-join', {
      roomId: state.roomId,
      peerId: state.peerId,
      role: 'guest',
      userInfo: {
        name: state.name,
        photo: state.photo,
        initials: state.initials,
        hasVideo: state.hasVideo,
        hasAudio: state.hasAudio
      }
    }, (res) => {
      if (res && res.success) {
        state.isJoined = true;
        lobbyView.classList.add('hidden');
        callView.classList.remove('hidden');

        // Renderizar tarjeta local en el grid de la llamada
        renderLocalParticipant();

        // Procesar peers existentes y conectarse
        if (Array.isArray(res.peers)) {
          res.peers.forEach(peer => {
            if (peer.id !== state.peerId && peer.role !== 'overlay') {
              knownPeers.set(peer.id, peer);
              // Como soy el recién llegado, los peers existentes iniciarán la conexión o la inicio yo
              createPeerConnection(peer.id, true);
            }
          });
          updateParticipantsCount();
        }
      }
    });
  }

  function notifyProfileUpdate() {
    socket.emit('multicam-update-profile', {
      roomId: state.roomId,
      userInfo: {
        name: state.name,
        photo: state.photo,
        initials: state.initials,
        hasVideo: state.hasVideo,
        hasAudio: state.hasAudio
      }
    });
    renderLocalParticipant();
  }

  // ============================================================
  // WEBRTC SIGNALING Y CONEXIONES MESH
  // ============================================================
  function createPeerConnection(remotePeerId, isInitiator = false) {
    if (peerConnections.has(remotePeerId)) {
      return peerConnections.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.set(remotePeerId, pc);

    // Añadir tracks locales si existen
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => {
        pc.addTrack(track, state.localStream);
      });
    }

    // Manejo de ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('multicam-signal', {
          toPeerId: remotePeerId,
          fromPeerId: state.peerId,
          roomId: state.roomId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // Recibir tracks remotos
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreams.set(remotePeerId, stream);
      renderRemoteParticipant(remotePeerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(remotePeerId);
      }
    };

    // Si somos el iniciador, crear Offer
    if (isInitiator) {
      pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }).then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('multicam-signal', {
            toPeerId: remotePeerId,
            fromPeerId: state.peerId,
            roomId: state.roomId,
            signal: { type: 'offer', sdp: pc.localDescription }
          });
        })
        .catch(err => console.error('Error creando offer:', err));
    }

    return pc;
  }

  // Manejar señales entrantes del servidor
  socket.on('multicam-signal', async ({ fromPeerId, signal }) => {
    let pc = peerConnections.get(fromPeerId);
    if (!pc) {
      pc = createPeerConnection(fromPeerId, false);
    }

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('multicam-signal', {
          toPeerId: fromPeerId,
          fromPeerId: state.peerId,
          roomId: state.roomId,
          signal: { type: 'answer', sdp: pc.localDescription }
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('Error procesando señal WebRTC:', err);
    }
  });

  // Lista de peers actualizada desde el servidor
  socket.on('multicam-peers-updated', ({ peers }) => {
    if (!Array.isArray(peers)) return;

    peers.forEach(peer => {
      if (peer.id !== state.peerId && peer.role !== 'overlay') {
        const isNew = !knownPeers.has(peer.id);
        knownPeers.set(peer.id, peer);

        if (isNew && state.isJoined) {
          // Iniciar conexión con el nuevo peer
          createPeerConnection(peer.id, true);
        } else {
          // Actualizar render si cambió perfil o video/audio
          renderRemoteParticipant(peer.id, remoteStreams.get(peer.id));
        }
      }
    });

    // Limpiar peers que ya no están
    const currentIds = new Set(peers.map(p => p.id));
    knownPeers.forEach((p, id) => {
      if (!currentIds.has(id)) {
        cleanupPeer(id);
      }
    });

    updateParticipantsCount();
  });

  socket.on('multicam-peer-left', ({ peerId }) => {
    cleanupPeer(peerId);
    updateParticipantsCount();
  });

  socket.on('multicam-kicked', () => {
    alert('Has sido retirado de la sala por el anfitrión.');
    window.location.reload();
  });

  function cleanupPeer(peerId) {
    if (peerConnections.has(peerId)) {
      peerConnections.get(peerId).close();
      peerConnections.delete(peerId);
    }
    remoteStreams.delete(peerId);
    knownPeers.delete(peerId);

    const card = document.getElementById('card-peer-' + peerId);
    if (card) card.remove();
  }

  function updateParticipantsCount() {
    const total = 1 + knownPeers.size;
    participantsCountBadge.textContent = `${total} ${total === 1 ? 'participante' : 'participantes'}`;
  }

  // ============================================================
  // RENDERIZADO DE PARTICIPANTES EN LA SALA
  // ============================================================
  function renderLocalParticipant() {
    let card = document.getElementById('card-peer-' + state.peerId);
    if (!card) {
      card = document.createElement('div');
      card.id = 'card-peer-' + state.peerId;
      card.className = 'relative aspect-video bg-cyber-dark border-2 border-cyber-border rounded-2xl overflow-hidden shadow-xl flex items-center justify-center transition-all';
      participantsGrid.prepend(card);
    }

    const hasVideo = state.hasVideo && state.localStream && state.localStream.getVideoTracks().some(t => t.enabled);

    card.innerHTML = `
      <video id="call-local-video" autoplay playsinline muted class="w-full h-full object-cover video-mirror ${hasVideo ? '' : 'hidden'}"></video>
      <div id="call-local-avatar" class="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cyber-card to-cyber-black ${hasVideo ? 'hidden' : ''}">
        <div class="w-24 h-24 rounded-full border-4 border-cyber-border flex items-center justify-center text-3xl font-bold font-chakra tracking-wider shadow-xl overflow-hidden" style="background: ${state.photo ? 'none' : getGradientForName(state.name)}">
          ${state.photo ? `<img src="${state.photo}" class="w-full h-full object-cover" alt="${state.name}">` : `<span>${state.initials}</span>`}
        </div>
        <p class="mt-3 text-sm font-semibold font-chakra text-white tracking-wider">${state.name} (Tú)</p>
      </div>

      <!-- Lower-third badge -->
      <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div class="flex items-center gap-2 px-3 py-1 rounded-xl bg-black/80 backdrop-blur border border-cyber-border text-xs font-chakra font-bold">
          <span class="w-2 h-2 rounded-full ${hasVideo ? 'bg-cyber-green' : 'bg-yellow-500'}"></span>
          <span class="truncate max-w-[140px] text-gray-200">${state.name} (Tú)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-7 h-7 rounded-lg bg-black/80 backdrop-blur border border-cyber-border flex items-center justify-center text-xs">
            <i data-lucide="${state.hasAudio ? 'mic' : 'mic-off'}" class="w-3.5 h-3.5 ${state.hasAudio ? 'text-cyber-green' : 'text-cyber-red'}"></i>
          </span>
        </div>
      </div>
    `;

    const vElem = card.querySelector('#call-local-video');
    if (vElem && state.localStream) {
      vElem.srcObject = state.localStream;
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderRemoteParticipant(peerId, stream) {
    const peerData = knownPeers.get(peerId);
    if (!peerData) return;

    let card = document.getElementById('card-peer-' + peerId);
    if (!card) {
      card = document.createElement('div');
      card.id = 'card-peer-' + peerId;
      card.className = 'relative aspect-video bg-cyber-dark border-2 border-cyber-border rounded-2xl overflow-hidden shadow-xl flex items-center justify-center transition-all';
      participantsGrid.appendChild(card);
    }

    const hasVideo = peerData.hasVideo && stream && stream.getVideoTracks().length > 0;
    const gradient = getGradientForName(peerData.name);

    card.innerHTML = `
      <video id="call-video-${peerId}" autoplay playsinline class="w-full h-full object-cover ${hasVideo ? '' : 'hidden'}"></video>
      <div id="call-avatar-${peerId}" class="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cyber-card to-cyber-black ${hasVideo ? 'hidden' : ''}">
        <div class="w-24 h-24 rounded-full border-4 border-cyber-border flex items-center justify-center text-3xl font-bold font-chakra tracking-wider shadow-xl overflow-hidden" style="background: ${peerData.photo ? 'none' : gradient}">
          ${peerData.photo ? `<img src="${peerData.photo}" class="w-full h-full object-cover" alt="${peerData.name}">` : `<span>${peerData.initials || 'IN'}</span>`}
        </div>
        <p class="mt-3 text-sm font-semibold font-chakra text-white tracking-wider">${peerData.name}</p>
      </div>

      <!-- Lower-third badge -->
      <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div class="flex items-center gap-2 px-3 py-1 rounded-xl bg-black/80 backdrop-blur border border-cyber-border text-xs font-chakra font-bold">
          <span class="w-2 h-2 rounded-full ${hasVideo ? 'bg-cyber-green' : 'bg-gray-500'}"></span>
          <span class="truncate max-w-[140px] text-gray-200">${peerData.name}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-7 h-7 rounded-lg bg-black/80 backdrop-blur border border-cyber-border flex items-center justify-center text-xs">
            <i data-lucide="${peerData.hasAudio ? 'mic' : 'mic-off'}" class="w-3.5 h-3.5 ${peerData.hasAudio ? 'text-cyber-green' : 'text-cyber-red'}"></i>
          </span>
        </div>
      </div>
    `;

    const vElem = card.querySelector('#call-video-' + peerId);
    if (vElem && stream) {
      vElem.srcObject = stream;
    }

    if (window.lucide) lucide.createIcons();
  }

  // ============================================================
  // CONTROLES DE LA SALA EN VIVO
  // ============================================================
  btnCallToggleMic.addEventListener('click', () => {
    state.hasAudio = !state.hasAudio;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(t => t.enabled = state.hasAudio);
    }
    btnCallToggleMic.className = `w-11 h-11 rounded-xl border flex items-center justify-center transition-all shadow-md ${
      state.hasAudio ? 'bg-cyber-card border-cyber-border text-cyber-green' : 'bg-cyber-red/20 border-cyber-red text-cyber-red'
    }`;
    btnCallToggleMic.innerHTML = `<i data-lucide="${state.hasAudio ? 'mic' : 'mic-off'}" class="w-5 h-5"></i>`;
    notifyProfileUpdate();
  });

  btnCallToggleCam.addEventListener('click', async () => {
    state.hasVideo = !state.hasVideo;
    if (state.hasVideo) {
      // Pedir track de video
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: state.selectedVideoId ? { deviceId: { exact: state.selectedVideoId } } : true
        });
        const newTrack = vStream.getVideoTracks()[0];

        // Reemplazar o añadir track a las conexiones WebRTC
        peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, state.localStream);
          }
        });

        // Actualizar localStream
        state.localStream.getVideoTracks().forEach(t => t.stop());
        state.localStream.addTrack(newTrack);
      } catch (e) {
        console.error('Error encendiendo video:', e);
        state.hasVideo = false;
      }
    } else {
      // Detener video
      if (state.localStream) {
        state.localStream.getVideoTracks().forEach(t => {
          t.stop();
          state.localStream.removeTrack(t);
        });
      }
    }

    btnCallToggleCam.className = `w-11 h-11 rounded-xl border flex items-center justify-center transition-all shadow-md ${
      state.hasVideo ? 'bg-cyber-card border-cyber-border text-cyber-green' : 'bg-cyber-red/20 border-cyber-red text-cyber-red'
    }`;
    btnCallToggleCam.innerHTML = `<i data-lucide="${state.hasVideo ? 'video' : 'video-off'}" class="w-5 h-5"></i>`;
    notifyProfileUpdate();
  });

  // Compartir Pantalla
  btnCallShareScreen.addEventListener('click', async () => {
    try {
      if (!state.screenStream) {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = state.screenStream.getVideoTracks()[0];

        peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, state.screenStream);
          }
        });

        screenTrack.onended = () => {
          state.screenStream = null;
          btnCallShareScreen.classList.remove('bg-cyan-500/20', 'border-cyan-400');
          if (state.hasVideo) {
            initLocalStream(true);
          }
        };

        btnCallShareScreen.classList.add('bg-cyan-500/20', 'border-cyan-400');
      } else {
        state.screenStream.getTracks().forEach(t => t.stop());
        state.screenStream = null;
        btnCallShareScreen.classList.remove('bg-cyan-500/20', 'border-cyan-400');
      }
    } catch (err) {
      console.warn('Pantalla compartida cancelada:', err);
    }
  });

  // Salir de la sala
  btnCallLeave.addEventListener('click', () => {
    if (confirm('¿Deseas salir de la llamada?')) {
      window.location.reload();
    }
  });

  // Socket connection status
  socket.on('connect', () => {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green';
    connText.textContent = state.isJoined ? 'En Sala: ' + state.roomId : 'Listo para entrar';
  });

  socket.on('disconnect', () => {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-red';
    connText.textContent = 'Desconectado';
  });

})();
