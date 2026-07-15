import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

/** STUN + public TURN so friends behind different NATs can connect */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

type PeerSlot = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  iceQueue: RTCIceCandidateInit[];
};

/**
 * Mesh WebRTC voice for ≤10 peers.
 * Perfect negotiation + voice:ready so late joiners still connect.
 * Survives socket reconnects (e.g. brief drops while whiteboard is busy).
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
  }, []);

  const cleanupAll = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) cleanupPeer(id);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      localStreamRef.current = null;
    }
  }, [cleanupPeer]);

  const ensureAudioEl = (remoteId: string, stream: MediaStream) => {
    let audio = audioElsRef.current.get(remoteId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      // iOS Safari needs both of these or remote voice can stay silent
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

  /** Create PC without sending an offer (used when answering). */
  const getOrCreatePeer = useCallback(
    (remoteId: string): PeerSlot | null => {
      const s = socketRef.current;
      const stream = localStreamRef.current;
      if (!s?.id || !stream || remoteId === s.id) return null;

      let slot = peersRef.current.get(remoteId);
      if (slot) return slot;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      slot = { pc, makingOffer: false, ignoreOffer: false, iceQueue: [] };
      peersRef.current.set(remoteId, slot);

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
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
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            cleanupPeer(remoteId);
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

  /** Impolite peer (lower socket id) starts the offer. */
  const connectToPeer = useCallback(
    (remoteId: string) => {
      if (!micOnRef.current || !localStreamRef.current || !socketRef.current?.id) return;
      const slot = getOrCreatePeer(remoteId);
      if (!slot) return;
      const impolite = socketRef.current.id < remoteId;
      if (impolite && slot.pc.signalingState === "stable") {
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
      // Don't leave joiningVoice stuck if ack never arrives
      setTimeout(() => {
        joiningVoiceRef.current = false;
      }, 2500);
    },
    [connectToPeer]
  );

  useEffect(() => {
    if (!socket || !enabled) return;

    let cancelled = false;

    // Socket swap / soft reconnect: keep the mic stream alive and re-announce voice
    if (micOnRef.current && localStreamRef.current) {
      for (const id of [...peersRef.current.keys()]) cleanupPeer(id);
      setVoicePeerIds([]);
      // Defer so room:join has finished binding this socket to the room
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
      if (!micOnRef.current || !localStreamRef.current) return;

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

    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);
    socket.on("voice:ready", onVoiceReady);
    socket.on("voice:left", onVoiceLeft);
    socket.on("room:member-left", onMemberLeft);
    socket.on("voice:force-mute", onForceMute);

    return () => {
      cancelled = true;
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
      socket.off("voice:ready", onVoiceReady);
      socket.off("voice:left", onVoiceLeft);
      socket.off("room:member-left", onMemberLeft);
      socket.off("voice:force-mute", onForceMute);
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

  const startVoice = async () => {
    if (!socket) return;
    if (forceMutedRef.current) {
      setError("The host muted you. Wait to be unmuted.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      // Prefer simple constraints first — Safari/iOS often rejects overly-specific audio options
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

      // If an older stream somehow lingered, stop it first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      localStreamRef.current = stream;

      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          // Browser dropped the track (device/keyboard focus races) — recover if we still want mic on
          if (!micOnRef.current || forceMutedRef.current) return;
          void (async () => {
            try {
              const next = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              localStreamRef.current = next;
              for (const t of next.getAudioTracks()) {
                t.onended = track.onended;
              }
              // Rebuild peer connections with the fresh track
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

      for (const audio of audioElsRef.current.values()) {
        void audio.play().catch(() => undefined);
      }
    } catch (err: any) {
      micOnRef.current = false;
      setError(err?.message || "Microphone access was denied.");
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
