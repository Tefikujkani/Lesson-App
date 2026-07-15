import { MAX_ROOM_PARTICIPANTS } from "../models/StudyRoom.ts";

/** How long a seat + board state is kept after someone leaves/disconnects */
export const REJOIN_GRACE_MS = 60_000;

export type RoomMember = {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  muted: boolean;
  /** Host silenced this student — blocks voice:join until cleared */
  forceMuted: boolean;
  /** Allowed to draw / edit the shared whiteboard (host always true) */
  canDraw: boolean;
  inVoice: boolean;
  joinedAt: string;
};

export type RoomAttachment = {
  kind: "image" | "video" | "file";
  name: string;
  mime: string;
  dataUrl: string;
  size: number;
};

export type RoomChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  isAi: boolean;
  timestamp: string;
  attachment?: RoomAttachment;
  /** userIds who gave a 👍 like */
  likedBy?: string[];
};

/** Compact stroke payload for shared whiteboard sync */
export type WhiteboardStroke = {
  id: string;
  points: Array<{ x: number; y: number; p?: number }>;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  userId: string;
  name: string;
};

export type WhiteboardMedia = {
  id: string;
  kind: "image" | "file" | "text";
  name: string;
  mime: string;
  dataUrl: string;
  text?: string;
  color?: string;
  x: number;
  y: number;
  w: number;
  userId: string;
  userName: string;
};

type ReservedSeat = {
  userId: string;
  name: string;
  avatarUrl?: string;
  leftAt: number;
  timer: ReturnType<typeof setTimeout>;
};

type LiveRoom = {
  code: string;
  name: string;
  topic: string;
  hostId: string;
  members: Map<string, RoomMember>; // socketId -> member
  /** Soft-left users who can reclaim within REJOIN_GRACE_MS */
  reserved: Map<string, ReservedSeat>; // userId -> seat
  /** Extra students granted whiteboard edit access (host always can) */
  drawAllowed: Set<string>; // userId
  /** Students silenced by the host */
  forceMuted: Set<string>; // userId
  messages: RoomChatMessage[];
  strokes: WhiteboardStroke[];
  media: WhiteboardMedia[];
};

const rooms = new Map<string, LiveRoom>();

export function getOrCreateLiveRoom(meta: {
  code: string;
  name: string;
  topic: string;
  hostId: string;
}): LiveRoom {
  const key = meta.code.toUpperCase();
  let room = rooms.get(key);
  if (!room) {
    room = {
      code: key,
      name: meta.name,
      topic: meta.topic,
      hostId: meta.hostId,
      members: new Map(),
      reserved: new Map(),
      drawAllowed: new Set(),
      forceMuted: new Set(),
      messages: [],
      strokes: [],
      media: [],
    };
    rooms.set(key, room);
  } else {
    room.name = meta.name;
    room.topic = meta.topic;
    room.hostId = meta.hostId;
    if (!room.drawAllowed) room.drawAllowed = new Set();
    if (!room.forceMuted) room.forceMuted = new Set();
  }
  return room;
}

export function memberCanDraw(code: string, userId: string): boolean {
  const room = getLiveRoom(code);
  if (!room) return false;
  if (room.hostId === userId) return true;
  return room.drawAllowed.has(userId);
}

export function setMemberCanDraw(
  code: string,
  userId: string,
  canDraw: boolean
): RoomMember[] | null {
  const room = getLiveRoom(code);
  if (!room || room.hostId === userId) return null;
  if (canDraw) room.drawAllowed.add(userId);
  else room.drawAllowed.delete(userId);
  for (const m of room.members.values()) {
    if (m.userId === userId) m.canDraw = canDraw;
  }
  return snapshotMembers(code);
}

