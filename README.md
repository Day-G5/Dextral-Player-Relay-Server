# Dextral Player — Relay Server

A lightweight **Socket.IO relay** that connects the Dextral Player AI DJ to listeners' devices over the internet, so remote playback works beyond the local network.

## What it does

The relay sits between a **manager** (the DJ host) and one or more **clients** (Dextral Player devices), coordinating who is connected to whom:

- **Device registration** — clients request a DJ with a stable device ID and friendly name.
- **Agent assignment** — the manager sees pending devices and assigns a DJ agent to each.
- **Rooms & routing** — connected pairs are placed in rooms so messages and audio signalling flow to the right place.
- **Live state** — the manager can query current pending and active connections at any time.
- **Chat** — relays messages between the DJ and the listener.

## Tech Stack

- **Node.js**
- **Socket.IO** — real-time, event-based transport

## Getting Started

```bash
npm install
npm start        # runs: node server.js
```

The server listens on `PORT` (default **3000**) and allows CORS from any origin, making it easy to host on a small cloud instance.

## Related

Part of the [Dextral Player](https://github.com/Day-G5/Dextral-Player-v5) project.
