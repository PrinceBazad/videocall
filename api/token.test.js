import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import handler from "./token.js";

const originalEnv = {
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
};

function makeResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function makeRequest({ method = "POST", body, origin, host = "localhost:3000" } = {}) {
  return { method, body, headers: { origin, host } };
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("LiveKit token endpoint", () => {
  it("only accepts POST requests", async () => {
    const res = makeResponse();
    await handler(makeRequest({ method: "GET" }), res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, "POST");
  });

  it("rejects cross-origin browser requests", async () => {
    const res = makeResponse();
    await handler(makeRequest({ origin: "https://attacker.example" }), res);
    assert.equal(res.statusCode, 403);
  });

  it("returns an explicit setup error when LiveKit is not configured", async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    const res = makeResponse();
    await handler(makeRequest(), res);
    assert.equal(res.statusCode, 503);
    assert.match(res.payload.error, /LiveKit/);
  });

  it("rejects malformed room codes and empty names", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-api-key";
    process.env.LIVEKIT_API_SECRET = "test-api-secret-at-least-32-characters";
    const invalidRoom = makeResponse();
    await handler(makeRequest({ body: { room: "1234", name: "Casey" } }), invalidRoom);
    assert.equal(invalidRoom.statusCode, 400);

    const invalidName = makeResponse();
    await handler(makeRequest({ body: { room: "A".repeat(24), name: " " } }), invalidName);
    assert.equal(invalidName.statusCode, 400);
  });

  it("issues a short-lived participant token with room-scoped permissions", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-api-key";
    process.env.LIVEKIT_API_SECRET = "test-api-secret-at-least-32-characters";
    const res = makeResponse();
    await handler(makeRequest({
      body: { room: "ABCDEF0123456789ABCDEF01", name: "Casey" },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.serverUrl, process.env.LIVEKIT_URL);
    assert.equal(res.headers["Cache-Control"], "no-store");
    const claims = await new TokenVerifier(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    ).verify(res.payload.token);
    assert.match(claims.sub, /^[0-9a-f-]{36}$/i);
    assert.equal(claims.name, "Casey");
    assert.equal(claims.video.room, "ABCDEF0123456789ABCDEF01");
    assert.equal(claims.video.canPublish, true);
    assert.equal(claims.video.canSubscribe, true);
    assert.equal(claims.video.canPublishData, true);
  });
});
