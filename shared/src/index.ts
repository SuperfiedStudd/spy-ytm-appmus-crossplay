export const MAX_PARTICIPANTS = 5;
export const PROVIDERS = ['spotify', 'apple', 'youtube', 'mock'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export type RealProviderId = Exclude<ProviderId, 'mock'>;

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUrl?: string;
  isrc?: string;
  providerIds: Partial<Record<RealProviderId, string>>;
}
export interface PlaybackState {
  track: Track | null;
  isPlaying: boolean;
  positionMs: number;
  serverTimestamp: number;
}
export interface Participant {
  id: string;
  name: string;
  provider: ProviderId;
  connected: boolean;
  isHost: boolean;
}
export interface JamState {
  code: string;
  participants: Participant[];
  playback: PlaybackState;
  queue: Track[];
}
export type JamCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionMs: number }
  | { type: 'track'; trackId: string }
  | { type: 'next' };
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
export interface JoinInput { code?: string; participantId: string; name: string; provider: ProviderId }
export interface ClientToServerEvents {
  'jam:create': (input: Omit<JoinInput, 'code'>, ack: (result: Ack<JamState>) => void) => void;
  'jam:join': (input: JoinInput, ack: (result: Ack<JamState>) => void) => void;
  'jam:provider': (provider: ProviderId, ack: (result: Ack<JamState>) => void) => void;
  'jam:command': (command: JamCommand, ack: (result: Ack<JamState>) => void) => void;
  'jam:leave': (ack: (result: Ack<null>) => void) => void;
}
export interface ServerToClientEvents {
  'jam:state': (state: JamState) => void;
}
export function expectedPosition(playback: PlaybackState, now = Date.now()): number {
  if (!playback.track) return 0;
  const elapsed = playback.isPlaying ? Math.max(0, now - playback.serverTimestamp) : 0;
  return Math.min(playback.track.durationMs, Math.max(0, playback.positionMs + elapsed));
}
export type { MusicProvider, ProviderCapabilities } from './provider.js';
