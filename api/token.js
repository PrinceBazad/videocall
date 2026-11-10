import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

const ROOM_CODE_PATTERN = /^[A-F0-9]{24}$/;
const MAX_NAME_LENGTH = 32;

function respond(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Use POST to request a room token." });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return respond(res, 403, { error: "Cross-origin token requests are not allowed." });
      }
    } catch {
      return respond(res, 403, { error: "The request origin is invalid." });
    }
  }

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !/^wss:\/\/[^/]+$/i.test(LIVEKIT_URL) || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return respond(res, 503, { error: "Video calling is not configured yet. Add the LiveKit URL, API key, and API secret in Vercel." });
  }

  const room = typeof req.body?.room === "string" ? req.body.room.trim().toUpperCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!ROOM_CODE_PATTERN.test(room)) {
    return respond(res, 400, { error: "Enter a valid room code from the meeting invitation." });
  }
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    return respond(res, 400, { error: "Enter a name between 1 and 32 characters." });
  }

  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: randomUUID(),
      name,
      ttl: "15m",
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return respond(res, 200, { serverUrl: LIVEKIT_URL, token: await token.toJwt() });
  } catch {
    return respond(res, 500, { error: "Couldn't create a room token. Check the LiveKit API credentials." });
  }
}
