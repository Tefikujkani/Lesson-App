import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiUrl } from "../lib/api.ts";

const FALLBACK_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

type PeerSlot = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  iceQueue: RTCIceCandidateInit[];
  webrtcLive: boolean;
};

/**
 * Mesh WebRTC voice + Socket.IO PCM fallback so friends behind NAT still hear each other
 * even when public TURN is unavailable.
 */
export function useVoiceMesh(socket: Socket | null, enabled: boolean) {
  const [micOn, setMicOn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voicePeerIds, setVoicePeerIds] = useState<string[]>([]);
  const [forceMuted, setForceMuted] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerSlot>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peerVolumesRef = useRef<Record<string, number>>({});
  const micOnRef = useRef(false);
  const forceMutedRef = useRef(false);
  const socketRef = useRef(socket);
  const joiningVoiceRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const pendingOffersRef = useRef<
    Array<{ fromSocketId: string; sdp: RTCSessionDescriptionInit }>
  >([]);
  const sendOfferRef = useRef<(remoteId: string) => void>(() => undefined);
  const pendingOfferHandlerRef = useRef<
    ((offer: { fromSocketId: string; sdp: RTCSessionDescriptionInit }) => Promise<void>) | null
  >(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmNextTimeRef = useRef<Record<string, number>>({});
  const pcmGainsRef = useRef<Map<string, GainNode>>(new Map());
  socketRef.current = socket;

  const cleanupPeer = useCallback((remoteId: string) => {
    const slot = peersRef.current.get(remoteId);
    if (slot) {
      slot.pc.onicecandidate = null;
      slot.pc.ontrack = null;
      slot.pc.onnegotiationneeded = null;
      try {
        slot.pc.close();
      } catch {
        /* ignore */
      }
      peersRef.current.delete(remoteId);
    }
    const audio = audioElsRef.current.get(remoteId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      audioElsRef.current.delete(remoteId);
    }
    pcmGainsRef.current.get(remoteId)?.disconnect();
    pcmGainsRef.current.delete(remoteId);
    delete pcmNextTimeRef.current[remoteId];
  }, []);

  const stopPcmCapture = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => undefined);
      captureCtxRef.current = null;
    }
  }, []);

  const cleanupAll = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) cleanupPeer(id);
    stopPcmCapture();
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close().catch(() => undefined);
      playbackCtxRef.current = null;
    }
    pcmGainsRef.current.clear();
    pcmNextTimeRef.current = {};
    pendingOffersRef.current = [];
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      localStreamRef.current = null;
    }
  }, [cleanupPeer, stopPcmCapture]);

  const ensureAudioEl = (remoteId: string, stream: MediaStream) => {
    let audio = audioElsRef.current.get(remoteId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      (audio as HTMLMediaElement & { playsInline?: boolean }).playsInline = true;
      audio.controls = false;
      audio.muted = false;
      const vol =
        typeof peerVolumesRef.current[remoteId] === "number"
          ? peerVolumesRef.current[remoteId]
          : 1;
      audio.volume = Math.min(1, Math.max(0, vol));
      audio.style.cssText =
        "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0;z-index:-1;";
      document.body.appendChild(audio);
      audioElsRef.current.set(remoteId, audio);
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    audio.muted = false;
    const vol =
      typeof peerVolumesRef.current[remoteId] === "number"
        ? peerVolumesRef.current[remoteId]
        : 1;
    audio.volume = Math.min(1, Math.max(0, vol));
    void audio.play().catch(() => undefined);
  };

  const flushIce = async (remoteId: string) => {
    const slot = peersRef.current.get(remoteId);
    if (!slot?.pc.remoteDescription) return;
    const queued = slot.iceQueue.splice(0, slot.iceQueue.length);
    for (const c of queued) {
      try {
        await slot.pc.addIceCandidate(c);
      } catch {
        /* ignore stale */
      }
    }
  };

  const getOrCreatePeer = useCallback(
    (remoteId: string): PeerSlot | null => {
      const s = socketRef.current;
      const stream = localStreamRef.current;
      if (!s?.id || !stream || remoteId === s.id) return null;

      let slot = peersRef.current.get(remoteId);
      if (slot) return slot;

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 4,
      });
      slot = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        iceQueue: [],
        webrtcLive: false,
      };
      peersRef.current.set(remoteId, slot);

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          pc.addTransceiver(audioTrack, { direction: "sendrecv", streams: [stream] });
        } catch {
          pc.addTrack(audioTrack, stream);
        }
      }

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const payload =
          typeof ev.candidate.toJSON === "function"
            ? ev.candidate.toJSON()
            : {
                candidate: ev.candidate.candidate,
                sdpMid: ev.candidate.sdpMid,
                sdpMLineIndex: ev.candidate.sdpMLineIndex,
              };
        s.emit("webrtc:ice", { toSocketId: remoteId, candidate: payload });
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
        ensureAudioEl(remoteId, remoteStream);
        const live = peersRef.current.get(remoteId);
        if (live) live.webrtcLive = true;
      };

      pc.onnegotiationneeded = () => {
        void sendOfferRef.current(remoteId);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          const live = peersRef.current.get(remoteId);
          if (live) live.webrtcLive = true;
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          const live = peersRef.current.get(remoteId);
          if (live) live.webrtcLive = false;
          try {
            pc.restartIce();
          } catch {
            /* PCM fallback still carries audio */
          }
        }
        if (pc.connectionState === "closed") cleanupPeer(remoteId);
      };

      return slot;
    },
    [cleanupPeer]
  );

  const sendOffer = useCallback(async (remoteId: string) => {
    const s = socketRef.current;
    const slot = peersRef.current.get(remoteId);
    if (!s || !slot) return;
    if (slot.makingOffer || slot.pc.signalingState !== "stable") return;
    try {
      slot.makingOffer = true;
      const offer = await slot.pc.createOffer();
      await slot.pc.setLocalDescription(offer);
      s.emit("webrtc:offer", { toSocketId: remoteId, sdp: slot.pc.localDescription });
    } catch (err) {
      console.error("Offer failed", err);
    } finally {
      slot.makingOffer = false;
    }
  }, []);
  sendOfferRef.current = sendOffer;

  const connectToPeer = useCallback(
    (remoteId: string) => {
      if (!micOnRef.current || !localStreamRef.current || !socketRef.current?.id) return;
      const slot = getOrCreatePeer(remoteId);
      if (!slot) return;
      if (slot.pc.signalingState === "stable" && !slot.pc.remoteDescription) {
        void sendOffer(remoteId);
      }
    },
    [getOrCreatePeer, sendOffer]
  );

  const emitVoiceJoin = useCallback(
    (s: Socket) => {
      if (joiningVoiceRef.current) return;
      joiningVoiceRef.current = true;
      s.emit("room:mute", { muted: false });
      s.emit(
        "voice:join",
        {},
        (result: { ok?: boolean; peerIds?: string[]; error?: string }) => {
          joiningVoiceRef.current = false;
          if (result?.ok && Array.isArray(result.peerIds)) {
            setVoicePeerIds(result.peerIds);
            for (const id of result.peerIds) connectToPeer(id);
          } else if (result?.error) {
            setError(result.error);
          }
        }
      );
      setTimeout(() => {
        joiningVoiceRef.current = false;
      }, 2500);
    },
    [connectToPeer]
  );

  const pcmGainFor = (remoteId: string): GainNode | null => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return null;
    let gain = pcmGainsRef.current.get(remoteId);
    if (!gain) {
      gain = ctx.createGain();
      const vol =
        typeof peerVolumesRef.current[remoteId] === "number"
          ? peerVolumesRef.current[remoteId]
          : 1;
      gain.gain.value = vol;
      gain.connect(ctx.destination);
      pcmGainsRef.current.set(remoteId, gain);
    }
    return gain;
  };

  const toArrayBuffer = (raw: unknown): ArrayBuffer | null => {
    if (!raw) return null;
    if (raw instanceof ArrayBuffer) return raw;
    if (ArrayBuffer.isView(raw)) {
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    }
    if (typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return new Uint8Array((raw as { data: number[] }).data).buffer;
    }
    return null;
  };

  const playPcmChunk = (remoteId: string, raw: unknown) => {
    if (!micOnRef.current) return;
    const slot = peersRef.current.get(remoteId);
    if (slot?.webrtcLive) return;
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    const srcBytes = toArrayBuffer(raw);
    if (!srcBytes || srcBytes.byteLength < 2) return;
    const copy = new Uint8Array(srcBytes.byteLength - (srcBytes.byteLength % 2));
    copy.set(new Uint8Array(srcBytes, 0, copy.byteLength));
    const samples = new Int16Array(copy.buffer);
    if (!samples.length) return;
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      floats[i] = samples[i] / 0x8000;
    }
    const audioBuf = ctx.createBuffer(1, floats.length, 16000);
    audioBuf.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    const gain = pcmGainFor(remoteId);
    if (!gain) return;
    src.connect(gain);
    const now = ctx.currentTime;
    const next = pcmNextTimeRef.current[remoteId] || now;
    const startAt = next < now - 0.25 ? now : Math.max(now, next);
    try {
      src.start(startAt);
    } catch {
      return;
    }
    pcmNextTimeRef.current[remoteId] = startAt + audioBuf.duration;
  };

  const startPcmCapture = async (stream: MediaStream) => {
    stopPcmCapture();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    captureCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);
    const step = Math.max(1, Math.round(ctx.sampleRate / 16000));
    processor.onaudioprocess = (ev) => {
      if (!micOnRef.current || forceMutedRef.current) return;
      const s = socketRef.current;
      if (!s?.connected) return;
      const input = ev.inputBuffer.getChannelData(0);
      const out = new Int16Array(Math.floor(input.length / step));
      let peak = 0;
      for (let i = 0, j = 0; j < out.length; i += step, j++) {
        const v = Math.max(-1, Math.min(1, input[i] || 0));
        peak = Math.max(peak, Math.abs(v));
        out[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      if (peak < 0.004) return;
      s.volatile.emit("voice:pcm", out.buffer);
    };
  };

  useEffect(() => {
    if (!socket || !enabled) return;

    let cancelled = false;

    if (micOnRef.current && localStreamRef.current) {
      for (const id of [...peersRef.current.keys()]) cleanupPeer(id);
      setVoicePeerIds([]);
      queueMicrotask(() => {
        if (cancelled || !micOnRef.current || socketRef.current !== socket) return;
        emitVoiceJoin(socket);
      });
    }

    const onOffer = async ({
      fromSocketId,
      sdp,
    }: {
      fromSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (!micOnRef.current || !localStreamRef.current) {
        pendingOffersRef.current.push({ fromSocketId, sdp });
        return;
      }

      const slot = getOrCreatePeer(fromSocketId);
      if (!slot) return;
      const pc = slot.pc;
      const polite = (socket.id || "") > fromSocketId;

      try {
        const offerCollision = slot.makingOffer || pc.signalingState !== "stable";
        slot.ignoreOffer = !polite && offerCollision;
        if (slot.ignoreOffer) return;

        await pc.setRemoteDescription(sdp);
        await flushIce(fromSocketId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", {
          toSocketId: fromSocketId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("WebRTC offer handling failed", err);
      }
    };
    pendingOfferHandlerRef.current = onOffer;

    const onAnswer = async ({
      fromSocketId,
      sdp,
    }: {
      fromSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const slot = peersRef.current.get(fromSocketId);
      if (!slot) return;
      try {
        if (slot.pc.signalingState === "have-local-offer") {
          await slot.pc.setRemoteDescription(sdp);
          await flushIce(fromSocketId);
        }
      } catch (err) {
        console.error("WebRTC answer failed", err);
      }
    };

    const onIce = async ({
      fromSocketId,
      candidate,
    }: {
      fromSocketId: string;
      candidate: RTCIceCandidateInit | null;
    }) => {
      const slot = peersRef.current.get(fromSocketId) || getOrCreatePeer(fromSocketId);
      if (!slot || !candidate) return;
      if (!slot.pc.remoteDescription) {
        slot.iceQueue.push(candidate);
        return;
      }
      try {
        await slot.pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    };

    const onVoiceReady = ({ socketId }: { socketId: string }) => {
      if (socketId === socket.id) return;
      setVoicePeerIds((prev) => (prev.includes(socketId) ? prev : [...prev, socketId]));
      connectToPeer(socketId);
    };

    const onVoiceLeft = ({ socketId }: { socketId: string }) => {
      cleanupPeer(socketId);
      setVoicePeerIds((prev) => prev.filter((id) => id !== socketId));
    };

    const onMemberLeft = ({ socketId }: { socketId: string }) => {
      cleanupPeer(socketId);
      setVoicePeerIds((prev) => prev.filter((id) => id !== socketId));
    };

    const onForceMute = ({
      muted,
      reason,
    }: {
      muted: boolean;
      reason?: string;
    }) => {
      forceMutedRef.current = muted;
      setForceMuted(muted);
      if (muted) {
        if (micOnRef.current) {
          socketRef.current?.emit("voice:leave");
          socketRef.current?.emit("room:mute", { muted: true });
          micOnRef.current = false;
          joiningVoiceRef.current = false;
          cleanupAll();
          setMicOn(false);
          setVoicePeerIds([]);
        }
        setError(reason || "The host muted your microphone.");
      } else {
        setError(reason || null);
      }
    };

    const onPcm = ({ fromSocketId, data }: { fromSocketId: string; data: ArrayBuffer }) => {
      if (!fromSocketId || fromSocketId === socket.id) return;
      playPcmChunk(fromSocketId, data);
    };

    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);
    socket.on("voice:ready", onVoiceReady);
    socket.on("voice:left", onVoiceLeft);
    socket.on("room:member-left", onMemberLeft);
    socket.on("voice:force-mute", onForceMute);
    socket.on("voice:pcm", onPcm);

    return () => {
      cancelled = true;
      if (pendingOfferHandlerRef.current === onOffer) {
        pendingOfferHandlerRef.current = null;
      }
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
      socket.off("voice:ready", onVoiceReady);
      socket.off("voice:left", onVoiceLeft);
      socket.off("room:member-left", onMemberLeft);
      socket.off("voice:force-mute", onForceMute);
      socket.off("voice:pcm", onPcm);
    };
  }, [socket, enabled, getOrCreatePeer, connectToPeer, cleanupPeer, emitVoiceJoin, cleanupAll]);

  useEffect(() => {
    return () => {
      if (micOnRef.current) {
        socketRef.current?.emit("voice:leave");
      }
      cleanupAll();
    };
  }, [cleanupAll]);

  const micErrorMessage = (err: any): string => {
    const name = String(err?.name || "");
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone access was denied. Allow the mic in your browser settings and try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone was found. Plug one in and try again.";
    }
    if (name === "SecurityError" || name === "NotSupportedError") {
      return "Voice needs a secure connection (HTTPS) and a microphone.";
    }
    return err?.message || "Microphone access was denied.";
  };

  const startPcmFallback = async (stream: MediaStream) => {
    try {
      const PlayCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (PlayCtx) {
        if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
          playbackCtxRef.current = new PlayCtx();
        }
        if (playbackCtxRef.current.state === "suspended") {
          await playbackCtxRef.current.resume();
        }
      }
      await startPcmCapture(stream);
    } catch (err) {
      console.warn("PCM voice fallback is unavailable; continuing with WebRTC.", err);
      stopPcmCapture();
      const playbackContext = playbackCtxRef.current;
      playbackCtxRef.current = null;
      if (playbackContext) {
        void playbackContext.close().catch((closeError) => {
          console.warn("Could not close the PCM playback context.", closeError);
        });
      }
    }
  };

  const startVoice = async () => {
    if (!socket) return;
    if (forceMutedRef.current) {
      setError("The host muted you. Wait to be unmuted.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access the microphone.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      try {
        const ice = await fetch(apiUrl("/api/ice")).then((r) => r.json());
        if (Array.isArray(ice?.iceServers) && ice.iceServers.length) {
          iceServersRef.current = ice.iceServers;
        }
      } catch {
        iceServersRef.current = FALLBACK_ICE;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });

      await startPcmFallback(stream);

      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          if (!micOnRef.current || forceMutedRef.current) return;
          void (async () => {
            try {
              const next = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              localStreamRef.current = next;
              for (const t of next.getAudioTracks()) {
                t.enabled = true;
                t.onended = track.onended;
              }
              await startPcmFallback(next);
              const peerIds = [...peersRef.current.keys()];
              for (const id of peerIds) cleanupPeer(id);
              const s = socketRef.current;
              if (s && micOnRef.current) emitVoiceJoin(s);
            } catch {
              micOnRef.current = false;
              setMicOn(false);
              setError("Microphone was interrupted. Tap Mic on to rejoin voice.");
              socketRef.current?.emit("voice:leave");
              cleanupAll();
            }
          })();
        };
      }

      micOnRef.current = true;
      setMicOn(true);
      emitVoiceJoin(socket);

      const pending = pendingOffersRef.current.splice(0, pendingOffersRef.current.length);
      for (const offer of pending) {
        const handler = pendingOfferHandlerRef.current;
        if (handler) {
          void handler(offer);
        } else {
          pendingOffersRef.current.push(offer);
        }
      }

      for (const audio of audioElsRef.current.values()) {
        void audio.play().catch(() => undefined);
      }
    } catch (err: any) {
      micOnRef.current = false;
      cleanupAll();
      setError(micErrorMessage(err));
      setMicOn(false);
    } finally {
      setConnecting(false);
    }
  };

  const stopVoice = useCallback(() => {
    socketRef.current?.emit("voice:leave");
    socketRef.current?.emit("room:mute", { muted: true });
    micOnRef.current = false;
    joiningVoiceRef.current = false;
    cleanupAll();
    setMicOn(false);
    setVoicePeerIds([]);
  }, [cleanupAll]);

  const setPeerVolume = useCallback((remoteId: string, volume: number) => {
    const v = Math.min(1, Math.max(0, volume));
    peerVolumesRef.current = { ...peerVolumesRef.current, [remoteId]: v };
    setPeerVolumes((prev) => ({ ...prev, [remoteId]: v }));
    const audio = audioElsRef.current.get(remoteId);
    if (audio) audio.volume = v;
    const gain = pcmGainsRef.current.get(remoteId);
    if (gain) gain.gain.value = v;
  }, []);

  const nudgePeerVolume = useCallback(
    (remoteId: string, delta: number) => {
      const cur =
        typeof peerVolumesRef.current[remoteId] === "number"
          ? peerVolumesRef.current[remoteId]
          : 1;
      setPeerVolume(remoteId, cur + delta);
    },
    [setPeerVolume]
  );

  const syncForceMuted = useCallback((muted: boolean) => {
    forceMutedRef.current = muted;
    setForceMuted(muted);
    if (muted && micOnRef.current) {
      stopVoice();
      setError("The host muted your microphone.");
    }
  }, [stopVoice]);

  const toggleMic = async () => {
    if (micOn) stopVoice();
    else await startVoice();
  };

  return {
    micOn,
    connecting,
    error,
    forceMuted,
    peerVolumes,
    toggleMic,
    stopVoice,
    setPeerVolume,
    nudgePeerVolume,
    syncForceMuted,
    voicePeerCount: voicePeerIds.length,
  };
}
