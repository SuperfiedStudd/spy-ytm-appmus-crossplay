import { describe, expect, it } from 'vitest';
import { expectedPosition } from '@crossplay/shared';
import { matchTrack, tracks } from '../src/catalog.js';
import { RoomService } from '../src/room.js';

const person = (id: string) => ({ participantId: id, name: id, provider: 'mock' as const });
describe('room authority and lifecycle', () => {
  it('creates, joins up to five, and rejects invalid rooms', () => {
    const rooms = new RoomService(() => 1000);
    const created = rooms.create(person('host'), 's0');
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    for (let i = 1; i < 5; i++) rooms.join({ ...person(`p${i}`), code: created.code }, `s${i}`);
    expect(rooms.snapshot(created.code).participants).toHaveLength(5);
    expect(() => rooms.join({ ...person('sixth'), code: created.code }, 's5')).toThrow('full');
    expect(() => rooms.join({ ...person('other'), code: 'BAD123' }, 'bad')).toThrow('not found');
  });
  it('only lets the host control play, pause, seek, track, and next', () => {
    let time = 1000;
    const rooms = new RoomService(() => time);
    const code = rooms.create(person('host'), 'h').code;
    rooms.join({ ...person('guest'), code }, 'g');
    expect(() => rooms.command('g', { type: 'play' })).toThrow('Only the host');
    rooms.command('h', { type: 'play' });
    time += 5000;
    expect(expectedPosition(rooms.snapshot(code).playback, time)).toBe(5000);
    rooms.command('h', { type: 'pause' });
    expect(rooms.snapshot(code).playback.positionMs).toBe(5000);
    rooms.command('h', { type: 'seek', positionMs: 12000 });
    expect(rooms.snapshot(code).playback.positionMs).toBe(12000);
    rooms.command('h', { type: 'track', trackId: tracks[1].id });
    expect(rooms.snapshot(code).playback.track?.id).toBe(tracks[1].id);
    rooms.command('h', { type: 'next' });
    expect(rooms.snapshot(code).playback.track?.id).toBe(tracks[2].id);
  });
  it('keeps a disconnected participant and late joiner in sync, then allows reconnect', () => {
    let time = 1000;
    const rooms = new RoomService(() => time);
    const code = rooms.create(person('host'), 'h').code;
    rooms.command('h', { type: 'play' });
    time += 8400;
    const late = rooms.join({ ...person('late'), code }, 'l');
    expect(expectedPosition(late.playback, time)).toBe(8400);
    rooms.disconnect('h');
    expect(rooms.snapshot(code).participants.find(p => p.id === 'host')?.connected).toBe(false);
    time += 500;
    const rejoined = rooms.join({ ...person('host'), code }, 'h2');
    expect(rejoined.participants.find(p => p.id === 'host')).toMatchObject({ connected: true, isHost: true });
    expect(expectedPosition(rejoined.playback, time)).toBe(8900);
  });
  it('removes an explicit leaver and transfers host role', () => {
    const rooms = new RoomService();
    const code = rooms.create(person('host'), 'h').code;
    rooms.join({ ...person('guest'), code }, 'g');
    rooms.leave('h');
    expect(rooms.snapshot(code).participants).toEqual([expect.objectContaining({ id: 'guest', isHost: true })]);
  });
});
describe('canonical matching', () => {
  it('matches ISRC or normalized title, artist and duration', () => {
    expect(matchTrack({ ...tracks[0], title: 'Different', artist: 'Someone' }, tracks)?.id).toBe(tracks[0].id);
    expect(matchTrack({ ...tracks[0], isrc: undefined, title: 'NIGHT DRIVE!', artist: 'The Satellites feat. A', durationMs: tracks[0].durationMs + 1500 }, tracks)?.id).toBe(tracks[0].id);
    expect(matchTrack({ ...tracks[0], isrc: undefined, title: 'Other', artist: 'Other' }, tracks)).toBeNull();
  });
});
