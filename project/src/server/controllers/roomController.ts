import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth.ts";
import { StudyRoom, MAX_ROOM_PARTICIPANTS } from "../models/StudyRoom.ts";
import { getRoomLiveCount } from "../realtime/roomState.ts";

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/** Create a new group study room (linkable by code). */
export async function createRoom(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", message: "Login required to create a study room." });
      return;
    }

    const nameRaw = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const topicRaw = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    if (!nameRaw || !topicRaw) {
      res.status(400).json({
        error: "Bad Request",
        message: "Room name and study topic are required.",
      });
      return;
    }
    const name = nameRaw;
    const topic = topicRaw.slice(0, 200);

    let code = generateRoomCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      const exists = await StudyRoom.findOne({ code }).lean();
      if (!exists) break;
      code = generateRoomCode();
    }

    const room = await StudyRoom.create({
      code,
      name: name.slice(0, 80),
      topic,
      hostId: req.user.userId,
      hostName: (typeof req.body?.hostName === "string" && req.body.hostName.trim()) || req.user.email,
    });

    const joinPath = `/#/room/${room.code}`;
    res.status(201).json({
      id: room.id,
      code: room.code,
      name: room.name,
      topic: room.topic,
      hostId: room.hostId,
      hostName: room.hostName,
      maxParticipants: MAX_ROOM_PARTICIPANTS,
      joinPath,
      joinUrl: `${req.protocol}://${req.get("host")}${joinPath}`,
    });
  } catch (err) {
    next(err);
  }
}

/** Look up a room by invite code (does not join). */
export async function getRoomByCode(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: "Bad Request", message: "Room code is required." });
      return;
    }

    const room = await StudyRoom.findOne({ code, isActive: true }).lean();
    if (!room) {
      res.status(404).json({ error: "Not Found", message: "This study room was not found or is closed." });
      return;
    }

    const liveCount = getRoomLiveCount(code);
    res.json({
      id: String(room._id),
      code: room.code,
      name: room.name,
      topic: room.topic,
      hostId: room.hostId,
      hostName: room.hostName,
      maxParticipants: MAX_ROOM_PARTICIPANTS,
      participantCount: liveCount,
      seatsLeft: Math.max(0, MAX_ROOM_PARTICIPANTS - liveCount),
      joinPath: `/#/room/${room.code}`,
    });
  } catch (err) {
    next(err);
  }
}
