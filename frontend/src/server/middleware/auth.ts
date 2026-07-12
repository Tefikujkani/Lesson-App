import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined. Add it to your .env file.");
  }
  return secret;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized", message: "Missing or invalid Authorization header." });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (error: any) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token." });
  }
}

/** Optional auth — attaches user when token is present, otherwise continues anonymously. */
export function optionalAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next();
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch {
    next();
  }
}
