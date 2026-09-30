import { randomInt } from 'node:crypto';
import { MAX_PARTICIPANTS, expectedPosition, type JamCommand, type JamState, type JoinInput, type Participant, type ProviderId } from '@crossplay/shared';
import { tracks } from './catalog.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_GRACE_MS = 60_000;
type InternalRoom = { state: JamState; sockets: Map<string, string>; disconnectedAt: Map<string, number> };

export class RoomService {
  private rooms = new Map<string, InternalRoom>();
  private socketRooms = new Map<string, { code: string; participantId: string }>();
  constructor(private now: () => number = Date.now) {}

  private code(): string {
    let code: string;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    return code;
  }
  private validate(input: Omit<JoinInput, 'code'>): void {
    if (!input.participantId || input.participantId.length > 100) throw Error('Invalid participant ID.');
    if (!input.name.trim() || input.name.trim().length > 24) throw Error('Enter a name of 1–24 characters.');
    if (!['mock', 'spotify', 'apple', 'youtube'].includes(input.provider)) throw Error('Choose a valid provider.');
  }
  create(input: Omit<JoinInput, 'code'>, socketId: string): JamState {
    this.validate(input);
    this.leave(socketId);
    const code = this.code();
    const participant: Participant = { id: input.participantId, name: input.name.trim(), provider: input.provider, connected: true, isHost: true };
    const state: JamState = { code, participants: [participant], playback: { track: tracks[0], isPlaying: false, positionMs: 0, serverTimestamp: this.now() }, queue: tracks };
    this.rooms.set(code, { state, sockets: new Map([[participant.id, socketId]]), disconnectedAt: new Map() });
    this.socketRooms.set(socketId, { code, participantId: participant.id });
    return this.snapshot(code);
  }
  join(input: JoinInput, socketId: string): JamState {
    this.validate(input);
    const code = input.code?.trim().toUpperCase() ?? '';
    const room = this.rooms.get(code);
    if (!room) throw Error('Jam not found. Check the room code.');
    this.prune(room);
    if (!this.rooms.has(code)) throw Error('Jam not found. Check the room code.');
    const existing = room.state.participants.find(p => p.id === input.participantId);
    if (!existing && room.state.participants.length >= MAX_PARTICIPANTS) throw Error('This Jam is full (5 people max).');
    this.leave(socketId);
    if (existing) {
      const priorSocket = room.sockets.get(existing.id);
      if (priorSocket && priorSocket !== socketId) this.socketRooms.delete(priorSocket);
      existing.name = input.name.trim();
      existing.provider = input.provider;
      existing.connected = true;
      room.disconnectedAt.delete(existing.id);
    } else {
      room.state.participants.push({ id: input.participantId, name: input.name.trim(), provider: input.provider, connected: true, isHost: false });
    }
    room.sockets.set(input.participantId, socketId);
    this.socketRooms.set(socketId, { code, participantId: input.participantId });
    return this.snapshot(code);
  }
  provider(socketId: string, provider: ProviderId): JamState {
    if (!['mock', 'spotify', 'apple', 'youtube'].includes(provider)) throw Error('Choose a valid provider.');
    const { room, participant } = this.member(socketId);
    participant.provider = provider;
    return this.snapshot(room.state.code);
  }
  command(socketId: string, command: JamCommand): JamState {
    const { room, participant } = this.member(socketId);
    if (!participant.isHost) throw Error('Only the host can control playback.');
    const playback = room.state.playback;
    const now = this.now();
    const position = expectedPosition(playback, now);
    switch (command.type) {
      case 'play':
        if (!playback.track) throw Error('Choose a track first.');
        playback.positionMs = position >= playback.track.durationMs ? 0 : position;
        playback.isPlaying = true;
        break;
      case 'pause': playback.positionMs = position; playback.isPlaying = false; break;
      case 'seek':
        if (!Number.isFinite(command.positionMs)) throw Error('Invalid seek position.');
        playback.positionMs = Math.min(playback.track?.durationMs ?? 0, Math.max(0, command.positionMs));
        break;
      case 'track': {
        const track = tracks.find(item => item.id === command.trackId);
        if (!track) throw Error('Track not found.');
        playback.track = track; playback.positionMs = 0;
        break;
      }
      case 'next': {
        const index = tracks.findIndex(track => track.id === playback.track?.id);
        playback.track = tracks[(index + 1) % tracks.length]; playback.positionMs = 0;
        break;
      }
      default: throw Error('Unknown playback command.');
    }
    playback.serverTimestamp = now;
    return this.snapshot(room.state.code);
  }
  disconnect(socketId: string): string | null {
    const membership = this.socketRooms.get(socketId);
    if (!membership) return null;
    const room = this.rooms.get(membership.code);
    this.socketRooms.delete(socketId);
    if (!room || room.sockets.get(membership.participantId) !== socketId) return null;
    room.sockets.delete(membership.participantId);
    const participant = room.state.participants.find(p => p.id === membership.participantId);
    if (participant) { participant.connected = false; room.disconnectedAt.set(participant.id, this.now()); }
    return membership.code;
  }
  leave(socketId: string): string | null {
    const participantId = this.socketRooms.get(socketId)?.participantId;
    const code = this.disconnect(socketId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;
    if (participantId) this.removeParticipant(room, participantId);
    return code;
  }
  private removeParticipant(room: InternalRoom, id: string): void {
    const wasHost = room.state.participants.find(p => p.id === id)?.isHost;
    room.state.participants = room.state.participants.filter(p => p.id !== id);
    room.disconnectedAt.delete(id);
    if (wasHost && room.state.participants[0]) room.state.participants[0].isHost = true;
    if (!room.state.participants.length) this.rooms.delete(room.state.code);
  }
  private prune(room: InternalRoom): void {
    for (const [id, time] of room.disconnectedAt) if (this.now() - time > RECONNECT_GRACE_MS) this.removeParticipant(room, id);
  }
  private member(socketId: string): { room: InternalRoom; participant: Participant } {
    const membership = this.socketRooms.get(socketId);
    const room = membership && this.rooms.get(membership.code);
    const participant = room?.state.participants.find(p => p.id === membership?.participantId);
    if (!room || !participant || room.sockets.get(participant.id) !== socketId) throw Error('Join a Jam first.');
    return { room, participant };
  }
  roomFor(socketId: string): string | null { return this.socketRooms.get(socketId)?.code ?? null; }
  snapshot(code: string): JamState {
    const room = this.rooms.get(code);
    if (!room) throw Error('Jam not found.');
    this.prune(room);
    return structuredClone(room.state);
  }
}
