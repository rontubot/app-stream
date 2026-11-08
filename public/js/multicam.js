/**
 * BirraVerde OBS Multicam Overlay Engine
 * WebRTC Receiver + Dynamic Grid/PIP Scenes + Teams Initials + Audio Speaking Detection
 */

(function () {
  'use strict';

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

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

  // Estado del overlay
  const overlayPeerId = 'obs-multicam-' + Math.random().toString(36).substring(2, 7);
  const roomId = 'main';

  let currentSettings = {
    activeScene: 'pip-corner-tr',
    showLabels: true,
    audioMutedOverall: false
  };

  // Mapas
  const knownPeers = new Map();            // peerId -> peerData
  const peerConnections = new Map();       // peerId -> RTCPeerConnection
  const remoteStreams = new Map();         // peerId -> MediaStream
  const audioAnalysers = new Map();        // peerId -> { context, analyser, source }
  const pendingIceCandidates = new Map();   // peerId -> Array<candidate>

  // Elementos DOM
  const stage = document.getElementById('multicam-stage');
  const camsContainer = document.getElementById('cams-container');
  const audioContainer = document.getElementById('audio-container');

  // Socket
  const socket = io();

  socket.on('connect', () => {
    console.log('[OBS Multicam] Conectado al socket como Overlay:', socket.id);

    // Unirse a la sala como overlay (receptor puro)
    socket.emit('multicam-join', {
      roomId,
      peerId: overlayPeerId,
      role: 'overlay',
      userInfo: {
        name: 'OBS Overlay',
        hasVideo: false,
        hasAudio: false
      }
    }, (res) => {
      if (res && res.settings) {
        applySettings(res.settings);
      }
      if (res && Array.isArray(res.peers)) {
        res.peers.forEach(peer => {
          if (peer.role !== 'overlay' && peer.id !== overlayPeerId) {
            knownPeers.set(peer.id, peer);
            preparePeerConnection(peer.id);
          }
        });
        renderAllCams();
      }
    });
  });

  socket.on('multicam-settings-updated', (settings) => {
    applySettings(settings);
  });

  function applySettings(settings) {
    if (!settings) return;
    currentSettings = { ...currentSettings, ...settings };
    stage.className = 'scene-' + (currentSettings.activeScene || 'pip-corner-tr');
  }

  socket.on('multicam-peers-updated', ({ peers }) => {
    if (!Array.isArray(peers)) return;

    const incomingIds = new Set();

    peers.forEach(peer => {
      if (peer.role !== 'overlay' && peer.id !== overlayPeerId) {
        incomingIds.add(peer.id);
        const existing = knownPeers.get(peer.id);
        knownPeers.set(peer.id, peer);

        if (!existing) {
          preparePeerConnection(peer.id);
        }
      }
    });

    knownPeers.forEach((p, id) => {
      if (!incomingIds.has(id)) {
        cleanupPeer(id);
      }
    });

    renderAllCams();
  });

  socket.on('multicam-peer-left', ({ peerId }) => {
    cleanupPeer(peerId);
    renderAllCams();
  });

  // ============================================================
  // WEBRTC SIGNALING (Receptor)
  // ============================================================
  function preparePeerConnection(remotePeerId) {
    if (peerConnections.has(remotePeerId)) {
      return peerConnections.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.set(remotePeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('multicam-signal', {
          toPeerId: remotePeerId,
          fromPeerId: overlayPeerId,
          roomId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreams.set(remotePeerId, stream);

      attachAudioTrack(remotePeerId, stream);
      setupSpeakingDetector(remotePeerId, stream);
      renderAllCams();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[OBS Multicam] Conexión con ${remotePeerId}:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(remotePeerId);
        renderAllCams();
      }
    };

    return pc;
  }

  // Señales entrantes de los participantes (Offers, ICE Candidates)
  socket.on('multicam-signal', async ({ fromPeerId, signal }) => {
    let pc = peerConnections.get(fromPeerId);
    if (!pc) {
      pc = preparePeerConnection(fromPeerId);
    }

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Vaciar candidatos pendientes
        const pending = pendingIceCandidates.get(fromPeerId) || [];
        for (const cand of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        pendingIceCandidates.delete(fromPeerId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('multicam-signal', {
          toPeerId: fromPeerId,
          fromPeerId: overlayPeerId,
          roomId,
          signal: { type: 'answer', sdp: pc.localDescription }
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const pending = pendingIceCandidates.get(fromPeerId) || [];
        for (const cand of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        pendingIceCandidates.delete(fromPeerId);
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[OBS Multicam] Error agregando candidato:', e);
          }
        } else {
          if (!pendingIceCandidates.has(fromPeerId)) pendingIceCandidates.set(fromPeerId, []);
          pendingIceCandidates.get(fromPeerId).push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('[OBS Multicam] Error procesando señal WebRTC:', err);
    }
  });

  function cleanupPeer(peerId) {
    if (peerConnections.has(peerId)) {
      peerConnections.get(peerId).close();
      peerConnections.delete(peerId);
    }
    remoteStreams.delete(peerId);
    knownPeers.delete(peerId);
    pendingIceCandidates.delete(peerId);

    if (audioAnalysers.has(peerId)) {
      try {
        audioAnalysers.get(peerId).context.close();
      } catch (e) {}
      audioAnalysers.delete(peerId);
    }

    const audioElem = document.getElementById('audio-' + peerId);
    if (audioElem) audioElem.remove();

    const card = document.getElementById('cam-card-' + peerId);
    if (card) card.remove();
  }

  // ============================================================
  // AUDIO EN OBS
  // ============================================================
  function attachAudioTrack(peerId, stream) {
    if (!audioContainer) return;
    if (stream.getAudioTracks().length === 0) return;

    let audioElem = document.getElementById('audio-' + peerId);
    if (!audioElem) {
      audioElem = document.createElement('audio');
      audioElem.id = 'audio-' + peerId;
      audioElem.autoplay = true;
      audioElem.playsInline = true;
      audioContainer.appendChild(audioElem);
    }
    audioElem.srcObject = stream;
    audioElem.muted = !!currentSettings.audioMutedOverall;
    audioElem.play().catch(e => console.warn('[OBS Multicam] Audio play error:', e));
  }

  function setupSpeakingDetector(peerId, stream) {
    if (audioAnalysers.has(peerId) || stream.getAudioTracks().length === 0) return;

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

      audioAnalysers.set(peerId, { context: audioContext, analyser, source });

      function checkSpeaking() {
        if (!audioAnalysers.has(peerId)) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        const isSpeaking = avg > 15;

        const card = document.getElementById('cam-card-' + peerId);
        if (card) {
          if (isSpeaking) {
            card.classList.add('is-speaking');
          } else {
            card.classList.remove('is-speaking');
          }
        }

        requestAnimationFrame(checkSpeaking);
      }

      checkSpeaking();
    } catch (e) {
      console.warn('[OBS Multicam] AudioContext error para peer:', peerId, e);
    }
  }

  // ============================================================
  // RENDERIZADO VISUAL
  // ============================================================
  function renderAllCams() {
    const visiblePeers = Array.from(knownPeers.values())
      .filter(peer => !peer.isHidden)
      .sort((a, b) => {
        if (a.slot !== null && b.slot !== null) return a.slot - b.slot;
        if (a.slot !== null) return -1;
        if (b.slot !== null) return 1;
        return a.joinedAt - b.joinedAt;
      });

    stage.setAttribute('data-count', visiblePeers.length);

    const visibleIds = new Set(visiblePeers.map(p => p.id));

    Array.from(camsContainer.children).forEach(child => {
      const pId = child.getAttribute('data-peer-id');
      if (pId && !visibleIds.has(pId)) {
        child.remove();
      }
    });

    visiblePeers.forEach(peer => {
      renderCamCard(peer);
    });
  }

  function renderCamCard(peer) {
    let card = document.getElementById('cam-card-' + peer.id);
    const stream = remoteStreams.get(peer.id);
    const hasActiveVideo = peer.hasVideo && stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');

    if (!card) {
      card = document.createElement('div');
      card.id = 'cam-card-' + peer.id;
      card.className = 'cam-card';
      card.setAttribute('data-peer-id', peer.id);
      camsContainer.appendChild(card);
    }

    const gradient = getGradientForName(peer.name);
    const initials = peer.initials || 'BV';

    card.innerHTML = `
      <video id="video-${peer.id}" autoplay playsinline class="cam-video ${hasActiveVideo ? '' : 'hidden'}"></video>

      <div id="avatar-box-${peer.id}" class="cam-avatar-box ${hasActiveVideo ? 'hidden' : ''}">
        <div class="cam-avatar-circle" style="background: ${peer.photo ? 'none' : gradient}">
          ${peer.photo ? `<img src="${peer.photo}" class="cam-avatar-img" alt="${peer.name}">` : `<span>${initials}</span>`}
        </div>
      </div>

      <div class="cam-lower-third">
        <span class="cam-status-dot ${hasActiveVideo ? '' : 'no-video'}"></span>
        <span class="cam-name-text">${peer.name || 'Invitado'}</span>
        <svg class="cam-speaking-indicator" viewBox="0 0 24 24" fill="none" stroke="#00ff66" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        </svg>
      </div>
    `;

    if (hasActiveVideo) {
      const vElem = card.querySelector('#video-' + peer.id);
      if (vElem && stream) {
        vElem.srcObject = stream;
        vElem.play().catch(e => console.warn('[OBS Multicam] Video play retry:', e));
      }
    }
  }

})();
