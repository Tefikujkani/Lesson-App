export type RoomMember = {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  muted: boolean;
  /** Host silenced this student — they cannot turn their mic back on until unmuted */
  forceMuted?: boolean;
  /** Allowed to draw / edit the shared whiteboard (host always true) */
  canDraw?: boolean;
  inVoice?: boolean;
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

export type WhiteboardStroke = {
  id: string;
  points: Array<{ x: number; y: number; p?: number }>;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  userId: string;
  name: string;
};

/** Image, file chip, or typed text on the shared board (normalized 0–1 coords) */
export type WhiteboardMedia = {
  id: string;
  kind: "image" | "file" | "text";
  name: string;
  mime: string;
  dataUrl: string;
  /** Typed board text (kind === "text") */
  text?: string;
  /** Text / stroke color */
  color?: string;
  /** Top-left X (0–1 of board width) */
  x: number;
  /** Top-left Y (0–1 of board height) */
  y: number;
  /** Width relative to board (0–1) */
  w: number;
  userId: string;
  userName: string;
};

export type StudyRoomInfo = {
  code: string;
  name: string;
  topic: string;
  hostId: string;
  hostName?: string;
  maxParticipants?: number;
  participantCount?: number;
  seatsLeft?: number;
  joinPath?: string;
  joinUrl?: string;
};
