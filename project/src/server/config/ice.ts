import { Request, Response } from "express";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const STUN_SERVERS: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [...STUN_SERVERS];
  const urls = String(process.env.TURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const username = String(process.env.TURN_USERNAME || "").trim();
  const credential = String(process.env.TURN_CREDENTIAL || "").trim();
  if (urls.length && username && credential) {
    servers.push({ urls, username, credential });
  }
  return servers;
}

export function getIceConfig(_req: Request, res: Response): void {
  res.json({ iceServers: getIceServers() });
}
