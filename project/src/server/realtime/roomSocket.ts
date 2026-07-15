import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { StudyRoom } from "../models/StudyRoom.ts";
import { generateRoomAiReply } from "../controllers/roomAiController.ts";
import {
  addMember,
  canJoinRoom,
  clearStrokes,
  findMemberRoom,
  getLiveRoom,
  getOrCreateLiveRoom,
  hardLeaveMember,
  hasReservation,
  memberCanDraw,
  moveMedia,
  deleteMessage,
  pushMessage,
  pushStroke,
  REJOIN_GRACE_MS,
  removeMedia,
  resolveMemberFlags,
  setMemberCanDraw,
  setMemberForceMuted,
  softLeaveMember,
  snapshotMembers,
  toggleMessageLike,
  upsertMedia,
  WhiteboardMedia,
  WhiteboardStroke,
} from "./roomState.ts";

type AuthPayload = { userId: string; email: string };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not defined.");
  return secret;
}

function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch {
    return null;
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024; // ~12MB decoded; data URLs are larger

export function attachRoomSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
    // Allow chat photo/video/file data URLs (base64 is bulky)
    maxHttpBufferSize: 20 * 1024 * 1024,
  });

  io.on("connection", (socket: Socket) => {
    socket.on(
      "room:join",
      async (
        payload: { code?: string; token?: string; name?: string; avatarUrl?: string },
        ack?: (result: unknown) => void
      ) => {
        try {
          const code = String(payload?.code || "")
            .trim()
            .toUpperCase();
          const token = String(payload?.token || "");
          const auth = verifyToken(token);
          if (!auth) {
            ack?.({ ok: false, error: "Invalid or expired session. Please log in again." });
            return;
          }
          if (!code) {
            ack?.({ ok: false, error: "Room code is required." });
            return;
          }

          const dbRoom = await StudyRoom.findOne({ code, isActive: true }).lean();
          if (!dbRoom) {
            ack?.({ ok: false, error: "This study room was not found or is closed." });
            return;
          }

          const live = getOrCreateLiveRoom({
            code,
            name: dbRoom.name,
            topic: dbRoom.topic || "",
            hostId: dbRoom.hostId,
          });
          const gate = canJoinRoom(code, auth.userId);
          const existingSameUser = [...live.members.values()].find((m) => m.userId === auth.userId);
          const reclaiming = Boolean(existingSameUser) || hasReservation(code, auth.userId);
          if (!gate.ok && !reclaiming) {
            ack?.({ ok: false, error: gate.reason });
            return;
          }

          // Replace an old live socket without triggering soft-leave (race-safe)
          if (existingSameUser) {
            live.members.delete(existingSameUser.socketId);
            try {
              const oldSock = io.sockets.sockets.get(existingSameUser.socketId);
              if (oldSock) {
                (oldSock.data as { roomCode?: string; skipLeave?: boolean }).roomCode = undefined;
                (oldSock.data as { skipLeave?: boolean }).skipLeave = true;
                oldSock.leave(`room:${code}`);
                oldSock.disconnect(true);
              }
            } catch {
              /* ignore */
            }
          }

          const displayName =
            (typeof payload?.name === "string" && payload.name.trim()) ||
            auth.email.split("@")[0] ||
            "Student";

          const flags = resolveMemberFlags(code, auth.userId);
          const member = {
            socketId: socket.id,
            userId: auth.userId,
            name: displayName.slice(0, 60),
            avatarUrl: typeof payload?.avatarUrl === "string" ? payload.avatarUrl : undefined,
            muted: true,
            forceMuted: flags.forceMuted,
            canDraw: flags.canDraw,
            inVoice: false,
            joinedAt: new Date().toISOString(),
          };

          socket.join(`room:${code}`);
          (socket.data as { roomCode?: string; userId?: string; isHost?: boolean; skipLeave?: boolean }).roomCode =
            code;
          (socket.data as { userId?: string }).userId = auth.userId;
          (socket.data as { isHost?: boolean }).isHost = auth.userId === dbRoom.hostId;
          (socket.data as { skipLeave?: boolean }).skipLeave = false;

          const members = addMember(code, member);
          socket.to(`room:${code}`).emit("room:member-joined", { member, members });

          if (reclaiming) {
            const backMsg = pushMessage(code, {
              id: newId("sys"),
              userId: "system",
              name: "Room",
              text: `${member.name} rejoined the room.`,
              isAi: false,
              timestamp: new Date().toISOString(),
            });
            io.to(`room:${code}`).emit("room:chat", { message: backMsg });
          }

          ack?.({
            ok: true,
            room: {
              code: live.code,
              name: live.name,
              topic: live.topic,
              hostId: live.hostId,
            },
            you: member,
            members,
            messages: live.messages,
            strokes: live.strokes,
            media: live.media,
            rejoined: reclaiming,
            rejoinGraceMs: REJOIN_GRACE_MS,
          });
        } catch (err: any) {
          console.error("room:join failed", err);
          ack?.({ ok: false, error: err?.message || "Failed to join room." });
        }
      }
    );

    socket.on(
      "room:chat",
      async (
        payload: {
          text?: string;
          boardImage?: string;
          attachment?: {
            kind?: string;
            name?: string;
            mime?: string;
            dataUrl?: string;
            size?: number;
          };
        },
        ack?: (result: unknown) => void
      ) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code) {
        ack?.({ ok: false, error: "Not in a room." });
        return;
      }
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      const rawAtt = payload?.attachment;
      let attachment:
        | {
            kind: "image" | "video" | "file";
            name: string;
            mime: string;
            dataUrl: string;
            size: number;
          }
        | undefined;

      if (rawAtt && typeof rawAtt.dataUrl === "string" && rawAtt.dataUrl.startsWith("data:")) {
        const dataUrl = rawAtt.dataUrl;
        // Rough size check on base64 payload
        if (dataUrl.length > MAX_ATTACHMENT_BYTES * 1.4) {
          ack?.({ ok: false, error: "File is too large (max about 12MB)." });
          return;
        }
        const mime =
          (typeof rawAtt.mime === "string" && rawAtt.mime) ||
          dataUrl.slice(5, dataUrl.indexOf(";")) ||
          "application/octet-stream";
        let kind: "image" | "video" | "file" = "file";
        if (rawAtt.kind === "image" || mime.startsWith("image/")) kind = "image";
        else if (rawAtt.kind === "video" || mime.startsWith("video/")) kind = "video";
        attachment = {
          kind,
          name: String(rawAtt.name || "file").slice(0, 120),
          mime: mime.slice(0, 120),
          dataUrl,
          size: Math.max(0, Number(rawAtt.size) || 0),
        };
      }

      if ((!text && !attachment) || text.length > 2000) {
        ack?.({ ok: false, error: "Invalid message." });
        return;
      }

      const member = snapshotMembers(code).find((m) => m.socketId === socket.id);
      if (!member) {
        ack?.({ ok: false, error: "Member not found." });
        return;
      }

      const message = pushMessage(code, {
        id: newId("msg"),
        userId: member.userId,
        name: member.name,
        text: text || (attachment ? `Shared ${attachment.kind}: ${attachment.name}` : ""),
        isAi: false,
        timestamp: new Date().toISOString(),
        attachment,
      });

      io.to(`room:${code}`).emit("room:chat", { message });
      ack?.({ ok: true, message });

      if (text && /@AI\b/i.test(text)) {
        io.to(`room:${code}`).emit("room:ai-typing", { typing: true });
        try {
          const live = getLiveRoom(code);
          const boardImage =
            typeof payload?.boardImage === "string" &&
            payload.boardImage.startsWith("data:image") &&
            payload.boardImage.length < 8_000_000
              ? payload.boardImage
              : undefined;
          const { reply, mode } = await generateRoomAiReply({
            message: text,
            topic: live?.topic,
            boardImage,
          });
          const aiMessage = pushMessage(code, {
            id: newId("ai"),
            userId: "ai-buddy",
            name: "AI Buddy",
            text: mode === "hint" ? `💡 ${reply}` : reply,
            isAi: true,
            timestamp: new Date().toISOString(),
          });
          io.to(`room:${code}`).emit("room:chat", { message: aiMessage });
        } catch (err: any) {
          const aiMessage = pushMessage(code, {
            id: newId("ai-err"),
            userId: "ai-buddy",
            name: "AI Buddy",
            text: `Sorry — I couldn't think straight for a second (${err?.message || "AI error"}). Try tagging @AI again.`,
            isAi: true,
            timestamp: new Date().toISOString(),
          });
          io.to(`room:${code}`).emit("room:chat", { message: aiMessage });
        } finally {
          io.to(`room:${code}`).emit("room:ai-typing", { typing: false });
        }
      }
    });

    socket.on(
      "room:chat-delete",
      (payload: { messageId?: string }, ack?: (r: unknown) => void) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const userId = (socket.data as { userId?: string }).userId;
        const messageId = typeof payload?.messageId === "string" ? payload.messageId : "";
        if (!code || !userId || !messageId) {
          ack?.({ ok: false, error: "Invalid request." });
          return;
        }
        const result = deleteMessage(code, messageId, userId);
        if (!result.ok) {
          ack?.(result);
          return;
        }
        io.to(`room:${code}`).emit("room:chat-deleted", { messageId: result.messageId });
        ack?.({ ok: true, messageId: result.messageId });
      }
    );

    socket.on(
      "room:chat-like",
      (payload: { messageId?: string }, ack?: (r: unknown) => void) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const userId = (socket.data as { userId?: string }).userId;
        const messageId = typeof payload?.messageId === "string" ? payload.messageId : "";
        if (!code || !userId || !messageId) {
          ack?.({ ok: false, error: "Invalid request." });
          return;
        }
        const result = toggleMessageLike(code, messageId, userId);
        if (!result.ok) {
          ack?.(result);
          return;
        }
        io.to(`room:${code}`).emit("room:chat-liked", {
          messageId: result.message.id,
          likedBy: result.message.likedBy || [],
        });
        ack?.({ ok: true, likedBy: result.message.likedBy || [] });
      }
    );

    socket.on("room:whiteboard-stroke", (stroke: WhiteboardStroke) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      const userId = (socket.data as { userId?: string }).userId;
      if (!code || !userId || !stroke?.id || !Array.isArray(stroke.points)) return;
      if (!memberCanDraw(code, userId)) return;
      const safe: WhiteboardStroke = {
        id: String(stroke.id).slice(0, 80),
        // Cap points so a long draw never floods the socket (keeps voice/signaling alive)
        points: stroke.points.slice(0, 800).map((p) => ({
          x: Number(p.x),
          y: Number(p.y),
          p: typeof p.p === "number" ? p.p : undefined,
        })),
        color: String(stroke.color || "#1a3324").slice(0, 32),
        width: Math.min(48, Math.max(1, Number(stroke.width) || 3)),
        tool: stroke.tool === "eraser" ? "eraser" : "pen",
        userId: String(stroke.userId || "").slice(0, 80),
        name: String(stroke.name || "").slice(0, 60),
      };
      pushStroke(code, safe);
      socket.to(`room:${code}`).emit("room:whiteboard-stroke", { stroke: safe });
    });

    socket.on("room:whiteboard-clear", () => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      const userId = (socket.data as { userId?: string }).userId;
      if (!code || !userId || !memberCanDraw(code, userId)) return;
      clearStrokes(code);
      io.to(`room:${code}`).emit("room:whiteboard-clear");
    });

    socket.on("room:whiteboard-media-add", (payload: WhiteboardMedia, ack?: (r: unknown) => void) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      const userId = (socket.data as { userId?: string }).userId;
      if (!code || !payload?.id) {
        ack?.({ ok: false, error: "Invalid media." });
        return;
      }
      if (!userId || !memberCanDraw(code, userId)) {
        ack?.({ ok: false, error: "Only the host (or students with board access) can edit the whiteboard." });
        return;
      }
      const live = getLiveRoom(code);
      if (live && live.media.length >= 20) {
        ack?.({ ok: false, error: "Board is full of media (max 20). Remove some first." });
        return;
      }
      const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
      const isText = payload.kind === "text";

      if (isText) {
        const text = String(payload.text || "").trim().slice(0, 2000);
        if (!text) {
          ack?.({ ok: false, error: "Text is empty." });
          return;
        }
        const item: WhiteboardMedia = {
          id: String(payload.id).slice(0, 80),
          kind: "text",
          name: text.slice(0, 80),
          mime: "text/plain",
          dataUrl: "",
          text,
          color: String(payload.color || "#1a3324").slice(0, 32),
          x: clamp(Number(payload.x) || 0.12, 0, 0.92),
          y: clamp(Number(payload.y) || 0.12, 0, 0.92),
          w: clamp(Number(payload.w) || 0.28, 0.08, 0.85),
          userId: String(payload.userId || "").slice(0, 80),
          userName: String(payload.userName || "").slice(0, 60),
        };
        upsertMedia(code, item);
        io.to(`room:${code}`).emit("room:whiteboard-media-add", { media: item });
        ack?.({ ok: true, media: item });
        return;
      }

      if (typeof payload.dataUrl !== "string" || !payload.dataUrl.startsWith("data:")) {
        ack?.({ ok: false, error: "Invalid media data." });
        return;
      }
      if (payload.dataUrl.length > MAX_ATTACHMENT_BYTES * 1.4) {
        ack?.({ ok: false, error: "File is too large for the board (max about 12MB)." });
        return;
      }
      const item: WhiteboardMedia = {
        id: String(payload.id).slice(0, 80),
        kind: payload.kind === "file" ? "file" : "image",
        name: String(payload.name || "file").slice(0, 120),
        mime: String(payload.mime || "application/octet-stream").slice(0, 120),
        dataUrl: payload.dataUrl,
        x: clamp(Number(payload.x) || 0.12, 0, 0.92),
        y: clamp(Number(payload.y) || 0.12, 0, 0.92),
        w: clamp(Number(payload.w) || 0.3, 0.08, 0.85),
        userId: String(payload.userId || "").slice(0, 80),
        userName: String(payload.userName || "").slice(0, 60),
      };
      upsertMedia(code, item);
      io.to(`room:${code}`).emit("room:whiteboard-media-add", { media: item });
      ack?.({ ok: true, media: item });
    });

    socket.on(
      "room:whiteboard-media-move",
      (payload: { id?: string; x?: number; y?: number }) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const userId = (socket.data as { userId?: string }).userId;
        if (!code || !payload?.id || !userId || !memberCanDraw(code, userId)) return;
        const item = moveMedia(code, String(payload.id), {
          x: Number(payload.x) || 0,
          y: Number(payload.y) || 0,
        });
        if (item) {
          socket.to(`room:${code}`).emit("room:whiteboard-media-move", {
            id: item.id,
            x: item.x,
            y: item.y,
          });
        }
      }
    );

    socket.on("room:whiteboard-media-remove", (payload: { id?: string }) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      const userId = (socket.data as { userId?: string }).userId;
      if (!code || !payload?.id || !userId || !memberCanDraw(code, userId)) return;
      if (removeMedia(code, String(payload.id))) {
        io.to(`room:${code}`).emit("room:whiteboard-media-remove", { id: payload.id });
      }
    });

    /** Host grants / revokes whiteboard edit access for a student */
    socket.on(
      "room:set-draw",
      (
        payload: { userId?: string; canDraw?: boolean },
        ack?: (result: unknown) => void
      ) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const myUserId = (socket.data as { userId?: string }).userId;
        if (!code || !myUserId) {
          ack?.({ ok: false, error: "Not in a room." });
          return;
        }
        const live = getLiveRoom(code);
        if (!live || live.hostId !== myUserId) {
          ack?.({ ok: false, error: "Only the host can change board permissions." });
          return;
        }
        const targetUserId = String(payload?.userId || "");
        if (!targetUserId || targetUserId === live.hostId) {
          ack?.({ ok: false, error: "Invalid student." });
          return;
        }
        const members = setMemberCanDraw(code, targetUserId, Boolean(payload?.canDraw));
        if (!members) {
          ack?.({ ok: false, error: "Student not found." });
          return;
        }
        io.to(`room:${code}`).emit("room:members", { members });
        const target = members.find((m) => m.userId === targetUserId);
        if (target) {
          const note = pushMessage(code, {
            id: newId("sys"),
            userId: "system",
            name: "Room",
            text: payload?.canDraw
              ? `${target.name} can now use the whiteboard.`
              : `${target.name}'s whiteboard access was revoked.`,
            isAi: false,
            timestamp: new Date().toISOString(),
          });
          io.to(`room:${code}`).emit("room:chat", { message: note });
        }
        ack?.({ ok: true, members });
      }
    );

    /** Host force-mute / unmute a student */
    socket.on(
      "room:host-mute",
      (
        payload: { userId?: string; muted?: boolean },
        ack?: (result: unknown) => void
      ) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const myUserId = (socket.data as { userId?: string }).userId;
        if (!code || !myUserId) {
          ack?.({ ok: false, error: "Not in a room." });
          return;
        }
        const live = getLiveRoom(code);
        if (!live || live.hostId !== myUserId) {
          ack?.({ ok: false, error: "Only the host can mute students." });
          return;
        }
        const targetUserId = String(payload?.userId || "");
        if (!targetUserId || targetUserId === live.hostId) {
          ack?.({ ok: false, error: "Invalid student." });
          return;
        }
        const muted = Boolean(payload?.muted);
        const result = setMemberForceMuted(code, targetUserId, muted);
        if (!result) {
          ack?.({ ok: false, error: "Student not found." });
          return;
        }
        const { members, target } = result;
        if (target) {
          io.to(target.socketId).emit("voice:force-mute", {
            muted,
            reason: muted
              ? "The host muted your microphone."
              : "The host unmuted you — you can join voice again.",
          });
          if (muted) {
            io.to(`room:${code}`).emit("voice:left", { socketId: target.socketId });
          }
        }
        io.to(`room:${code}`).emit("room:members", { members });
        ack?.({ ok: true, members });
      }
    );

    /** Host mute / unmute every student at once (handy at 10 capacity) */
    socket.on(
      "room:host-mute-all",
      (
        payload: { muted?: boolean },
        ack?: (result: unknown) => void
      ) => {
        const code = (socket.data as { roomCode?: string }).roomCode;
        const myUserId = (socket.data as { userId?: string }).userId;
        if (!code || !myUserId) {
          ack?.({ ok: false, error: "Not in a room." });
          return;
        }
        const live = getLiveRoom(code);
        if (!live || live.hostId !== myUserId) {
          ack?.({ ok: false, error: "Only the host can mute students." });
          return;
        }
        const muted = Boolean(payload?.muted);
        const guests = snapshotMembers(code).filter((m) => m.userId !== live.hostId);
        for (const g of guests) {
          const result = setMemberForceMuted(code, g.userId, muted);
          if (!result?.target) continue;
          io.to(result.target.socketId).emit("voice:force-mute", {
            muted,
            reason: muted
              ? "The host muted everyone."
              : "The host unmuted everyone — you can join voice again.",
          });
          if (muted) {
            io.to(`room:${code}`).emit("voice:left", { socketId: result.target.socketId });
          }
        }
        const members = snapshotMembers(code);
        io.to(`room:${code}`).emit("room:members", { members });
        ack?.({ ok: true, members, count: guests.length });
      }
    );

    socket.on("room:mute", (payload: { muted?: boolean }) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code) return;
      const members = snapshotMembers(code);
      const me = members.find((m) => m.socketId === socket.id);
      if (!me) return;
      // Host force-mute cannot be overridden by the student
      if (me.forceMuted && !payload?.muted) return;
      me.muted = Boolean(payload?.muted);
      io.to(`room:${code}`).emit("room:members", { members: snapshotMembers(code) });
    });

    /** Join the voice mesh — returns peer socket ids already in voice */
    socket.on("voice:join", (_payload: unknown, ack?: (result: unknown) => void) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code) {
        ack?.({ ok: false, error: "Not in a room." });
        return;
      }
      const members = snapshotMembers(code);
      const me = members.find((m) => m.socketId === socket.id);
      if (!me) {
        ack?.({ ok: false, error: "Member not found." });
        return;
      }
      if (me.forceMuted) {
        ack?.({ ok: false, error: "The host muted you. Wait to be unmuted." });
        return;
      }
      me.inVoice = true;
      me.muted = false;
      const peerIds = members.filter((m) => m.inVoice && m.socketId !== socket.id).map((m) => m.socketId);
      socket.to(`room:${code}`).emit("voice:ready", { socketId: socket.id, peerIds: [socket.id] });
      io.to(`room:${code}`).emit("room:members", { members: snapshotMembers(code) });
      ack?.({ ok: true, peerIds });
    });

    socket.on("voice:leave", () => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code) return;
      const me = snapshotMembers(code).find((m) => m.socketId === socket.id);
      if (me) {
        me.inVoice = false;
        me.muted = true;
      }
      socket.to(`room:${code}`).emit("voice:left", { socketId: socket.id });
      io.to(`room:${code}`).emit("room:members", { members: snapshotMembers(code) });
    });

    /** Host-only: kick a student out of the room */
    socket.on(
      "room:kick",
      (
        payload: { socketId?: string; userId?: string },
        ack?: (result: unknown) => void
      ) => {
        const code = (socket.data as { roomCode?: string; userId?: string }).roomCode;
        const myUserId = (socket.data as { userId?: string }).userId;
        if (!code || !myUserId) {
          ack?.({ ok: false, error: "Not in a room." });
          return;
        }
        const live = getLiveRoom(code);
        if (!live || live.hostId !== myUserId) {
          ack?.({ ok: false, error: "Only the room host can kick students." });
          return;
        }

        const target =
          snapshotMembers(code).find(
            (m) =>
              (payload?.socketId && m.socketId === payload.socketId) ||
              (payload?.userId && m.userId === payload.userId)
          ) || null;

        if (!target) {
          ack?.({ ok: false, error: "Student not found in this room." });
          return;
        }
        if (target.userId === live.hostId) {
          ack?.({ ok: false, error: "You can't kick yourself." });
          return;
        }

        const targetSocket = io.sockets.sockets.get(target.socketId);
        if (targetSocket) {
          (targetSocket.data as { hardLeave?: boolean }).hardLeave = true;
          targetSocket.emit("room:kicked", {
            reason: "The room host removed you from this study group.",
          });
          leaveCurrentRoom(io, targetSocket, { hard: true });
          targetSocket.disconnect(true);
        } else {
          const members = hardLeaveMember(code, target.socketId);
          io.to(`room:${code}`).emit("room:member-left", {
            socketId: target.socketId,
            members,
          });
        }

        const kickMsg = pushMessage(code, {
          id: newId("sys"),
          userId: "system",
          name: "Room",
          text: `${target.name} was removed by the host.`,
          isAi: false,
          timestamp: new Date().toISOString(),
        });
        io.to(`room:${code}`).emit("room:chat", { message: kickMsg });
        ack?.({ ok: true });
      }
    );

    // WebRTC signaling for mesh voice (≤10 peers)
    socket.on("webrtc:offer", (payload: { toSocketId?: string; sdp?: unknown }) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code || !payload?.toSocketId || !payload?.sdp) return;
      io.to(payload.toSocketId).emit("webrtc:offer", {
        fromSocketId: socket.id,
        sdp: payload.sdp,
      });
    });

    socket.on("webrtc:answer", (payload: { toSocketId?: string; sdp?: unknown }) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code || !payload?.toSocketId || !payload?.sdp) return;
      io.to(payload.toSocketId).emit("webrtc:answer", {
        fromSocketId: socket.id,
        sdp: payload.sdp,
      });
    });

    socket.on("webrtc:ice", (payload: { toSocketId?: string; candidate?: unknown }) => {
      const code = (socket.data as { roomCode?: string }).roomCode;
      if (!code || !payload?.toSocketId) return;
      io.to(payload.toSocketId).emit("webrtc:ice", {
        fromSocketId: socket.id,
        candidate: payload.candidate,
      });
    });

    socket.on("room:leave", () => {
      leaveCurrentRoom(io, socket, { hard: false });
    });

    socket.on("disconnect", () => {
      if ((socket.data as { skipLeave?: boolean }).skipLeave) return;
      leaveCurrentRoom(io, socket, {
        hard: Boolean((socket.data as { hardLeave?: boolean }).hardLeave),
      });
    });
  });

  return io;
}