export function setMemberForceMuted(
  code: string,
  userId: string,
  forceMuted: boolean
): { members: RoomMember[]; target: RoomMember | null } | null {
  const room = getLiveRoom(code);
  if (!room || room.hostId === userId) return null;
  if (forceMuted) room.forceMuted.add(userId);
  else room.forceMuted.delete(userId);
  let target: RoomMember | null = null;
  for (const m of room.members.values()) {
    if (m.userId !== userId) continue;
    m.forceMuted = forceMuted;
    if (forceMuted) {
      m.muted = true;
      m.inVoice = false;
    }
    target = m;
  }
  return { members: snapshotMembers(code), target };
}

export function resolveMemberFlags(
  code: string,
  userId: string
): { canDraw: boolean; forceMuted: boolean } {
  const room = getLiveRoom(code);
  if (!room) return { canDraw: false, forceMuted: false };
  return {
    canDraw: room.hostId === userId || room.drawAllowed.has(userId),
    forceMuted: room.forceMuted.has(userId),
  };
}

export function getLiveRoom(code: string): LiveRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomLiveCount(code: string): number {
  const room = getLiveRoom(code);
  if (!room) return 0;
  return room.members.size + room.reserved.size;
}

export function canJoinRoom(
  code: string,
  userId?: string
): { ok: boolean; reason?: string; count: number } {
  const room = getLiveRoom(code);
  if (!room) return { ok: true, count: 0 };

  // Same user reclaiming an active or reserved seat is always allowed
  if (userId) {
    const alreadyIn = [...room.members.values()].some((m) => m.userId === userId);
    if (alreadyIn || room.reserved.has(userId)) {
      return { ok: true, count: getRoomLiveCount(code) };
    }
  }

  const count = getRoomLiveCount(code);
  if (count >= MAX_ROOM_PARTICIPANTS) {
    return {
      ok: false,
      reason: `This room is full (max ${MAX_ROOM_PARTICIPANTS} students).`,
      count,
    };
  }
  return { ok: true, count };
}

export function addMember(code: string, member: RoomMember): RoomMember[] {
  const room = getLiveRoom(code);
  if (!room) return [];
  cancelReservation(code, member.userId);
  room.members.set(member.socketId, member);
  return [...room.members.values()];
}

/**
 * Soft leave: free the live seat but reserve it for REJOIN_GRACE_MS so the
 * student (and board/chat) can come back without a hard rejoin.
 */
export function softLeaveMember(
  code: string,
  socketId: string,
  onGraceExpired: (info: { userId: string; name: string }) => void
): { members: RoomMember[]; left: RoomMember | null; reserved: boolean } {
  const room = getLiveRoom(code);
  if (!room) return { members: [], left: null, reserved: false };

  const left = room.members.get(socketId) || null;
  if (!left) {
    return { members: [...room.members.values()], left: null, reserved: false };
  }

  room.members.delete(socketId);

  // Replace any previous reservation for this user
  cancelReservation(code, left.userId);

  const timer = setTimeout(() => {
    const live = getLiveRoom(code);
    if (!live) return;
    const seat = live.reserved.get(left.userId);
    if (!seat) return;
    live.reserved.delete(left.userId);
    onGraceExpired({ userId: left.userId, name: left.name });
    maybePurgeEmptyRoom(code);
  }, REJOIN_GRACE_MS);

  room.reserved.set(left.userId, {
    userId: left.userId,
    name: left.name,
    avatarUrl: left.avatarUrl,
    leftAt: Date.now(),
    timer,
  });

  return { members: [...room.members.values()], left, reserved: true };
}

/** Hard leave (kick / unknown): no rejoin reservation. */
export function hardLeaveMember(code: string, socketId: string): RoomMember[] {
  const room = getLiveRoom(code);
  if (!room) return [];
  const left = room.members.get(socketId);
  if (left) {
    cancelReservation(code, left.userId);
    room.members.delete(socketId);
  } else {
    room.members.delete(socketId);
  }
  maybePurgeEmptyRoom(code);
  return [...(getLiveRoom(code)?.members.values() ?? [])];
}

export function cancelReservation(code: string, userId: string): boolean {
  const room = getLiveRoom(code);
  if (!room) return false;
  const seat = room.reserved.get(userId);
  if (!seat) return false;
  clearTimeout(seat.timer);
  room.reserved.delete(userId);
  return true;
}

