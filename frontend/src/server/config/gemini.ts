import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load .env then .env.local (local overrides)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

/**
 * Lazy initialization of the Google Gen AI client.
 * Using lazy initialization ensures that if the GEMINI_API_KEY is not defined yet,
 * it won't crash the server on startup, but will fail fast when a request is made.
 */
let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please set it in Settings > Secrets or .env file.");
    }
    
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}
