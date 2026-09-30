import type { MusicProvider, ProviderCapabilities, ProviderId, PlaybackState, Track } from '@crossplay/shared';

export class UnconfiguredProvider implements MusicProvider {
  capabilities: ProviderCapabilities;
  constructor(public id: Exclude<ProviderId, 'mock'>, note: string) {
    this.capabilities = { search: false, playback: false, requiresAuth: true, note };
  }
  private unavailable(): never { throw Error(`${this.id} integration requires credentials and implementation.`); }
  searchTracks(): Promise<Track[]> { return this.unavailable(); }
  resolveTrack(): Promise<string | null> { return this.unavailable(); }
  play(): Promise<void> { return this.unavailable(); }
  pause(): Promise<void> { return this.unavailable(); }
  seek(): Promise<void> { return this.unavailable(); }
  getPlaybackState(): Promise<PlaybackState> { return this.unavailable(); }
}
export const spotifyProvider = new UnconfiguredProvider('spotify', 'Spotify OAuth and a Premium account required.');
export const appleProvider = new UnconfiguredProvider('apple', 'MusicKit developer token, user authorization and subscription required.');
export const youtubeProvider = new UnconfiguredProvider('youtube', 'No official YouTube Music playback API identified.');