export function hasReservation(code: string, userId: string): boolean {
  return Boolean(getLiveRoom(code)?.reserved.has(userId));
}

function maybePurgeEmptyRoom(code: string): void {
  const room = getLiveRoom(code);
  if (!room) return;
  if (room.members.size === 0 && room.reserved.size === 0) {
    rooms.delete(code.toUpperCase());
  }
}

export function removeMember(code: string, socketId: string): RoomMember[] {
  // Back-compat helper: hard remove
  return hardLeaveMember(code, socketId);
}

export function findMemberRoom(socketId: string): string | null {
  for (const [code, room] of rooms) {
    if (room.members.has(socketId)) return code;
  }
  return null;
}

export function pushMessage(code: string, message: RoomChatMessage): RoomChatMessage {
  const room = getLiveRoom(code);
  if (!room) return message;
  room.messages.push(message);
  if (room.messages.length > 200) {
    room.messages = room.messages.slice(-160);
  }
  return message;
}

export function deleteMessage(
  code: string,
  messageId: string,
  requesterId: string
): { ok: true; messageId: string } | { ok: false; error: string } {
  const room = getLiveRoom(code);
  if (!room) return { ok: false, error: "Room not found." };
  const idx = room.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return { ok: false, error: "Message not found." };
  const msg = room.messages[idx];
  if (msg.userId === "system" || msg.isAi) {
    return { ok: false, error: "That message can't be deleted." };
  }
  if (msg.userId !== requesterId) {
    return { ok: false, error: "You can only delete your own messages." };
  }
  room.messages.splice(idx, 1);
  return { ok: true, messageId };
}

export function toggleMessageLike(
  code: string,
  messageId: string,
  userId: string
): { ok: true; message: RoomChatMessage } | { ok: false; error: string } {
  const room = getLiveRoom(code);
  if (!room) return { ok: false, error: "Room not found." };
  const msg = room.messages.find((m) => m.id === messageId);
  if (!msg) return { ok: false, error: "Message not found." };
  if (msg.userId === "system") {
    return { ok: false, error: "Can't like system messages." };
  }
  const likedBy = msg.likedBy ? [...msg.likedBy] : [];
  const i = likedBy.indexOf(userId);
  if (i >= 0) likedBy.splice(i, 1);
  else likedBy.push(userId);
  msg.likedBy = likedBy;
  return { ok: true, message: msg };
}

export function pushStroke(code: string, stroke: WhiteboardStroke): void {
  const room = getLiveRoom(code);
  if (!room) return;
  room.strokes.push(stroke);
  if (room.strokes.length > 2000) {
    room.strokes = room.strokes.slice(-1500);
  }
}

export function clearStrokes(code: string): void {
  const room = getLiveRoom(code);
  if (room) {
    room.strokes = [];
    room.media = [];
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function upsertMedia(code: string, item: WhiteboardMedia): void {
  const room = getLiveRoom(code);
  if (!room) return;
  const idx = room.media.findIndex((m) => m.id === item.id);
  if (idx >= 0) room.media[idx] = item;
  else {
    room.media.push(item);
    if (room.media.length > 24) room.media = room.media.slice(-20);
  }
}

export function moveMedia(
  code: string,
  id: string,
  pos: { x: number; y: number }
): WhiteboardMedia | null {
  const room = getLiveRoom(code);
  if (!room) return null;
  const item = room.media.find((m) => m.id === id);
  if (!item) return null;
  item.x = clamp(pos.x, 0, 0.92);
  item.y = clamp(pos.y, 0, 0.92);
  return item;
}

export function removeMedia(code: string, id: string): boolean {
  const room = getLiveRoom(code);
  if (!room) return false;
  const before = room.media.length;
  room.media = room.media.filter((m) => m.id !== id);
  return room.media.length < before;
}

export function snapshotMembers(code: string): RoomMember[] {
  return [...(getLiveRoom(code)?.members.values() ?? [])];
}

export { MAX_ROOM_PARTICIPANTS };
