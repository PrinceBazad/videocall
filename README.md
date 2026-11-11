# Orbit

A responsive video meeting website with real-time audio, video, screen sharing, participant updates, and in-room chat, powered by LiveKit.

**Live demo:** https://newvideo-xi.vercel.app
**GitHub:** https://github.com/PrinceBazad/videocall

The sample calendar and contacts on the dashboard are presentation content. They do not represent saved meetings or registered users.

## Set up LiveKit

Create a project in [LiveKit Cloud](https://cloud.livekit.io/) and copy its WebSocket URL, API key, and API secret from the project settings.

Configure these values in **Vercel → Project Settings → Environment Variables** for Production, Preview, and Development:

| Variable | Value |
|---|---|
| `LIVEKIT_URL` | Your project's secure `wss://…` WebSocket URL |
| `LIVEKIT_API_KEY` | Your LiveKit API key |
| `LIVEKIT_API_SECRET` | Your LiveKit API secret |

Save the variables and redeploy. The API secret is used only by the Vercel token endpoint; **never** add it to client-side code or a `VITE_` variable. The deployment stays available without these values, but joining a meeting displays a clear setup error until they are configured.

## Run locally

Install dependencies. Add your LiveKit values to an ignored `.env.local` file in the project root:

```powershell
npm install
```

Copy `.env.example` to `.env.local` and replace its placeholder values with the credentials from your LiveKit Cloud project. Verify that `.env.local` is not committed; it is excluded by `.gitignore`.

Run `npm run dev` and open the local URL printed in your terminal. The Vite development server exposes the same token endpoint as the Vercel Function. Camera and microphone access need your permission. Use two browser windows/devices to test a real call.

## Test and build

```powershell
npm test
npm run build
```

## How calls work

The `/api/token` Vercel Function validates a room code and issues a short-lived participant token with room-scoped permissions. The browser uses that token to connect to LiveKit over WebRTC. Camera, microphone, screen sharing, remote participant tracks, and chat are connected to the active room. Meeting invitations contain a randomly generated, 96-bit room code. Anyone who has an invitation can join and publish media.

The site does not implement accounts, saved schedules, or persistent contacts. LiveKit usage and any account limits or charges are governed by your LiveKit plan.

## Video quality

Camera capture requests up to 4K (2160p) at 30 fps and publishes a 4K video profile, with 720p and 1080p simulcast layers for receivers that need less bandwidth. Video prioritizes maintaining its frame rate over preserving resolution when bandwidth is constrained, so quality may automatically drop to keep playback smooth. The browser and camera may also select a lower resolution when 4K capture is unavailable. Actual delivered quality and latency depend on device performance, network conditions, and LiveKit plan limits; zero delay cannot be guaranteed over the internet.
