# Orbit

A responsive video-meeting website prototype built with plain HTML, CSS, and JavaScript.

**Live demo:** https://newvideo-xi.vercel.app

## Run locally

Open `index.html` in a browser, or serve this folder from a local web server. Camera and microphone access require `localhost` or HTTPS and your permission.

## Deploy to Vercel

This is a static site: it has no build command and its output is the project root.

### Deploy with the Vercel CLI

```powershell
vercel
```

Follow the prompts to create or link a Vercel project. When you are ready to publish a production deployment, run:

```powershell
vercel --prod
```

### Deploy from GitHub

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the framework preset as **Other**. Leave the build command empty and set the output directory to `.`.
4. Deploy. Vercel will create preview deployments for later pushes and production deployments from the configured production branch.

## Prototype limitations

Meeting rooms, participant lists, and chat are local interface demonstrations. They do not connect callers across devices; that requires a real-time signaling service and a WebRTC backend.
