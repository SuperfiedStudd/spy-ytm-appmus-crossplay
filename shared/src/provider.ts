import type { PlaybackState, ProviderId, Track } from './index.js';

export interface ProviderCapabilities {
  search: boolean;
  playback: boolean;
  requiresAuth: boolean;
  note: string;
}
export interface MusicProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  searchTracks(query: string): Promise<Track[]>;
  resolveTrack(track: Track): Promise<string | null>;
  play(track: Track, positionMs: number): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getPlaybackState(): Promise<PlaybackState>;
}
