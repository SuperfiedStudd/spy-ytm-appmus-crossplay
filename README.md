# Crossplay V0

A real-time, five-person Jam prototype. A Spotify host, an Apple Music friend, a YouTube Music friend, and another Spotify friend can join one room and see the equivalent canonical track and shared controls. **V0 simulates playback for everyone; it does not connect to or stream from those services.**

## Run locally

Requires Node.js 20.19+ and npm 10+.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Start a Jam in one tab, then open the invite link in other tabs. Use different names and provider labels. The host can pick a seeded song, play, pause, seek, and skip. Room membership and playback state live in server memory, so restarting the server clears rooms.

No `.env` file is needed for local use. Copy `.env.example` to `.env` to change server port or CORS origin. If changing `PORT`, also change the Vite proxy target in `client/vite.config.ts`.

## Checks

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `shared/`: canonical `Track`, typed Socket.IO events, timestamp-based expected position, provider contract.
- `server/`: in-memory room authority, five-person cap, host-only commands, seed catalog and matching by ISRC or normalized title/artist/duration.
- `client/`: React room UI, real-time socket client, local mock playback and drift correction. Provider labels are clearly marked as simulation.
- `docs/providers.md`: official API capabilities and integration constraints.

Each room has a six-character code. The server timestamps every playback change. Clients extrapolate position from that timestamp and correct their local mock player when drift exceeds 750 ms. Disconnects reserve a seat for 60 seconds so a reconnect can reclaim the participant and host role; afterward the next participant becomes host when the room is accessed. There is no persistence, authentication, audio, or production scaling in V0.

## Provider path

A future adapter should search its catalog, resolve a canonical track to a provider ID, and control playback in the participant's browser. The server never stores provider credentials and never uses provider IDs as room truth. Real adapters currently report unavailable capabilities and reject calls; the mock adapter powers the entire test flow. See [provider integration notes](docs/providers.md).
