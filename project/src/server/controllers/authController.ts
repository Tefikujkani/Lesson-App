import { Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.ts";
import { AuthedRequest, signToken } from "../middleware/auth.ts";

const SALT_ROUNDS = 10;

function publicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  major: string;
  avatarUrl?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    major: user.major,
    avatarUrl: user.avatarUrl,
  };
}

async function verifyGoogleIdToken(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "GOOGLE_CLIENT_ID is not configured. Add it to project/.env from Google Cloud Console."
    );
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(data?.error_description || "Invalid Google sign-in token."), {
      status: 401,
    });
  }

  if (data.aud !== clientId) {
    throw Object.assign(new Error("Google token audience mismatch. Check GOOGLE_CLIENT_ID."), {
      status: 401,
    });
  }

  if (data.email_verified !== "true" && data.email_verified !== true) {
    throw Object.assign(new Error("Google email is not verified."), { status: 401 });
  }

  if (!data.email || !data.sub) {
    throw Object.assign(new Error("Google account is missing email."), { status: 401 });
  }

  return {
    googleId: String(data.sub),
    email: String(data.email).toLowerCase(),
    name: String(data.name || data.email.split("@")[0]),
    picture: data.picture ? String(data.picture) : undefined,
  };
}

export async function getAuthConfig(_req: AuthedRequest, res: Response): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  res.json({
    googleClientId: clientId,
  });
}

export async function register(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, major } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(409).json({
        error: existing.googleId
          ? "This email already uses Google sign-in. Click Continue with Google."
          : "An account with this email already exists.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      major: typeof major === "string" && major.trim() ? major.trim() : "Student",
    });

    const token = signToken({ userId: String(user._id), email: user.email });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function login(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({
        error: "This account uses Google sign-in. Please continue with Google.",
      });
      return;
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const token = signToken({ userId: String(user._id), email: user.email });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}

/** Sign in or sign up with a Google ID token from Gmail / Google account picker. */
export async function googleAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "Missing Google idToken." });
      return;
    }

    const profile = await verifyGoogleIdToken(idToken);

    let user = await User.findOne({
      $or: [{ googleId: profile.googleId }, { email: profile.email }],
    });

    if (user) {
      if (!user.googleId) user.googleId = profile.googleId;
      if (profile.picture) user.avatarUrl = profile.picture;
      if (!user.name && profile.name) user.name = profile.name;
      await user.save();
    } else {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        avatarUrl: profile.picture,
        major: "Student",
      });
    }

    const token = signToken({ userId: String(user._id), email: user.email });
    res.json({ token, user: publicUser(user) });
  } catch (error: any) {
    if (error?.status === 401 || error?.message?.includes("GOOGLE_CLIENT_ID")) {
      res.status(error.status || 500).json({
        error: "Google sign-in failed",
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function guestLogin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const guestEmail = `guest-${Date.now()}@studyhub.local`;
    const passwordHash = await bcrypt.hash(`guest-${Date.now()}`, SALT_ROUNDS);

    const user = await User.create({
      name: "Alex Mercer",
      email: guestEmail,
      passwordHash,
      major: "Student",
    });

    const token = signToken({ userId: String(user._id), email: user.email });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function me(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}

/** Delete the signed-in account and all of their study data. */
export async function deleteAccount(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = req.user.userId;
    const { Subject } = await import("../models/Subject.ts");
    const { ChatHistory } = await import("../models/ChatHistory.ts");

    await Promise.all([
      Subject.deleteMany({ userId }),
      ChatHistory.deleteMany({ userId }),
      User.findByIdAndDelete(userId),
    ]);

    res.json({ ok: true, message: "Account deleted." });
  } catch (error) {
    next(error);
  }
}
