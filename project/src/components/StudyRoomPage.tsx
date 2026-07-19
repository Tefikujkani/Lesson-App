import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Copy,
  Check,
  Link2,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Users,
  DoorOpen,
  UserMinus,
  Crown,
  Shield,
  Plus,
  FileText,
  Film,
  Image as ImageIcon,
  PenLine,
  Volume1,
  Volume2,
  VolumeX,
  ChevronDown,
  X,
  Trash2,
} from "lucide-react";
import { apiFetch, getApiBaseUrl, getToken } from "../lib/api.ts";
import type { User } from "../types.ts";
import type {
  RoomAttachment,
  RoomChatMessage,
  RoomMember,
  StudyRoomInfo,
  WhiteboardMedia,
  WhiteboardStroke,
} from "../lib/roomTypes.ts";
import { SharedWhiteboard, type SharedWhiteboardHandle } from "./SharedWhiteboard.tsx";
import { useVoiceMesh } from "../hooks/useVoiceMesh.ts";
import { MarkdownView } from "./MarkdownView.tsx";

type Props = {
  user: User;
  initialCode?: string | null;
  onExit: () => void;
};

const MAX_STUDENTS = 10;
const MAX_ATTACH_BYTES = 12 * 1024 * 1024;

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file."));
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function attachmentKind(file: File): RoomAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

