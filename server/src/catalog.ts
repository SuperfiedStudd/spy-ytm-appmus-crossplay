import type { Track } from '@crossplay/shared';

// Fictional catalog avoids suggesting any real provider has licensed these recordings.
export const tracks: Track[] = [
  { id: 'night-drive', title: 'Night Drive', artist: 'The Satellites', album: 'After Hours', durationMs: 214000, isrc: 'QZAAA2600001', providerIds: {} },
  { id: 'golden-hour', title: 'Golden Hour', artist: 'Luna Vale', album: 'Daybreak', durationMs: 188000, isrc: 'QZAAA2600002', providerIds: {} },
  { id: 'blue-static', title: 'Blue Static', artist: 'Neon Coast', album: 'Signal', durationMs: 231000, isrc: 'QZAAA2600003', providerIds: {} },
  { id: 'slow-motion', title: 'Slow Motion', artist: 'Mira Sol', album: 'Open Water', durationMs: 203000, isrc: 'QZAAA2600004', providerIds: {} },
  { id: 'home-again', title: 'Home Again', artist: 'Paper Planes', album: 'Postcards', durationMs: 176000, isrc: 'QZAAA2600005', providerIds: {} }
];
export function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(feat|featuring|ft)\.?\b.*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function matchTrack(source: Track, candidates: Track[]): Track | null {
  const ranked = candidates.map(track => {
    const isrc = source.isrc && track.isrc && source.isrc.toUpperCase() === track.isrc.toUpperCase() ? 100 : 0;
    const title = normalize(source.title) === normalize(track.title) ? 40 : 0;
    const artist = normalize(source.artist) === normalize(track.artist) ? 35 : 0;
    const duration = Math.abs(source.durationMs - track.durationMs) <= 3000 ? 20 : 0;
    return { track, score: isrc + title + artist + duration };
  }).sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= 75 ? ranked[0].track : null;
}
export function searchTracks(query: string): Track[] {
  const q = normalize(query);
  if (!q) return tracks;
  return tracks.filter(track => normalize(`${track.title} ${track.artist} ${track.album}`).includes(q));
}
