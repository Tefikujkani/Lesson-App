import express, { Router } from "express";
import { handleStudyChat } from "../controllers/chatController.ts";
import { generateLectureQuiz } from "../controllers/quizController.ts";
import { analyzeFileContent } from "../controllers/fileController.ts";
import { register, login, guestLogin, me, googleAuth, getAuthConfig, deleteAccount } from "../controllers/authController.ts";
import {
  getCurriculum,
  saveCurriculum,
  deleteCurriculum,
  getChatHistory,
  saveChatHistory,
} from "../controllers/curriculumController.ts";
import { requireAuth, optionalAuth } from "../middleware/auth.ts";
import { createRoom, getRoomByCode } from "../controllers/roomController.ts";
import { askRoomAi } from "../controllers/roomAiController.ts";

const router: Router = express.Router();

/** Auth */
router.get("/auth/config", getAuthConfig);
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/google", googleAuth);
router.post("/auth/guest", guestLogin);
router.get("/auth/me", requireAuth, me);
router.delete("/auth/me", requireAuth, deleteAccount);

/** Curriculum (MongoDB) */
router.get("/curriculum", requireAuth, getCurriculum);
router.put("/curriculum", requireAuth, saveCurriculum);
router.delete("/curriculum", requireAuth, deleteCurriculum);

/** Chat history (MongoDB) */
router.get("/chat/:lectureId", requireAuth, getChatHistory);
router.put("/chat/:lectureId", requireAuth, saveChatHistory);

/** Group Study Rooms */
router.post("/rooms", requireAuth, createRoom);
router.get("/rooms/:code", requireAuth, getRoomByCode);
router.post("/rooms/ai", requireAuth, askRoomAi);

/**
 * AI routes — optional auth so guest demos still work;
 * when logged in, chat replies can be associated with the user later.
 */
router.post("/chat", optionalAuth, handleStudyChat);
router.post("/quiz", optionalAuth, generateLectureQuiz);
router.post("/analyze-file", optionalAuth, analyzeFileContent);

export default router;
