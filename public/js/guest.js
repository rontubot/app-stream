/**
 * BirraVerde Multicam - Cliente de Invitado / Sala de Videollamada
 * Soporte WebRTC Mesh Ultra-Robusto + Audio Independiente + Iniciales Teams + Screen Share
 */

(function () {
  'use strict';

  // Configuración WebRTC con STUN y TURN (Relay para NAT simétrico y redes móviles)
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
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
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
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
    isHost: false,
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

  // Mapas de WebRTC
  const peerConnections = new Map();       // peerId -> RTCPeerConnection
  const remoteStreams = new Map();         // peerId -> MediaStream
  const knownPeers = new Map();            // peerId -> peerData
  const pendingIceCandidates = new Map();  // peerId -> Array<candidate>

  // Socket
  const socket = io();

  // Elementos DOM
  const lobbyView = document.getElementById('lobby-view');
  const callView = document.getElementById('call-view');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const audioUnlockBanner = document.getElementById('audio-unlock-banner');
  const remoteAudiosContainer = document.getElementById('remote-audios-container');

  // Lobby Inputs
  const inputName = document.getElementById('input-guest-name');
  const inputAvatarFile = document.getElementById('input-guest-avatar-file');
  const btnRemoveAvatar = document.getElementById('btn-remove-avatar');
  const avatarFilename = document.getElementById('avatar-filename');
  const selectVideoDevice = document.getElementById('select-video-device');
  const selectAudioDevice = document.getElementById('select-audio-device');
  const checkIsHost = document.getElementById('check-is-host');
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

  // Desbloqueo de Audio por clic en el banner
  if (audioUnlockBanner) {
    audioUnlockBanner.addEventListener('click', () => {
      unlockAllAudio();
      audioUnlockBanner.classList.add('hidden');
    });
  }

  function unlockAllAudio() {
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    remoteAudioAnalysers.forEach(item => {
      if (item.context && item.context.state === 'suspended') {
        item.context.resume().catch(e => console.warn(e));
      }
    });
    if (remoteAudiosContainer) {
      Array.from(remoteAudiosContainer.children).forEach(audio => {
        audio.play().catch(e => console.warn('Retry play error:', e));
      });
    }
  }

  // URL Params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('room')) state.roomId = urlParams.get('room');
  if (urlParams.get('name')) inputName.value = urlParams.get('name');

  // Detectar y configurar Anfitrión (Host)
  if (urlParams.get('host') === 'true' || urlParams.get('host') === '1' || localStorage.getItem('birra_multicam_is_host') === 'true') {
    state.isHost = true;
    if (checkIsHost) checkIsHost.checked = true;
  }
  if (checkIsHost) {
    checkIsHost.addEventListener('change', () => {
      state.isHost = checkIsHost.checked;
      localStorage.setItem('birra_multicam_is_host', state.isHost ? 'true' : 'false');
      if (state.isJoined) notifyProfileUpdate(true);
    });
  }

  // Cargar perfil guardado
  const savedName = localStorage.getItem('birra_multicam_name');
  if (savedName && !inputName.value) inputName.value = savedName;

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

  // Listar dispositivos
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
      console.warn('No se pudieron listar dispositivos:', err);
    }
  }

  // Crear pista dummy de video para que el SDP siempre tenga video preparado
  function createSilentVideoTrack() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#070a0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(5);
    const track = stream.getVideoTracks()[0];
    track.enabled = false;
    return track;
  }

  // Iniciar stream local
  async function initLocalStream(requestVideo = false) {
    try {
      // Intentar pedir audio y video si se solicitó video con cancelación de eco activa
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(state.selectedAudioId ? { deviceId: { exact: state.selectedAudioId } } : {})
        },
        video: requestVideo ? (state.selectedVideoId ? { deviceId: { exact: state.selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }) : false
      };

      if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
      }

      state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      state.hasVideo = requestVideo;
      state.hasAudio = true;

      // Si no se pidió video, agregar pista dummy para que las conexiones WebRTC iniciales ya contemplen video
      if (!requestVideo || state.localStream.getVideoTracks().length === 0) {
        const dummyTrack = createSilentVideoTrack();
        state.localStream.addTrack(dummyTrack);
      }

      await enumerateDevices();

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

      setupAudioMeter(state.localStream);
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.warn('getUserMedia falló, intentando solo audio:', err);
      try {
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        state.localStream.addTrack(createSilentVideoTrack());
        state.hasVideo = false;
        state.hasAudio = true;
        setupAudioMeter(state.localStream);
      } catch (err2) {
        console.error('Sin acceso a micrófono ni cámara:', err2);
      }
    }
  }

  initLocalStream(false);

  // Vúmetro de audio
  function setupAudioMeter(stream) {
    try {
      if (state.audioContext) state.audioContext.close();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      state.audioContext = new AudioCtx();
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
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        const percent = Math.min(100, Math.round((avg / 80) * 100));

        if (micLevelBar) micLevelBar.style.width = percent + '%';
        if (micTestStatus) {
          if (percent > 18) {
            micTestStatus.textContent = 'Detectando voz';
            micTestStatus.className = 'text-cyber-green font-bold';
          } else {
            micTestStatus.textContent = 'Silencio';
            micTestStatus.className = 'text-gray-400';
          }
        }

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

  // Previsualización de Iniciales Teams
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
      if (state.isJoined) notifyProfileUpdate();
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
    if (state.isJoined) notifyProfileUpdate();
  });

  btnToggleCamLobby.addEventListener('click', async () => {
    const newVideoState = !state.hasVideo;
    await initLocalStream(newVideoState);
  });

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

  selectVideoDevice.addEventListener('change', async () => {
    state.selectedVideoId = selectVideoDevice.value;
    if (state.hasVideo) await initLocalStream(true);
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

    unlockAllAudio();

    joinMulticamRoom();
  });

  function joinMulticamRoom() {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green animate-pulse';
    connText.textContent = 'En sala: ' + state.roomId;

    socket.emit('multicam-join', {
      roomId: state.roomId,
      peerId: state.peerId,
      role: state.isHost ? 'host' : 'guest',
      userInfo: {
        name: state.name,
        photo: state.photo,
        initials: state.initials,
        hasVideo: state.hasVideo,
        hasAudio: state.hasAudio,
        isHost: state.isHost
      }
    }, (res) => {
      if (res && res.success) {
        state.isJoined = true;
        lobbyView.classList.add('hidden');
        callView.classList.remove('hidden');

        renderLocalParticipant();

        if (Array.isArray(res.peers)) {
          res.peers.forEach(peer => {
            if (peer.id !== state.peerId) {
              knownPeers.set(peer.id, peer);
              // Determinar si soy el iniciador hacia este peer
              const isInitiator = shouldInitiate(peer.id, peer.role);
              createPeerConnection(peer.id, isInitiator);
            }
          });
          updateParticipantsCount();
        }
      }
    });
  }

  function notifyProfileUpdate(explicitHostChange = false) {
    const userInfo = {
      name: state.name,
      photo: state.photo,
      initials: state.initials,
      hasVideo: state.hasVideo,
      hasAudio: state.hasAudio
    };
    if (explicitHostChange) {
      userInfo.isHost = state.isHost;
      userInfo.explicitHostChange = true;
    }
    socket.emit('multicam-update-profile', {
      roomId: state.roomId,
      userInfo
    });
    renderLocalParticipant();
  }

  // ============================================================
  // WEBRTC SIGNALING Y CONEXIONES MESH
  // ============================================================

  // Regla Determinista de Iniciador (Evita Colisión / Glare)
  function shouldInitiate(remotePeerId, remoteRole) {
    // Siempre iniciar oferta hacia el overlay de OBS
    if (remoteRole === 'overlay') return true;
    // Entre invitados, el peer con ID alfabéticamente mayor crea el offer
    return state.peerId > remotePeerId;
  }

  function createPeerConnection(remotePeerId, isInitiator = false) {
    if (peerConnections.has(remotePeerId)) {
      return peerConnections.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.set(remotePeerId, pc);

    // Añadir tracks locales (audio y video/dummy)
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => {
        pc.addTrack(track, state.localStream);
      });
    }
    syncGuestMasterMuteState();

    // ICE Candidates locales
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

    // Tracks remotos entrantes
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreams.set(remotePeerId, stream);

      // Conectar audio remoto independiente (vital para que suene siempre)
      attachRemoteAudio(remotePeerId, stream);

      // Activar detector de voz para halo brillante en la llamada
      if (event.track && event.track.kind === 'audio') {
        setupRemoteSpeakingDetector(remotePeerId, new MediaStream([event.track]));
      } else {
        setupRemoteSpeakingDetector(remotePeerId, stream);
      }

      renderRemoteParticipant(remotePeerId, stream);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remotePeerId} state:`, pc.connectionState);
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
        .catch(err => console.error('Error creando offer hacia', remotePeerId, err));
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

        // Vaciar cola de candidatos ICE pendientes
        await flushPendingIceCandidates(fromPeerId, pc);

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

        // Vaciar candidatos pendientes
        await flushPendingIceCandidates(fromPeerId, pc);
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('Error agregando candidate:', e);
          }
        } else {
          // Encolar candidato para cuando remoteDescription esté listo
          if (!pendingIceCandidates.has(fromPeerId)) {
            pendingIceCandidates.set(fromPeerId, []);
          }
          pendingIceCandidates.get(fromPeerId).push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('Error procesando señal WebRTC de', fromPeerId, err);
    }
  });

  async function flushPendingIceCandidates(fromPeerId, pc) {
    const list = pendingIceCandidates.get(fromPeerId) || [];
    for (const cand of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Error vaciando candidato encolado:', e);
      }
    }
    pendingIceCandidates.delete(fromPeerId);
  }

  // Sincronización directa cuando el Panel de Host asigna o retira el rol de Host a este participante
  socket.on('multicam-host-status-changed', ({ isHost }) => {
    if (typeof isHost === 'boolean') {
      state.isHost = isHost;
      if (checkIsHost) checkIsHost.checked = isHost;
      localStorage.setItem('birra_multicam_is_host', isHost ? 'true' : 'false');
      syncGuestMasterMuteState();
      renderLocalParticipant();
    }
  });

  // Lista de peers actualizada desde el servidor
  socket.on('multicam-peers-updated', ({ peers }) => {
    if (!Array.isArray(peers)) return;

    peers.forEach(peer => {
      if (peer.id === state.peerId) {
        // Sincronizar nuestro propio rol de Host si fue modificado desde el Panel de Administración
        const serverIsHost = !!(peer.isHost || peer.role === 'host');
        if (state.isHost !== serverIsHost) {
          state.isHost = serverIsHost;
          if (checkIsHost) checkIsHost.checked = serverIsHost;
          localStorage.setItem('birra_multicam_is_host', serverIsHost ? 'true' : 'false');
          syncGuestMasterMuteState();
          renderLocalParticipant();
        }
      } else {
        const isNew = !knownPeers.has(peer.id);
        knownPeers.set(peer.id, peer);

        if (isNew && state.isJoined) {
          const isInitiator = shouldInitiate(peer.id, peer.role);
          createPeerConnection(peer.id, isInitiator);
        } else {
          renderRemoteParticipant(peer.id, remoteStreams.get(peer.id));
        }
      }
    });

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

  socket.on('multicam-force-mute', () => {
    state.hasAudio = false;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(t => t.enabled = false);
    }
    btnCallToggleMic.className = 'w-11 h-11 rounded-xl border flex items-center justify-center transition-all shadow-md bg-cyber-red/20 border-cyber-red text-cyber-red';
    btnCallToggleMic.innerHTML = '<i data-lucide="mic-off" class="w-5 h-5"></i>';
    if (window.lucide) lucide.createIcons();
    notifyProfileUpdate();
    alert('🔇 El anfitrión ha silenciado tu micrófono.');
  });

  socket.on('multicam-banned', ({ reason }) => {
    document.body.innerHTML = `
      <div style="min-height: 100vh; background: #05070a; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: 'Rajdhani', sans-serif; color: #fff; text-align: center;">
        <div style="max-width: 480px; background: rgba(20, 10, 15, 0.95); border: 2px solid #ef4444; border-radius: 16px; padding: 32px; box-shadow: 0 0 35px rgba(239, 68, 68, 0.4);">
          <div style="font-size: 50px; margin-bottom: 12px;">🚫</div>
          <h2 style="font-size: 26px; font-weight: 800; color: #f87171; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">ACCESO BLOQUEADO</h2>
          <p style="font-size: 14px; color: #d1d5db; line-height: 1.6; margin-bottom: 20px;">${reason || 'Has sido bloqueado por IP de esta sala por el anfitrión.'}</p>
          <div style="padding: 10px 16px; background: #000; border-radius: 8px; border: 1px solid #333; font-family: monospace; font-size: 12px; color: #9ca3af;">
            IP registrada en lista de exclusión
          </div>
        </div>
      </div>
    `;
  });

  function cleanupPeer(peerId) {
    if (peerConnections.has(peerId)) {
      peerConnections.get(peerId).close();
      peerConnections.delete(peerId);
    }
    remoteStreams.delete(peerId);
    knownPeers.delete(peerId);
    pendingIceCandidates.delete(peerId);

    if (remoteAudioAnalysers.has(peerId)) {
      try {
        remoteAudioAnalysers.get(peerId).context.close();
      } catch (e) {}
      remoteAudioAnalysers.delete(peerId);
    }

    const card = document.getElementById('card-peer-' + peerId);
    if (card) card.remove();

    const audioElem = document.getElementById('remote-audio-' + peerId);
    if (audioElem) audioElem.remove();
  }

  function updateParticipantsCount() {
    const total = 1 + Array.from(knownPeers.values()).filter(p => p.role !== 'overlay').length;
    participantsCountBadge.textContent = `${total} ${total === 1 ? 'participante' : 'participantes'}`;
  }

  // ============================================================
  // DETECTOR DE VOZ REMOTO (HALO BRILLANTE EN /GUEST)
  // ============================================================
  const remoteAudioAnalysers = new Map();

  function setupRemoteSpeakingDetector(peerId, stream) {
    if (remoteAudioAnalysers.has(peerId)) {
      const current = remoteAudioAnalysers.get(peerId);
      if (current.hasAudioTrack) return;
      if (stream.getAudioTracks().length === 0) return;
      try { current.context.close(); } catch (e) {}
      remoteAudioAnalysers.delete(peerId);
    }
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      remoteAudioAnalysers.set(peerId, { context: audioContext, analyser, source, hasAudioTrack: true });

      function checkSpeaking() {
        if (!remoteAudioAnalysers.has(peerId)) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;

        const peerData = knownPeers.get(peerId);
        const hasAudio = peerData ? peerData.hasAudio !== false : true;
        const isSpeaking = avg > 14 && hasAudio;

        const card = document.getElementById('card-peer-' + peerId);
        if (card) {
          if (isSpeaking) {
            card.classList.add('speaking-glow');
          } else {
            card.classList.remove('speaking-glow');
          }
        }
        requestAnimationFrame(checkSpeaking);
      }
      requestAnimationFrame(checkSpeaking);
    } catch (e) {
      console.warn('Error en detector de voz para peer remoto:', peerId, e);
    }
  }

  // ============================================================
  // AUDIO REMOTO INDEPENDIENTE Y SINCRONIZACIÓN DE MUTE MAESTRO
  // ============================================================
  let isMasterMuted = false;

  function syncGuestMasterMuteState() {
    // 1. Si el Mute Maestro está activo O este participante es el Host (Anfitrión), cortar el envío de su micrófono hacia los overlays de OBS (obs-*) para evitar eco al 100%
    const audioTrack = state.localStream ? state.localStream.getAudioTracks()[0] : null;
    const shouldSilenceToObs = !!(isMasterMuted || state.isHost);
    peerConnections.forEach((pc, remotePeerId) => {
      const peer = knownPeers.get(remotePeerId);
      const isOverlayPeer = (peer && peer.role === 'overlay') || String(remotePeerId).startsWith('obs-');
      if (isOverlayPeer) {
        try {
          const audioTransceiver = pc.getTransceivers ? pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') : null;
          const sender = audioTransceiver ? audioTransceiver.sender : pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) {
            if (shouldSilenceToObs) {
              sender.replaceTrack(null).catch(() => {});
            } else if (audioTrack) {
              audioTrack.enabled = !!state.hasAudio;
              sender.replaceTrack(audioTrack).catch(() => {});
            }
          }
        } catch (e) {}
      }
    });

    // 2. Silenciar o reactivar la reproducción de audio en la pestaña /guest (por si OBS captura Audio del Escritorio)
    remoteStreams.forEach((stream, peerId) => {
      try {
        stream.getAudioTracks().forEach(track => {
          track.enabled = !isMasterMuted;
        });
      } catch (e) {}

      const audioElem = document.getElementById('remote-audio-' + peerId);
      if (audioElem) {
        audioElem.muted = isMasterMuted;
        audioElem.volume = isMasterMuted ? 0 : 1;
        if (isMasterMuted) {
          try { audioElem.pause(); } catch (e) {}
        } else {
          const audioTracks = stream.getAudioTracks();
          if (!audioElem.srcObject && audioTracks.length > 0) {
            audioElem.srcObject = new MediaStream(audioTracks);
          }
          audioElem.play().catch(() => {});
        }
      }
    });

    if (remoteAudiosContainer) {
      Array.from(remoteAudiosContainer.querySelectorAll('audio')).forEach(audioElem => {
        audioElem.muted = isMasterMuted;
        audioElem.volume = isMasterMuted ? 0 : 1;
        if (isMasterMuted) {
          try { audioElem.pause(); } catch (e) {}
        } else {
          audioElem.play().catch(() => {});
        }
      });
    }
  }

  socket.on('master-mute-changed', (data) => {
    if (data && typeof data.muted === 'boolean') {
      isMasterMuted = data.muted;
      syncGuestMasterMuteState();
    }
  });

  socket.on('state-update', (liveState) => {
    if (liveState && typeof liveState.masterMuted === 'boolean') {
      isMasterMuted = liveState.masterMuted;
      syncGuestMasterMuteState();
    }
  });

  socket.on('multicam-settings-updated', (settings) => {
    if (settings && typeof settings.audioMutedOverall === 'boolean') {
      isMasterMuted = settings.audioMutedOverall;
      syncGuestMasterMuteState();
    }
  });

  function attachRemoteAudio(peerId, stream) {
    if (!remoteAudiosContainer) return;
    if (stream.getAudioTracks().length === 0) return;

    let audioElem = document.getElementById('remote-audio-' + peerId);
    if (!audioElem) {
      audioElem = document.createElement('audio');
      audioElem.id = 'remote-audio-' + peerId;
      audioElem.autoplay = true;
      audioElem.playsInline = true;
      remoteAudiosContainer.appendChild(audioElem);
    }
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach(t => { t.enabled = !isMasterMuted; });
    audioElem.srcObject = audioTracks.length > 0 ? new MediaStream(audioTracks) : stream;
    audioElem.muted = isMasterMuted;
    audioElem.volume = isMasterMuted ? 0 : 1;
    if (isMasterMuted) {
      try { audioElem.pause(); } catch (e) {}
      return;
    }
    audioElem.play().catch(err => {
      console.warn('Autoplay bloqueado para audio remoto, mostrando banner:', err);
      if (audioUnlockBanner) audioUnlockBanner.classList.remove('hidden');
    });
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
          ${state.isHost ? '<span class="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/50 text-[10px] font-mono">👑 HOST</span>' : ''}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-7 h-7 rounded-lg bg-black/80 backdrop-blur border border-cyber-border flex items-center justify-center text-xs">
            <i data-lucide="${state.hasAudio ? 'mic' : 'mic-off'}" class="w-3.5 h-3.5 ${state.hasAudio ? 'text-cyber-green' : 'text-cyber-red'}"></i>
          </span>
        </div>
      </div>
    `;

    const vElem = card.querySelector('#call-local-video');
    if (vElem) {
      vElem.muted = true;
      vElem.defaultMuted = true;
      vElem.volume = 0;
      if (state.localStream) {
        const videoTracks = state.localStream.getVideoTracks();
        vElem.srcObject = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderRemoteParticipant(peerId, stream) {
    const peerData = knownPeers.get(peerId);
    if (!peerData || peerData.role === 'overlay') return;

    let card = document.getElementById('card-peer-' + peerId);
    if (!card) {
      card = document.createElement('div');
      card.id = 'card-peer-' + peerId;
      card.className = 'relative aspect-video bg-cyber-dark border-2 border-cyber-border rounded-2xl overflow-hidden shadow-xl flex items-center justify-center transition-all';
      participantsGrid.appendChild(card);
    }

    const hasVideo = peerData.hasVideo && stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
    const gradient = getGradientForName(peerData.name);

    card.innerHTML = `
      <video id="call-video-${peerId}" autoplay playsinline muted class="w-full h-full object-cover ${hasVideo ? '' : 'hidden'}"></video>
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
    if (vElem) {
      vElem.muted = true;
      vElem.defaultMuted = true;
      vElem.volume = 0;
      if (hasVideo && stream) {
        const videoTracks = stream.getVideoTracks();
        vElem.srcObject = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
        vElem.play().catch(e => console.warn('Video play retry:', e));
      } else {
        vElem.srcObject = null;
      }
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
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: state.selectedVideoId ? { deviceId: { exact: state.selectedVideoId } } : true
        });
        const realVideoTrack = vStream.getVideoTracks()[0];

        // Reemplazar pista en todas las conexiones WebRTC
        peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(realVideoTrack);
          } else {
            pc.addTrack(realVideoTrack, state.localStream);
          }
        });

        // Actualizar localStream
        state.localStream.getVideoTracks().forEach(t => t.stop());
        state.localStream.removeTrack(state.localStream.getVideoTracks()[0]);
        state.localStream.addTrack(realVideoTrack);
      } catch (e) {
        console.error('Error activando video real:', e);
        state.hasVideo = false;
      }
    } else {
      // Poner video dummy silencioso
      const dummyTrack = createSilentVideoTrack();
      peerConnections.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(dummyTrack);
      });
      state.localStream.getVideoTracks().forEach(t => t.stop());
      state.localStream.removeTrack(state.localStream.getVideoTracks()[0]);
      state.localStream.addTrack(dummyTrack);
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
          if (sender) sender.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => {
          state.screenStream = null;
          btnCallShareScreen.classList.remove('bg-cyan-500/20', 'border-cyan-400');
          if (state.hasVideo) {
            btnCallToggleCam.click();
            btnCallToggleCam.click();
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

  btnCallLeave.addEventListener('click', () => {
    if (confirm('¿Deseas salir de la llamada?')) {
      window.location.reload();
    }
  });

  socket.on('connect', () => {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-green';
    connText.textContent = state.isJoined ? 'En Sala: ' + state.roomId : 'Listo para entrar';
    if (state.isJoined) {
      joinMulticamRoom();
    }
  });

  socket.on('disconnect', () => {
    connDot.className = 'w-2.5 h-2.5 rounded-full bg-cyber-red';
    connText.textContent = 'Desconectado';
  });

})();