function leaveCurrentRoom(
  io: Server,
  socket: Socket,
  opts?: { hard?: boolean }
): void {
  const code =
    (socket.data as { roomCode?: string }).roomCode || findMemberRoom(socket.id);
  if (!code) return;

  const leaving = snapshotMembers(code).find((m) => m.socketId === socket.id);
  if (!leaving) {
    socket.leave(`room:${code}`);
    (socket.data as { roomCode?: string }).roomCode = undefined;
    return;
  }

  const wasInVoice = Boolean(leaving.inVoice);
  const hard = Boolean(opts?.hard);

  let members = snapshotMembers(code);
  if (hard) {
    members = hardLeaveMember(code, socket.id);
  } else {
    const result = softLeaveMember(code, socket.id, ({ userId, name }) => {
      // Grace expired — announce permanent leave if they never came back
      if (!getLiveRoom(code)) return;
      if ([...snapshotMembers(code)].some((m) => m.userId === userId)) return;
      const msg = pushMessage(code, {
        id: newId("sys"),
        userId: "system",
        name: "Room",
        text: `${name} left the room.`,
        isAi: false,
        timestamp: new Date().toISOString(),
      });
      io.to(`room:${code}`).emit("room:chat", { message: msg });
    });
    members = result.members;

    if (result.left) {
      const awayMsg = pushMessage(code, {
        id: newId("sys"),
        userId: "system",
        name: "Room",
        text: `${result.left.name} left — they can rejoin within 1 minute.`,
        isAi: false,
        timestamp: new Date().toISOString(),
      });
      io.to(`room:${code}`).emit("room:chat", { message: awayMsg });
    }
  }

  socket.leave(`room:${code}`);
  (socket.data as { roomCode?: string }).roomCode = undefined;

  if (wasInVoice) {
    io.to(`room:${code}`).emit("voice:left", { socketId: socket.id });
  }
  io.to(`room:${code}`).emit("room:member-left", {
    socketId: socket.id,
    members,
  });
}
