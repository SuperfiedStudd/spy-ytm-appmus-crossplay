import { expectedPosition, type MusicProvider, type PlaybackState, type Track } from '@crossplay/shared';

export class MockProvider implements MusicProvider {
  id = 'mock' as const;
  capabilities = { search: true, playback: true, requiresAuth: false, note: 'Visual simulation; no audio or account required.' };
  private state: PlaybackState = { track: null, isPlaying: false, positionMs: 0, serverTimestamp: Date.now() };
  constructor(private catalog: Track[] = []) {}
  async searchTracks(query: string): Promise<Track[]> {
    const needle = query.toLowerCase();
    return this.catalog.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(needle));
  }
  async resolveTrack(track: Track): Promise<string | null> { return this.catalog.some(item => item.id === track.id) ? track.id : null; }
  async play(track: Track, positionMs: number): Promise<void> {
    this.state = { track, isPlaying: true, positionMs, serverTimestamp: Date.now() };
  }
  async pause(): Promise<void> {
    this.state = { ...this.state, positionMs: expectedPosition(this.state), isPlaying: false, serverTimestamp: Date.now() };
  }
  async seek(positionMs: number): Promise<void> {
    this.state = { ...this.state, positionMs, serverTimestamp: Date.now() };
  }
  async getPlaybackState(): Promise<PlaybackState> {
    return { ...this.state, positionMs: expectedPosition(this.state), serverTimestamp: Date.now() };
  }
}
