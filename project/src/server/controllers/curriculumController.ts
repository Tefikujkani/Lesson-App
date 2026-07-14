import { Response, NextFunction } from "express";
import { Subject, ILecture } from "../models/Subject.ts";
import { ChatHistory } from "../models/ChatHistory.ts";
import { AuthedRequest } from "../middleware/auth.ts";

function serializeSubject(doc: {
  id: string;
  name: string;
  icon: string;
  lectures: ILecture[];
}) {
  return {
    id: doc.id,
    name: doc.name,
    icon: doc.icon,
    lectures: doc.lectures.map((lec) => ({
      id: lec.id,
      title: lec.title,
      content: lec.content,
      fileName: lec.fileName,
      fileType: lec.fileType,
      fileDataUrl: lec.fileDataUrl,
      originalText: lec.originalText,
    })),
  };
}

export async function getCurriculum(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const subjects = await Subject.find({ userId: req.user.userId }).sort({ createdAt: 1 });
    res.json({ subjects: subjects.map(serializeSubject) });
  } catch (error) {
    next(error);
  }
}

/** Replace the user's full curriculum (subjects + lectures) in one write. */
export async function saveCurriculum(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subjects } = req.body;
    if (!Array.isArray(subjects)) {
      res.status(400).json({ error: "Request body must include a 'subjects' array." });
      return;
    }

    const userId = req.user.userId;

    // Full replace keeps the UI model simple (same shape as localStorage)
    await Subject.deleteMany({ userId });

    if (subjects.length > 0) {
      const docs = subjects.map((sub: any) => ({
        userId,
        id: String(sub.id),
        name: String(sub.name || "Untitled Subject"),
        icon: String(sub.icon || "GraduationCap"),
        lectures: Array.isArray(sub.lectures)
          ? sub.lectures.map((lec: any) => ({
              id: String(lec.id),
              title: String(lec.title || "Untitled Lecture"),
              content: String(lec.content || ""),
              fileName: lec.fileName ? String(lec.fileName) : undefined,
              fileType: lec.fileType === "image" || lec.fileType === "pdf" || lec.fileType === "text"
                ? lec.fileType
                : undefined,
              fileDataUrl: lec.fileDataUrl ? String(lec.fileDataUrl) : undefined,
              originalText: lec.originalText ? String(lec.originalText) : undefined,
            }))
          : [],
      }));

      await Subject.insertMany(docs);
    }

    const saved = await Subject.find({ userId }).sort({ createdAt: 1 });
    res.json({ subjects: saved.map(serializeSubject) });
  } catch (error: any) {
    if (error?.code === 10334 || error?.message?.includes("too large")) {
      res.status(413).json({
        error: "Document too large",
        message: "Uploaded file data exceeds MongoDB's 16MB document limit. Try a smaller file or text-only notes.",
      });
      return;
    }
    next(error);
  }
}

export async function deleteCurriculum(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;
    await Subject.deleteMany({ userId });
    await ChatHistory.deleteMany({ userId });
    res.json({ subjects: [] });
  } catch (error) {
    next(error);
  }
}

export async function getChatHistory(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lectureId = String(req.params.lectureId || "");
    if (!lectureId) {
      res.status(400).json({ error: "lectureId is required." });
      return;
    }

    const history = await ChatHistory.findOne({ userId: req.user.userId, lectureId });
    res.json({ messages: history?.messages ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function saveChatHistory(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lectureId = String(req.params.lectureId || "");
    const { messages } = req.body;

    if (!lectureId) {
      res.status(400).json({ error: "lectureId is required." });
      return;
    }
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "messages must be an array." });
      return;
    }

    // Keep last 100 messages per lecture to avoid unbounded growth
    const trimmed = messages.slice(-100).map((m: any) => ({
      id: String(m.id),
      sender: m.sender === "student" ? "student" : "tutor",
      text: String(m.text || ""),
      timestamp: String(m.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
    }));

    const history = await ChatHistory.findOneAndUpdate(
      { userId: req.user.userId, lectureId },
      { $set: { messages: trimmed } },
      { upsert: true, new: true }
    );

    res.json({ messages: history.messages });
  } catch (error) {
    next(error);
  }
}
