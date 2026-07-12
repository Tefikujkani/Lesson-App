import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import apiRouter from "./src/server/routes/api.ts";
import { connectDatabase } from "./src/server/config/db.ts";

// Load .env then .env.local (local overrides)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

function extractGeminiErrorMessage(err: any): string | null {
  const raw = String(err?.message || err || "");
  try {
    const parsed = JSON.parse(raw);
    const nested = parsed?.error?.message || parsed?.message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  } catch {
    // not JSON — fall through
  }
  if (/Gemini API|FAILED_PRECONDITION|RESOURCE_EXHAUSTED|PERMISSION_DENIED/i.test(raw)) {
    return raw;
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Enable CORS with support for local development clients
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // Parse incoming JSON request payloads with a larger size limit
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Connect MongoDB before accepting traffic
  try {
    await connectDatabase();
  } catch (err: any) {
    console.error("MongoDB connection failed:", err.message);
    console.error("Set MONGODB_URI in frontend/.env and restart.");
    process.exit(1);
  }

  // Mount API router
  app.use("/api", apiRouter);

  // Simple API health check endpoint
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Serve Frontend with Vite (Dev vs Production)
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static files from the Vite production build folder
    app.use(express.static(distPath));
    
    // All other GET requests fall back to React Router / index.html
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error-Handling Middleware (Ensures process safety and provides clean errors)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Express Error Handler caught exception:", err);
    
    // Check if it is a missing AI key failure
    if (err.message && (err.message.includes("GEMINI_API_KEY") || err.message.includes("GROQ_API_KEY"))) {
      res.status(500).json({
        error: "Missing API Credentials",
        message: "The AI API key is missing. Please configure GROQ_API_KEY in your .env file.",
      });
      return;
    }

    if (err.message && err.message.includes("MONGODB_URI")) {
      res.status(500).json({
        error: "Missing Database Credentials",
        message: "MONGODB_URI is missing. Please configure it in your .env file.",
      });
      return;
    }

    // Unwrap Gemini / Groq JSON error payloads into a readable message
    const geminiMessage = extractGeminiErrorMessage(err);
    if (geminiMessage) {
      const isBilling =
        /billing|free tier|FAILED_PRECONDITION|not available in your country/i.test(geminiMessage);
      res.status(isBilling ? 402 : (err.status || 502)).json({
        error: isBilling ? "AI Billing Required" : "AI API Error",
        message: geminiMessage,
      });
      return;
    }

    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred in the study hub backend.",
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start the study hub server:", err);
  process.exit(1);
});