export function StudyRoomPage({ user, initialCode, onExit }: Props) {
  const [phase, setPhase] = useState<"lobby" | "room">("lobby");
  const [roomName, setRoomName] = useState("");
  const [topic, setTopic] = useState("");
  const [createAttempted, setCreateAttempted] = useState(false);
  const [joinCode, setJoinCode] = useState(initialCode?.toUpperCase() || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<StudyRoomInfo | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [media, setMedia] = useState<WhiteboardMedia[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [you, setYou] = useState<RoomMember | null>(null);
  const [uploading, setUploading] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<SharedWhiteboardHandle>(null);
  const socketRef = useRef<Socket | null>(null);
  const intentionallyLeavingRef = useRef(false);
  const roomCodeRef = useRef<string | null>(null);
  const phaseRef = useRef<"lobby" | "room">("lobby");
  const reconnectingRef = useRef(false);
  const lastChatTapRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  const chatPointerDownRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const likeLockRef = useRef<Record<string, number>>({});

  const {
    micOn,
    connecting,
    error: voiceError,
    toggleMic,
    stopVoice,
    forceMuted,
    peerVolumes,
    setPeerVolume,
    nudgePeerVolume,
    syncForceMuted,
  } = useVoiceMesh(socket, phase === "room");

  const isHost = Boolean(room && you && room.hostId === you.userId);
  const canDraw = Boolean(isHost || you?.canDraw);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    roomCodeRef.current = room?.code || null;
  }, [room?.code]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // Close mobile students overlay if the viewport grows to laptop size
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setPeopleOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keep local "you" + force-mute in sync with room member broadcasts
  useEffect(() => {
    if (!you) return;
    const live = members.find((m) => m.userId === you.userId);
    if (!live) return;
    if (
      live.canDraw !== you.canDraw ||
      live.forceMuted !== you.forceMuted ||
      live.muted !== you.muted ||
      live.inVoice !== you.inVoice ||
      live.socketId !== you.socketId
    ) {
      setYou(live);
    }
    syncForceMuted(Boolean(live.forceMuted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  useEffect(() => {
    if (initialCode) {
      void joinRoom(initialCode).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      intentionallyLeavingRef.current = true;
      stopVoice();
      const s = socketRef.current;
      s?.emit("room:leave");
      s?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindSocketHandlers = (s: Socket) => {
    s.on("room:chat", ({ message }: { message: RoomChatMessage }) => {
      setMessages((prev) => [...prev, message]);
    });
    s.on("room:chat-deleted", ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });
    s.on(
      "room:chat-liked",
      ({ messageId, likedBy }: { messageId: string; likedBy: string[] }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, likedBy } : m))
        );
      }
    );
    s.on("room:ai-typing", ({ typing }: { typing: boolean }) => setAiTyping(typing));
    s.on("room:member-joined", ({ members: next }: { members: RoomMember[] }) => {
      setMembers(next);
    });
    s.on("room:member-left", ({ members: next }: { members: RoomMember[] }) => {
      setMembers(next);
    });
    s.on("room:members", ({ members: next }: { members: RoomMember[] }) => {
      setMembers(next);
    });
    s.on("room:whiteboard-stroke", ({ stroke }: { stroke: WhiteboardStroke }) => {
      setStrokes((prev) => [...prev, stroke]);
    });
    s.on("room:whiteboard-clear", () => {
      setStrokes([]);
      setMedia([]);
    });
    s.on("room:whiteboard-media-add", ({ media: item }: { media: WhiteboardMedia }) => {
      setMedia((prev) => {
        if (prev.some((m) => m.id === item.id)) return prev;
        return [...prev, item];
      });
    });
    s.on(
      "room:whiteboard-media-move",
      ({ id, x, y }: { id: string; x: number; y: number }) => {
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
      }
    );
    s.on("room:whiteboard-media-remove", ({ id }: { id: string }) => {
      setMedia((prev) => prev.filter((m) => m.id !== id));
    });
    s.on("room:kicked", ({ reason }: { reason?: string }) => {
      intentionallyLeavingRef.current = true;
      stopVoice();
      s.disconnect();
      setSocket(null);
      socketRef.current = null;
      setPhase("lobby");
      setRoom(null);
      setMembers([]);
      setMessages([]);
      setStrokes([]);
      setMedia([]);
      setYou(null);
      setLeaveNotice(null);
      setReconnectNotice(null);
      window.location.hash = "";
      setError(reason || "You were removed from the room by the host.");
    });
    s.on("disconnect", (reason) => {
      if (intentionallyLeavingRef.current || reconnectingRef.current) return;
      if (phaseRef.current !== "room" || !roomCodeRef.current) return;
      // Brief drop (refresh / network) — try to reclaim seat within the 1-min grace
      const code = roomCodeRef.current;
      setReconnectNotice("Connection lost — rejoining…");
      void (async () => {
        reconnectingRef.current = true;
        try {
          await joinRoom(code, { manageBusy: false, silent: true });
          setReconnectNotice(null);
        } catch {
          setReconnectNotice(null);
          setPhase("lobby");
          setRoom(null);
          setYou(null);
          setMembers([]);
          setJoinCode(code);
          setLeaveNotice(
            `You left the room (${reason || "disconnected"}). Rejoin within 1 minute to keep your seat and board.`
          );
          setError(null);
        } finally {
          reconnectingRef.current = false;
        }
      })();
    });
  };

  const joinRoom = async (
    codeInput?: string,
    opts?: { manageBusy?: boolean; silent?: boolean }
  ) => {
    const manageBusy = opts?.manageBusy !== false;
    const silent = Boolean(opts?.silent);
    const code = (codeInput || joinCode).trim().toUpperCase();
    if (!code) {
      if (!silent) setError("Enter a room code.");
      throw new Error("Enter a room code.");
    }
    if (manageBusy) setBusy(true);
    if (!silent) setError(null);
    intentionallyLeavingRef.current = false;
    try {
      await apiFetch(`/api/rooms/${code}`);
      const token = getToken();
      if (!token) throw new Error("Please log in again.");

      // Don't emit soft-leave when swapping sockets for a reconnect —
      // keep room seat + voice membership until the new socket claims them.
      const prev = socketRef.current;
      if (prev) {
        intentionallyLeavingRef.current = true;
        // Soft-leave on the old id is fine; room:join below reclaim seats.
        // Avoid double reconnect loops while we tear the old connection down.
        prev.removeAllListeners("disconnect");
        prev.disconnect();
        intentionallyLeavingRef.current = false;
      }

      const s = io(getApiBaseUrl() || undefined, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
      });
      bindSocketHandlers(s);

      await new Promise<void>((resolve, reject) => {
        s.emit(
          "room:join",
          {
            code,
            token,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
          (result: any) => {
            if (!result?.ok) {
              s.disconnect();
              reject(new Error(result?.error || "Failed to join."));
              return;
            }
            setSocket(s);
            socketRef.current = s;
            setRoom(result.room);
            setYou(result.you);
            setMembers(result.members || []);
            setMessages(result.messages || []);
            setStrokes(result.strokes || []);
            setMedia(result.media || []);
            setJoinCode(code);
            setLeaveNotice(null);
            setReconnectNotice(null);
            setPhase("room");
            window.location.hash = `#/room/${code}`;
            resolve();
          }
        );
      });
    } catch (err: any) {
      if (!silent) setError(err?.message || "Could not join room.");
      throw err instanceof Error ? err : new Error(err?.message || "Could not join room.");
    } finally {
      if (manageBusy) setBusy(false);
    }
  };

  const createRoom = async () => {
    setCreateAttempted(true);
    const name = roomName.trim();
    const studyTopic = topic.trim();
    if (!name || !studyTopic) {
      setError("Enter a room name and what you are studying.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreatedLink(null);
    try {
      const created = await apiFetch<StudyRoomInfo & { joinUrl: string }>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name,
          topic: studyTopic,
          hostName: user.name,
        }),
      });
      setCreatedLink(`${window.location.origin}/#/room/${created.code}`);
      await joinRoom(created.code, { manageBusy: false });
    } catch (err: any) {
      setError(err?.message || "Could not create room.");
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = () => {
    const code = room?.code;
    const name = room?.name || "the study room";
    const ok = window.confirm(
      `Leave ${name}?\n\nYou can rejoin within 1 minute to keep the whiteboard and your seat.\nAfter 1 minute you'll need to join again.`
    );
    if (!ok) return;

    intentionallyLeavingRef.current = true;
    stopVoice();
    socketRef.current?.emit("room:leave");
    socketRef.current?.disconnect();
    setSocket(null);
    socketRef.current = null;
    setPhase("lobby");
    setMembers([]);
    setMessages([]);
    setStrokes([]);
    setMedia([]);
    setYou(null);
    setRoom(null);
    setReconnectNotice(null);
    // Clear invite hash so a refresh does NOT auto-join back into the room
    if (window.location.hash) {
      window.location.hash = "";
    }
    if (code) {
      setJoinCode(code);
      setLeaveNotice(
        `You left ${name}. Rejoin within 1 minute to keep your seat and board — after that you'll need to join again.`
      );
    } else {
      setLeaveNotice("You left the study room. Join again with the room code when you're ready.");
    }
    setError(null);
    // Stay on the Group Study lobby so rejoin is one tap (use Rejoin / Enter room)
  };

  const kickMember = (m: RoomMember) => {
    if (!socket || !isHost) return;
    if (!window.confirm(`Remove ${m.name} from this study group?`)) return;
    socket.emit("room:kick", { socketId: m.socketId }, (result: any) => {
      if (!result?.ok) {
        setError(result?.error || "Could not kick student.");
      }
    });
  };

  const setDrawAccess = (m: RoomMember, allow: boolean) => {
    if (!socket || !isHost) return;
    socket.emit(
      "room:set-draw",
      { userId: m.userId, canDraw: allow },
      (result: { ok?: boolean; error?: string }) => {
        if (result && result.ok === false) {
          setError(result.error || "Could not update board access.");
        }
      }
    );
  };

  const hostMuteMember = (m: RoomMember, muted: boolean) => {
    if (!socket || !isHost) return;
    socket.emit(
      "room:host-mute",
      { userId: m.userId, muted },
      (result: { ok?: boolean; error?: string }) => {
        if (result && result.ok === false) {
          setError(result.error || "Could not mute student.");
        }
      }
    );
  };

  const sendChat = (attachment?: RoomAttachment) => {
    const text = chatInput.trim();
    if ((!text && !attachment) || !socket) return;
    setChatInput("");

    // When tagging @AI, snap the whiteboard so the buddy can "read" what's drawn
    let boardImage: string | undefined;
    if (text && /@AI\b/i.test(text) && (strokes.length > 0 || media.length > 0)) {
      boardImage = boardRef.current?.exportBoardDataUrl("image/jpeg", 0.68) || undefined;
    }

    socket.emit(
      "room:chat",
      { text, attachment, boardImage },
      (result: { ok?: boolean; error?: string }) => {
        if (result && result.ok === false) {
          setError(result.error || "Could not send message.");
        }
      }
    );
  };

  const deleteChat = (messageId: string) => {
    if (!socket) return;
    socket.emit(
      "room:chat-delete",
      { messageId },
      (result: { ok?: boolean; error?: string }) => {
        if (result && result.ok === false) {
          setError(result.error || "Could not delete message.");
        }
      }
    );
  };

  const likeChat = (messageId: string) => {
    if (!socket || !you) return;
    const now = Date.now();
    // Touch devices often fire tap + ghost dblclick — guard so we don't like then instantly unlike.
    if ((likeLockRef.current[messageId] || 0) > now - 700) return;
    likeLockRef.current[messageId] = now;

    const uid = you.userId;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const likedBy = [...(m.likedBy || [])];
        const i = likedBy.indexOf(uid);
        if (i >= 0) likedBy.splice(i, 1);
        else likedBy.push(uid);
        return { ...m, likedBy };
      })
    );

    socket.emit(
      "room:chat-like",
      { messageId },
      (result: { ok?: boolean; error?: string; likedBy?: string[] }) => {
        if (result && result.ok === false) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== messageId) return m;
              const likedBy = [...(m.likedBy || [])];
              const i = likedBy.indexOf(uid);
              if (i >= 0) likedBy.splice(i, 1);
              else likedBy.push(uid);
              return { ...m, likedBy };
            })
          );
          setError(result.error || "Could not like message.");
          return;
        }
        if (result?.likedBy) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, likedBy: result.likedBy } : m))
          );
        }
      }
    );
  };

  const handleChatBubbleDoubleActivate = (
    messageId: string,
    userId: string,
    clientX: number,
    clientY: number
  ) => {
    if (userId === "system") return;
    const down = chatPointerDownRef.current;
    chatPointerDownRef.current = null;
    // Ignore if the finger/mouse moved (scroll), or pointer-down was on another bubble.
    if (down && (down.id !== messageId || Math.hypot(clientX - down.x, clientY - down.y) > 14)) {
      lastChatTapRef.current = { id: "", at: 0 };
      return;
    }
    const now = Date.now();
    const last = lastChatTapRef.current;
    if (last.id === messageId && now - last.at < 480) {
      lastChatTapRef.current = { id: "", at: 0 };
      likeChat(messageId);
      return;
    }
    lastChatTapRef.current = { id: messageId, at: now };
  };

  const handlePickAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !socket) return;
    if (file.size > MAX_ATTACH_BYTES) {
      setError("File is too large (max 12MB). Try a smaller photo or shorter video.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const attachment: RoomAttachment = {
        kind: attachmentKind(file),
        name: file.name,
        mime: file.type || "application/octet-stream",
        dataUrl,
        size: file.size,
      };
      sendChat(attachment);
    } catch (err: any) {
      setError(err?.message || "Could not attach file.");
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async () => {
    const link =
      createdLink ||
      (room ? `${window.location.origin}/#/room/${room.code}` : "");
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  if (phase === "room" && room && you) {
    return (
      <div className="app-shell flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden text-ink pt-[env(safe-area-inset-top)]">
        {reconnectNotice && (
          <div className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border-b border-amber-200 shrink-0">
            {reconnectNotice}
          </div>
        )}
        {/* One tight header row on phones — no wrap like the cramped screenshot */}
        <header className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-5 py-1.5 sm:py-2.5 border-b border-[#c5ddb8] bg-white/90 backdrop-blur-sm shrink-0">
          <button
            type="button"
            onClick={leaveRoom}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-[#5f7a62] hover:bg-[#e8f5e0] shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-extrabold text-sm sm:text-lg truncate leading-tight flex items-center gap-1">
              {room.name}
              {isHost && (
                <Crown className="w-3.5 h-3.5 text-[#4f8f28] shrink-0" aria-label="You are host" />
              )}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-[#5f7a62] truncate">
              <span className="font-bold text-ink">{room.code}</span>
              <span className="hidden sm:inline">{room.topic ? ` · ${room.topic}` : ""}</span>
              <span className="hidden lg:inline">
                {" · "}
                {members.length}/{MAX_STUDENTS}
              </span>
            </p>
          </div>
          {/* Mobile only — opens student controls over the whiteboard */}
          <button
            type="button"
            onClick={() => setPeopleOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-1 h-8 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white text-ink border border-[#c5ddb8] hover:bg-[#f7fbf4] shrink-0"
            aria-expanded={peopleOpen}
            aria-haspopup="dialog"
            title="Students"
          >
            <Users className="w-3.5 h-3.5 text-[#4f8f28]" />
            <span>
              {members.length}/{MAX_STUDENTS}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#5f7a62] transition-transform ${
                peopleOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex items-center justify-center gap-1 h-8 sm:h-auto px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-[#e8f5e0] text-[#4f8f28] border border-[#c5ddb8] shrink-0"
            title="Copy invite link"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Invite"}</span>
          </button>
          <button
            type="button"
            disabled={connecting || forceMuted}
            onClick={() => void toggleMic()}
            className={`inline-flex items-center justify-center gap-1 h-8 sm:h-auto px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors shrink-0 ${
              forceMuted
                ? "bg-rose-100 text-rose-700 border border-rose-200 cursor-not-allowed"
                : micOn
                  ? "bg-[#4f8f28] text-white"
                  : "bg-white text-ink border border-[#c5ddb8] hover:bg-[#f7fbf4]"
            }`}
            title={
              forceMuted
                ? "Host muted you"
                : micOn
                  ? "Mic on"
                  : "Join voice"
            }
          >
            {connecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : forceMuted || !micOn ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {forceMuted ? "Muted by host" : micOn ? "Mic on" : "Join voice"}
            </span>
          </button>
        </header>

        {(voiceError || error) && (
          <div className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 border-b border-rose-100 shrink-0">
            {voiceError || error}
          </div>
        )}

        {/* Mobile: board ~52% / chat ~48%. Desktop: side-by-side */}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-rows-1 lg:grid-cols-[1fr_320px]">
          <main className="min-h-0 flex flex-col p-1.5 sm:p-3 gap-1.5 sm:gap-2 overflow-hidden">
            {/* Laptop / big screens — original horizontal student chips */}
            <div className="hidden lg:flex gap-1.5 overflow-x-auto shrink-0 pb-0.5 scrollbar-none -mx-0.5 px-0.5">
              {members.map((m) => {
                const memberIsHost = room.hostId === m.userId;
                const isYou = m.userId === you.userId;
                const peerVol =
                  typeof peerVolumes[m.socketId] === "number" ? peerVolumes[m.socketId] : 1;
                return (
                  <div
                    key={m.socketId}
                    className="flex flex-col gap-1 px-2 py-1.5 rounded-xl bg-white/90 border border-[#c5ddb8] text-[10px] sm:text-[11px] font-semibold shrink-0 min-w-0"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          m.forceMuted
                            ? "bg-rose-400"
                            : m.inVoice || !m.muted
                              ? "bg-[#4f8f28] animate-pulse"
                              : "bg-[#c5ddb8]"
                        }`}
                      />
                      <span className="truncate max-w-[7rem]">
                        {m.name}
                        {isYou ? " (you)" : ""}
                      </span>
                      {memberIsHost ? (
                        <Crown className="w-3 h-3 text-[#4f8f28] shrink-0" aria-label="Host" />
                      ) : null}
                      {m.canDraw && !memberIsHost ? (
                        <PenLine
                          className="w-3 h-3 text-[#4f8f28] shrink-0"
                          aria-label="Can draw"
                        />
                      ) : null}
                    </div>
                    {isHost && !memberIsHost && !isYou && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setDrawAccess(m, !m.canDraw)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${
                            m.canDraw
                              ? "bg-[#4f8f28] text-white"
                              : "text-[#5f7a62] hover:bg-[#e8f5e0]"
                          }`}
                          title={
                            m.canDraw
                              ? `Revoke whiteboard for ${m.name}`
                              : `Allow ${m.name} to use whiteboard`
                          }
                          aria-label={
                            m.canDraw
                              ? `Revoke whiteboard for ${m.name}`
                              : `Allow ${m.name} to use whiteboard`
                          }
                        >
                          <PenLine className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => hostMuteMember(m, !m.forceMuted)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${
                            m.forceMuted
                              ? "bg-rose-600 text-white"
                              : "text-[#5f7a62] hover:bg-[#e8f5e0]"
                          }`}
                          title={m.forceMuted ? `Unmute ${m.name}` : `Mute ${m.name}`}
                          aria-label={m.forceMuted ? `Unmute ${m.name}` : `Mute ${m.name}`}
                        >
                          {m.forceMuted ? (
                            <MicOff className="w-3 h-3" />
                          ) : (
                            <Mic className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgePeerVolume(m.socketId, -0.15)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[#5f7a62] hover:bg-[#e8f5e0]"
                          title={`Lower volume for ${m.name}`}
                          aria-label={`Lower volume for ${m.name}`}
                        >
                          <Volume1 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgePeerVolume(m.socketId, 0.15)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[#5f7a62] hover:bg-[#e8f5e0]"
                          title={`Raise volume for ${m.name} (${Math.round(peerVol * 100)}%)`}
                          aria-label={`Raise volume for ${m.name}`}
                        >
                          {peerVol < 0.05 ? (
                            <VolumeX className="w-3 h-3" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => kickMember(m)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-rose-700 hover:bg-rose-50"
                          title={`Kick ${m.name}`}
                          aria-label={`Kick ${m.name}`}
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {isHost && !memberIsHost && !isYou && (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(peerVol * 100)}
                        onChange={(e) =>
                          setPeerVolume(m.socketId, Number(e.target.value) / 100)
                        }
                        className="w-full h-1 accent-[#4f8f28]"
                        title={`${m.name} volume ${Math.round(peerVol * 100)}%`}
                        aria-label={`${m.name} volume`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Whiteboard — mobile dropdown overlays on top of the board only */}
            <div className="relative flex-1 min-h-0">
              <SharedWhiteboard
                ref={boardRef}
                strokes={strokes}
                media={media}
                userId={you.userId}
                userName={you.name}
                canDraw={canDraw}
                onStrokeComplete={(stroke) => {
                  if (!canDraw) return;
                  setStrokes((prev) => [...prev, stroke]);
                  socket?.emit("room:whiteboard-stroke", stroke);
                }}
                onMediaAdd={(item) => {
                  if (!canDraw) return;
                  setMedia((prev) => [...prev, item]);
                  socket?.emit("room:whiteboard-media-add", item);
                }}
                onMediaMove={(id, x, y) => {
                  if (!canDraw) return;
                  setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
                  socket?.emit("room:whiteboard-media-move", { id, x, y });
                }}
                onMediaRemove={(id) => {
                  if (!canDraw) return;
                  setMedia((prev) => prev.filter((m) => m.id !== id));
                  socket?.emit("room:whiteboard-media-remove", { id });
                }}
                onClear={() => {
                  if (!canDraw) return;
                  setStrokes([]);
                  setMedia([]);
                  socket?.emit("room:whiteboard-clear");
                }}
              />

              {peopleOpen && (
                <div className="lg:hidden absolute inset-0 z-30 flex flex-col p-1.5 sm:p-2">
                  <button
                    type="button"
                    className="absolute inset-0 bg-[#1a3324]/25 rounded-xl"
                    aria-label="Close students list"
                    onClick={() => setPeopleOpen(false)}
                  />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Students in this room"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className="relative z-10 w-full max-h-full overflow-hidden rounded-xl border border-[#c5ddb8] bg-white shadow-lg flex flex-col"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#c5ddb8] bg-[#f7fbf4] shrink-0">
                      <Users className="w-4 h-4 text-[#4f8f28]" />
                      <h2 className="text-sm font-bold flex-1">
                        {members.length}/{MAX_STUDENTS} students
                      </h2>
                      {isHost && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#4f8f28] bg-[#e8f5e0] px-1.5 py-0.5 rounded">
                          Host
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPeopleOpen(false)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#5f7a62] hover:bg-white"
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <ul className="overflow-y-auto overscroll-contain divide-y divide-[#e8f5e0] min-h-0 flex-1">
                      {members.map((m) => {
                        const memberIsHost = room.hostId === m.userId;
                        const isYou = m.userId === you.userId;
                        const peerVol =
                          typeof peerVolumes[m.socketId] === "number"
                            ? peerVolumes[m.socketId]
                            : 1;
                        const showHostControls = isHost && !memberIsHost && !isYou;
                        return (
                          <li key={m.socketId} className="px-3 py-2.5 space-y-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  m.forceMuted
                                    ? "bg-rose-400"
                                    : m.inVoice || !m.muted
                                      ? "bg-[#4f8f28] animate-pulse"
                                      : "bg-[#c5ddb8]"
                                }`}
                              />
                              <span className="text-sm font-bold truncate flex-1">
                                {m.name}
                                {isYou ? " (you)" : ""}
                              </span>
                              {memberIsHost && (
                                <Crown
                                  className="w-3.5 h-3.5 text-[#4f8f28] shrink-0"
                                  aria-label="Host"
                                />
                              )}
                              {m.canDraw && !memberIsHost && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#4f8f28] bg-[#e8f5e0] px-1.5 py-0.5 rounded shrink-0">
                                  <PenLine className="w-3 h-3" /> Board
                                </span>
                              )}
                              {m.forceMuted && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded shrink-0">
                                  Muted
                                </span>
                              )}
                            </div>
                            {showHostControls && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-4">
                                <button
                                  type="button"
                                  onClick={() => setDrawAccess(m, !m.canDraw)}
                                  className={`inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg text-xs font-semibold touch-manipulation ${
                                    m.canDraw
                                      ? "bg-[#4f8f28] text-white"
                                      : "bg-[#f7fbf4] text-[#5f7a62] border border-[#c5ddb8]"
                                  }`}
                                  title={
                                    m.canDraw
                                      ? `Revoke whiteboard for ${m.name}`
                                      : `Allow ${m.name} to use whiteboard`
                                  }
                                >
                                  <PenLine className="w-3.5 h-3.5" />
                                  Pen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => hostMuteMember(m, !m.forceMuted)}
                                  className={`inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg text-xs font-semibold touch-manipulation ${
                                    m.forceMuted
                                      ? "bg-rose-600 text-white"
                                      : "bg-[#f7fbf4] text-[#5f7a62] border border-[#c5ddb8]"
                                  }`}
                                  title={
                                    m.forceMuted ? `Unmute ${m.name}` : `Mute ${m.name}`
                                  }
                                >
                                  {m.forceMuted ? (
                                    <MicOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Mic className="w-3.5 h-3.5" />
                                  )}
                                  {m.forceMuted ? "Unmute" : "Mute"}
                                </button>
                                <div className="inline-flex items-center gap-1 min-h-9 px-1.5 rounded-lg bg-[#f7fbf4] border border-[#c5ddb8] flex-1 min-w-[9rem]">
                                  <Volume1 className="w-3.5 h-3.5 text-[#5f7a62] shrink-0 ml-1" />
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(peerVol * 100)}
                                    onChange={(e) =>
                                      setPeerVolume(m.socketId, Number(e.target.value) / 100)
                                    }
                                    className="flex-1 min-w-0 h-2 accent-[#4f8f28]"
                                    title={`${m.name} volume ${Math.round(peerVol * 100)}%`}
                                    aria-label={`${m.name} volume`}
                                  />
                                  <span className="text-[10px] font-bold text-[#5f7a62] w-8 text-right pr-1">
                                    {Math.round(peerVol * 100)}%
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => kickMember(m)}
                                  className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 touch-manipulation"
                                  title={`Kick ${m.name}`}
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                  Kick
                                </button>
                              </div>
                            )}
                            {!showHostControls && !isHost && (
                              <p className="text-[10px] text-[#5f7a62] pl-4">
                                {memberIsHost
                                  ? "Room host"
                                  : m.canDraw
                                    ? "Can use the whiteboard"
                                    : "Viewing the board"}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                </div>
              )}
            </div>
          </main>

          <aside className="flex flex-col border-t lg:border-t-0 lg:border-l border-[#c5ddb8] bg-white/95 min-h-0 overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <div className="px-3 py-2 border-b border-[#c5ddb8] flex items-center gap-2 shrink-0">
              <Users className="w-4 h-4 text-[#4f8f28]" />
              <h2 className="text-sm font-bold">Room chat</h2>
              {isHost && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#4f8f28] bg-[#e8f5e0] px-1.5 py-0.5 rounded">
                  <Crown className="w-3 h-3" /> Host
                </span>
              )}
              <span className="ml-auto text-[10px] text-[#5f7a62] font-semibold hidden sm:inline">
                Tag @AI for help
              </span>
              <span className="ml-auto text-[10px] text-[#5f7a62] font-semibold sm:hidden">
                @AI
              </span>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2.5 space-y-2.5 min-h-0">
              {messages.length === 0 && (
                <p className="text-xs text-[#5f7a62] leading-relaxed">
                  Draw on the board, then ask{" "}
                  <span className="font-bold text-ink">@AI</span> to explain it — or{" "}
                  <span className="font-bold text-ink">@AI hint</span> for a clue without spoilers.
                </p>
              )}
              {messages.map((m) => {
                const showCaption =
                  Boolean(m.text) &&
                  !(m.attachment && /^Shared (image|video|file):/i.test(m.text));
                const likedBy = m.likedBy || [];
                const likeCount = likedBy.length;
                const youLiked = Boolean(you && likedBy.includes(you.userId));
                const canDelete =
                  Boolean(you) &&
                  m.userId === you!.userId &&
                  !m.isAi &&
                  m.userId !== "system";
                return (
                  <div
                    key={m.id}
                    tabIndex={m.userId === "system" ? undefined : 0}
                    onPointerDown={(e) => {
                      if (m.userId === "system") return;
                      if ((e.target as HTMLElement).closest("a, button, video")) return;
                      if (e.pointerType === "mouse" && e.button !== 0) return;
                      chatPointerDownRef.current = {
                        id: m.id,
                        x: e.clientX,
                        y: e.clientY,
                      };
                    }}
                    onPointerUp={(e) => {
                      if (m.userId === "system") return;
                      if ((e.target as HTMLElement).closest("a, button, video")) return;
                      if (e.pointerType === "mouse" && e.button !== 0) return;
                      handleChatBubbleDoubleActivate(m.id, m.userId, e.clientX, e.clientY);
                    }}
                    onPointerCancel={() => {
                      chatPointerDownRef.current = null;
                      lastChatTapRef.current = { id: "", at: 0 };
                    }}
                    onKeyDown={(e) => {
                      if (m.userId === "system") return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        likeChat(m.id);
                      }
                    }}
                    title={m.userId === "system" ? undefined : "Double-click or double-tap to 👍"}
                    className={`group relative rounded-xl px-3 py-2 text-sm select-none touch-manipulation ${
                      m.isAi
                        ? "bg-[#e8f5e0] border border-[#c5ddb8]"
                        : m.userId === "system"
                          ? "bg-[#f7fbf4] border border-dashed border-[#c5ddb8] text-[#5f7a62] text-xs"
                          : m.userId === you.userId
                            ? "bg-[#f7fbf4] border border-[#dcefd0]"
                            : "bg-white border border-[#e8efe3]"
                    } ${m.userId !== "system" ? "cursor-pointer" : ""}`}
                  >
                    {m.userId !== "system" && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {m.isAi && <Sparkles className="w-3 h-3 text-[#4f8f28]" />}
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#5f7a62]">
                          {m.name}
                        </span>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(m.id);
                            }}
                            className="ml-auto p-1 rounded-md text-[#6b8a6f] bg-[#eef5ea] hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete message"
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {m.attachment?.kind === "image" && (
                      <a
                        href={m.attachment.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block mt-1 mb-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img
                          src={m.attachment.dataUrl}
                          alt={m.attachment.name}
                          className="rounded-lg max-h-52 w-auto max-w-full object-contain border border-[#c5ddb8]"
                        />
                      </a>
                    )}
                    {m.attachment?.kind === "video" && (
                      <video
                        src={m.attachment.dataUrl}
                        controls
                        playsInline
                        className="mt-1 mb-1 rounded-lg max-h-52 w-full bg-black"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {m.attachment?.kind === "file" && (
                      <a
                        href={m.attachment.dataUrl}
                        download={m.attachment.name}
                        className="mt-1 mb-1 flex items-center gap-2 rounded-lg border border-[#c5ddb8] bg-white px-2.5 py-2 text-xs font-semibold text-ink hover:bg-[#f7fbf4]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.attachment.mime.includes("pdf") ||
                        m.attachment.name.toLowerCase().endsWith(".pdf") ? (
                          <FileText className="w-4 h-4 text-[#4f8f28] shrink-0" />
                        ) : m.attachment.mime.startsWith("video/") ? (
                          <Film className="w-4 h-4 text-[#4f8f28] shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-[#4f8f28] shrink-0" />
                        )}
                        <span className="min-w-0 truncate">{m.attachment.name}</span>
                        <span className="text-[#5f7a62] shrink-0">
                          {formatBytes(m.attachment.size)}
                        </span>
                      </a>
                    )}
                    {m.isAi ? (
                      <MarkdownView content={m.text} textSize="sm" />
                    ) : showCaption ? (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    ) : null}
                    {likeCount > 0 && (
                      <div
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${
                          youLiked
                            ? "border-[#4f8f28] bg-[#e8f5e0] text-[#2f5a18]"
                            : "border-[#c5ddb8] bg-white text-[#5f7a62]"
                        }`}
                        aria-label={`${likeCount} thumbs up`}
                      >
                        <span aria-hidden>👍</span>
                        <span>{likeCount}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {aiTyping && (
                <div className="flex items-center gap-2 text-xs text-[#5f7a62] px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4f8f28]" />
                  AI Buddy is thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-2 sm:p-2.5 border-t border-[#c5ddb8] flex gap-2 shrink-0 bg-white">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.xls,.xlsx,.zip"
                onChange={(e) => void handlePickAttachment(e)}
              />
              <button
                type="button"
                disabled={uploading || !socket}
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-10 h-10 rounded-xl border border-[#c5ddb8] bg-[#f7fbf4] text-[#4f8f28] flex items-center justify-center hover:bg-[#e8f5e0] disabled:opacity-60"
                aria-label="Attach photo, file, or video"
                title="Attach photo, file, or video"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Message the room…"
                // text-base (16px) prevents iOS Safari from zooming on focus
                className="flex-1 min-w-0 rounded-xl border border-[#c5ddb8] bg-[#f7fbf4] px-3 py-2.5 text-base outline-none focus:border-[#4f8f28]"
              />
              <button
                type="button"
                onClick={() => sendChat()}
                className="shrink-0 w-10 h-10 rounded-xl bg-[#4f8f28] text-white flex items-center justify-center hover:bg-[#3f7a20]"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-[100dvh] overflow-y-auto text-ink">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f7a62] hover:text-ink mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to NoteLab
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2 mb-8"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#4f8f28]">
            Multiplayer
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
            Group Study Room
          </h1>
          <p className="text-sm sm:text-base text-[#5f7a62] max-w-xl leading-relaxed">
            Host controls the whiteboard, can grant draw access, mute students, and adjust volumes.
            Up to {MAX_STUDENTS} students · voice · chat · board · @AI
          </p>
        </motion.div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        {leaveNotice && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 space-y-2">
            <p className="leading-relaxed">{leaveNotice}</p>
            {joinCode.trim() && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void joinRoom(joinCode).catch(() => undefined)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4f8f28] text-white font-bold text-xs px-3 py-2 hover:bg-[#3f7a20] disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
                Rejoin now
              </button>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-[#c5ddb8] bg-white/90 p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#4f8f28]" />
              <h2 className="font-display font-bold text-lg">Create as host</h2>
            </div>
            <p className="text-xs text-[#5f7a62] leading-relaxed">
              You become the room admin — invite friends and kick anyone if needed.
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#5f7a62]">
                Room name
              </span>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Friday Study Squad"
                required
                aria-invalid={createAttempted && !roomName.trim()}
                className={`w-full rounded-xl border bg-[#f7fbf4] px-3 py-2 text-base outline-none focus:border-[#4f8f28] ${
                  createAttempted && !roomName.trim() ? "border-red-400" : "border-[#c5ddb8]"
                }`}
              />
              {createAttempted && !roomName.trim() && (
                <span className="block text-[11px] font-semibold text-red-600">
                  Please enter a room name.
                </span>
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#5f7a62]">
                What are you studying?
              </span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Calculus limits, Python loops…"
                required
                aria-invalid={createAttempted && !topic.trim()}
                className={`w-full rounded-xl border bg-[#f7fbf4] px-3 py-2 text-base outline-none focus:border-[#4f8f28] ${
                  createAttempted && !topic.trim() ? "border-red-400" : "border-[#c5ddb8]"
                }`}
              />
              {createAttempted && !topic.trim() && (
                <span className="block text-[11px] font-semibold text-red-600">
                  Please enter what you are studying.
                </span>
              )}
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createRoom()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#4f8f28] text-white font-bold text-sm py-2.5 hover:bg-[#3f7a20] disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}
              Create group
            </button>
            {createdLink && (
              <button
                type="button"
                onClick={() => void copyLink()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#c5ddb8] bg-[#f7fbf4] text-xs font-semibold py-2 text-ink"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Invite link copied" : "Copy invite link"}
              </button>
            )}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-[#c5ddb8] bg-white/90 p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#4f8f28]" />
              <h2 className="font-display font-bold text-lg">Join a group</h2>
            </div>
            <p className="text-xs text-[#5f7a62] leading-relaxed">
              Paste the host’s 6-character code.
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#5f7a62]">
                Room code
              </span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB12CD"
                maxLength={8}
                className="w-full rounded-xl border border-[#c5ddb8] bg-[#f7fbf4] px-3 py-2 text-base font-mono tracking-widest outline-none focus:border-[#4f8f28] uppercase"
              />
            </label>
            <button
              type="button"
              disabled={busy || !joinCode.trim()}
              onClick={() => void joinRoom().catch(() => undefined)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#4f8f28] text-[#4f8f28] font-bold text-sm py-2.5 hover:bg-[#e8f5e0] disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {leaveNotice ? "Rejoin room" : "Enter room"}
            </button>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
