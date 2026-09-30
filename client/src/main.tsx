import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import { expectedPosition, type Ack, type ClientToServerEvents, type JamCommand, type JamState, type ProviderId, type ServerToClientEvents } from '@crossplay/shared';
import { MockProvider } from './providers';
import './style.css';

type JamSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const PROVIDER_LABELS: Record<ProviderId, string> = { spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube Music', mock: 'Mock player' };
const PROVIDER_COLORS: Record<ProviderId, string> = { spotify: '#1ed760', apple: '#fc5c7d', youtube: '#ff5555', mock: '#a993ff' };
const participantId = (() => {
  const key = 'crossplay-participant-id';
  let value = sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
  return value;
})();
function format(ms: number): string { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function initials(name: string): string { return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function App() {
  const [socket] = useState<JamSocket>(() => io({ autoConnect: false }));
  const [connected, setConnected] = useState(false);
  const [jam, setJam] = useState<JamState | null>(null);
  const [name, setName] = useState(() => sessionStorage.getItem('crossplay-name') ?? '');
  const [provider, setProvider] = useState<ProviderId>(() => {
    const saved = sessionStorage.getItem('crossplay-provider');
    return saved && ['spotify', 'apple', 'youtube', 'mock'].includes(saved) ? saved as ProviderId : 'mock';
  });
  const [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get('jam')?.toUpperCase() ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(new URLSearchParams(location.search).has('jam') ? 'join' : 'create');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const [syncStatus, setSyncStatus] = useState('Waiting for room');
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const mock = useRef(new MockProvider());
  const activeCode = useRef<string | null>(sessionStorage.getItem('crossplay-room') === new URLSearchParams(location.search).get('jam')?.toUpperCase() ? sessionStorage.getItem('crossplay-room') : null);
  const credentials = useRef({ name, provider });
  credentials.current = { name, provider };

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (activeCode.current) {
        const { name, provider } = credentials.current;
        socket.emit('jam:join', { code: activeCode.current, participantId, name, provider }, response => {
          if (response.ok) { setJam(response.data); setError(''); }
          else { setJam(null); setError(response.error); }
        });
      }
    };
    const onDisconnect = () => { setConnected(false); setSyncStatus('Reconnecting…'); };
    const onState = (state: JamState) => setJam(state);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('jam:state', onState);
    socket.connect();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('jam:state', onState); socket.disconnect(); };
  }, [socket]);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!jam) return;
    let cancelled = false;
    const sync = async () => {
      const target = jam.playback;
      const local = await mock.current.getPlaybackState();
      if (cancelled) return;
      if (!target.track) { setSyncStatus('Waiting for a track'); return; }
      const desired = expectedPosition(target);
      const changedTrack = local.track?.id !== target.track.id;
      if (changedTrack || Math.abs(local.positionMs - desired) > 750) {
        if (target.isPlaying) await mock.current.play(target.track, desired);
        else { await mock.current.play(target.track, desired); await mock.current.pause(); }
        setSyncStatus(changedTrack ? 'Track aligned' : 'Drift corrected');
      } else if (local.isPlaying !== target.isPlaying) {
        if (target.isPlaying) await mock.current.play(target.track, desired);
        else await mock.current.pause();
        setSyncStatus('Playback aligned');
      } else setSyncStatus('In sync');
    };
    void sync();
    return () => { cancelled = true; };
  }, [jam]);
  useEffect(() => {
    if (!jam?.playback.isPlaying) return;
    const timer = setInterval(async () => {
      const local = await mock.current.getPlaybackState();
      const drift = Math.abs(local.positionMs - expectedPosition(jam.playback));
      if (drift > 750 && jam.playback.track) {
        await mock.current.seek(expectedPosition(jam.playback));
        setSyncStatus('Drift corrected');
      } else setSyncStatus('In sync');
    }, 3000);
    return () => clearInterval(timer);
  }, [jam]);

  const me = jam?.participants.find(item => item.id === participantId);
  const progress = jam ? expectedPosition(jam.playback, tick) : 0;
  const matchingTracks = useMemo(() => jam?.queue.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(query.toLowerCase())) ?? [], [jam, query]);
  function send(event: 'jam:create' | 'jam:join', input: object) {
    if (!connected) { setError('Connecting to server. Try again in a moment.'); return; }
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setBusy(true); setError(''); sessionStorage.setItem('crossplay-name', name.trim());
    const callback = (response: Ack<JamState>) => {
      setBusy(false);
      if (response.ok) {
        setJam(response.data); activeCode.current = response.data.code;
        sessionStorage.setItem('crossplay-room', response.data.code);
        history.replaceState(null, '', `?jam=${response.data.code}`);
      } else setError(response.error);
    };
    if (event === 'jam:create') socket.emit('jam:create', input as { participantId: string; name: string; provider: ProviderId }, callback);
    else socket.emit('jam:join', input as { code: string; participantId: string; name: string; provider: ProviderId }, callback);
  }
  function command(action: JamCommand) {
    socket.emit('jam:command', action, response => { if (!response.ok) setError(response.error); });
  }
  function changeProvider(value: ProviderId) {
    setProvider(value);
    sessionStorage.setItem('crossplay-provider', value);
    if (jam) socket.emit('jam:provider', value, response => { if (!response.ok) setError(response.error); });
  }
  function leave() {
    socket.emit('jam:leave', () => {
      activeCode.current = null; sessionStorage.removeItem('crossplay-room'); setJam(null); setError(''); history.replaceState(null, '', '/');
    });
  }
  async function copyInvite() {
    if (!jam) return;
    await navigator.clipboard.writeText(`${location.origin}/?jam=${jam.code}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">↗</span><span>crossplay<span className="brand-dot">.</span></span></div><span className="topbar-tag">LISTEN TOGETHER, ANYWHERE</span><div className="connection"><span className={`status-dot ${connected ? 'online' : ''}`}/>{connected ? 'Live' : 'Connecting'}</div></header>
    {!jam ? <main className="landing">
      <div className="hero"><div className="eyebrow"><span className="eyebrow-line"/>THE SAME MOMENT. EVERYWHERE.</div><h1>Good music is <em>better together.</em></h1><p>One room. One track. Your favorite services. Bring up to five friends into a shared listening session.</p><div className="hero-decor"><span>✦</span><span>♪</span><span>✳</span></div></div>
      <section className="entry-card"><div className="card-tabs"><button className={mode === 'create' ? 'selected' : ''} onClick={() => { setMode('create'); setError(''); }}>Start a Jam</button><button className={mode === 'join' ? 'selected' : ''} onClick={() => { setMode('join'); setError(''); }}>Join a Jam</button></div><div className="entry-body"><h2>{mode === 'create' ? 'Set the vibe.' : 'Get in the room.'}</h2><p>{mode === 'create' ? 'Create a room and invite your people.' : 'Enter the code your host shared with you.'}</p><label>Your name<input placeholder="What should we call you?" maxLength={24} value={name} onChange={event => setName(event.target.value)} /></label>{mode === 'join' && <label>Room code<input className="code-input" placeholder="ABC123" maxLength={6} value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase())}/></label>}<div className="field-label">Your music service <span>· simulated in V0</span></div><div className="provider-grid">{(['spotify', 'apple', 'youtube', 'mock'] as ProviderId[]).map(id => <button key={id} className={`provider-option ${provider === id ? 'active' : ''}`} onClick={() => changeProvider(id)}><span className="provider-mark" style={{ color: PROVIDER_COLORS[id] }}>{id === 'spotify' ? '◉' : id === 'apple' ? '♫' : id === 'youtube' ? '▶' : '✳'}</span>{PROVIDER_LABELS[id]}</button>)}</div><p className="simulation-note">No account connection yet. Every service plays through the local mock player.</p>{error && <div className="error" role="alert">{error}</div>}<button className="primary-btn" disabled={busy || !connected} onClick={() => mode === 'create' ? send('jam:create', { participantId, name, provider }) : send('jam:join', { code: roomCode, participantId, name, provider })}>{busy ? 'One moment…' : mode === 'create' ? 'Create Jam  ↗' : 'Join Jam  ↗'}</button></div></section>
      <div className="landing-footer"><span>SPOTIFY</span><span>APPLE MUSIC</span><span>YOUTUBE MUSIC</span><span className="footer-note">ONE SHARED SESSION</span></div>
    </main> : <main className="room"><div className="room-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>LIVE JAM SESSION</div><h1>You're in the <em>mix.</em></h1><p>Everyone hears the same track at the same time.</p></div><button className="text-btn" onClick={leave}>Leave Jam ↗</button></div><div className="room-grid"><section className="player-panel"><div className="panel-top"><span className="panel-kicker">NOW PLAYING</span><span className="sync-pill"><span className="status-dot online"/>{connected ? syncStatus : 'Reconnecting…'}</span></div><div className="artwork"><div className="art-glow"/><div className="art-vinyl"><span>↗</span></div><div className="art-label">CROSSPLAY RADIO <span>•</span> VOL. 001</div></div><div className="track-row"><div><h2>{jam.playback.track?.title ?? 'No track selected'}</h2><p>{jam.playback.track?.artist ?? 'Choose a song below'} <span>·</span> {jam.playback.track?.album}</p></div><span className="track-indicator">✦</span></div><div className="progress"><input aria-label="Seek position" type="range" min={0} max={jam.playback.track?.durationMs ?? 1} value={progress} disabled={!me?.isHost} onChange={event => command({ type: 'seek', positionMs: Number(event.target.value) })} style={{ background: `linear-gradient(to right,#c5ff6b ${100 * progress / (jam.playback.track?.durationMs ?? 1)}%,#353a40 0)` }}/><div className="times"><span>{format(progress)}</span><span>{format(jam.playback.track?.durationMs ?? 0)}</span></div></div><div className="controls"><button aria-label="Previous track" disabled title="Previous track is not in V0">⏮</button><button className="play-button" aria-label={jam.playback.isPlaying ? 'Pause' : 'Play'} disabled={!me?.isHost} onClick={() => command({ type: jam.playback.isPlaying ? 'pause' : 'play' })}>{jam.playback.isPlaying ? 'Ⅱ' : '▶'}</button><button aria-label="Next track" disabled={!me?.isHost} onClick={() => command({ type: 'next' })}>⏭</button></div><div className="player-foot">{me?.isHost ? 'You control the music for everyone' : 'Your host controls the music'} <span>·</span> Visual playback simulation</div></section><aside className="sidebar"><section className="side-card invite-card"><div className="side-header"><span className="panel-kicker">YOUR ROOM</span><span className="live-badge">● LIVE</span></div><div className="room-code">{jam.code}</div><p>Send this code or invite link to your friends.</p><button className="outline-btn" onClick={() => void copyInvite()}>{copied ? 'Copied!' : 'Copy invite link  ↗'}</button></section><section className="side-card participants-card"><div className="side-header"><span className="panel-kicker">IN THE ROOM</span><span className="count">{jam.participants.length} / 5</span></div><div className="people">{jam.participants.map((person, index) => <div className="person" key={person.id}><div className="avatar" style={{ background: ['#d8ff91', '#c7b8ff', '#ffb98f', '#93dfe9', '#ffc5dc'][index] }}>{initials(person.name)}</div><div className="person-details"><strong>{person.name}{person.id === participantId ? ' (you)' : ''}</strong><span><i style={{ background: PROVIDER_COLORS[person.provider] }}/>{PROVIDER_LABELS[person.provider]} · mock</span></div>{person.isHost && <span className="host-tag">HOST</span>}{!person.connected && <span className="away-tag">OFFLINE</span>}</div>)}</div><div className="my-provider"><label htmlFor="room-provider">Your service</label><select id="room-provider" value={me?.provider ?? provider} onChange={event => changeProvider(event.target.value as ProviderId)}>{Object.entries(PROVIDER_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div></section><section className="side-card queue-card"><div className="side-header"><span className="panel-kicker">PICK A TRACK</span><span className="count">{jam.queue.length} SONGS</span></div><input className="search" placeholder="Search the mock catalog…" value={query} onChange={event => setQuery(event.target.value)}/><div className="track-list">{matchingTracks.map((track, index) => <button key={track.id} disabled={!me?.isHost} className={`queue-track ${jam.playback.track?.id === track.id ? 'current' : ''}`} onClick={() => command({ type: 'track', trackId: track.id })}><span className="queue-index">{String(index + 1).padStart(2, '0')}</span><span className="queue-info"><strong>{track.title}</strong><small>{track.artist}</small></span><span className="queue-duration">{format(track.durationMs)}</span></button>)}</div>{!me?.isHost && <p className="queue-hint">The host picks the next track.</p>}</section></aside></div>{error && <div className="room-error error" role="alert">{error}</div>}</main>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
