import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Ack, ClientToServerEvents, JamState, ServerToClientEvents } from '@crossplay/shared';
import { searchTracks } from './catalog.js';
import { RoomService } from './room.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/tracks', (req, res) => res.json(searchTracks(String(req.query.q ?? ''))));
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }
});
const rooms = new RoomService();

function result<T>(action: () => T, ack: (result: Ack<T>) => void, after?: (value: T) => void): void {
  try { const value = action(); ack({ ok: true, data: value }); after?.(value); }
  catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Request failed.' }); }
}
function broadcast(code: string): void {
  try { io.to(code).emit('jam:state', rooms.snapshot(code)); } catch { /* room was emptied */ }
}
io.on('connection', socket => {
  socket.on('jam:create', (input, ack) => {
    const oldCode = rooms.roomFor(socket.id);
    result(() => rooms.create(input, socket.id), ack, (state: JamState) => {
      if (oldCode) { socket.leave(oldCode); broadcast(oldCode); }
      socket.join(state.code); broadcast(state.code);
    });
  });
  socket.on('jam:join', (input, ack) => {
    const oldCode = rooms.roomFor(socket.id);
    result(() => rooms.join(input, socket.id), ack, (state: JamState) => {
      if (oldCode && oldCode !== state.code) { socket.leave(oldCode); broadcast(oldCode); }
      socket.join(state.code); broadcast(state.code);
    });
  });
  socket.on('jam:provider', (provider, ack) => result(() => rooms.provider(socket.id, provider), ack, state => broadcast(state.code)));
  socket.on('jam:command', (command, ack) => result(() => rooms.command(socket.id, command), ack, state => broadcast(state.code)));
  socket.on('jam:leave', ack => {
    const code = rooms.roomFor(socket.id);
    result(() => { rooms.leave(socket.id); return null; }, ack, () => {
      if (code) { socket.leave(code); broadcast(code); }
    });
  });
  socket.on('disconnect', () => {
    const code = rooms.disconnect(socket.id);
    if (code) broadcast(code);
  });
});
const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`Crossplay server listening on http://localhost:${port}`));
