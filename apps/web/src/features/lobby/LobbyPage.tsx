import { useMemo, useState } from 'react';
import { Check, Copy, Crown, Eye, Play, SignOut, UserCircle } from '@phosphor-icons/react';
import type { CardPool, PublicPlayer, TeamId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { clearSession } from '@/shared/ws/session';
import { Button } from '@/shared/ui/Button';
import { Chip } from '@/shared/ui/Chip';
import { Panel } from '@/shared/ui/Panel';
import { TopBar } from '@/shared/ui/TopBar';
import { cn } from '@/shared/lib/cn';
import { useNavigate } from 'react-router';

const teamLabel: Record<TeamId, string> = { ember: 'Ember', tide: 'Tide' };

export const LobbyPage = () => {
  const view = useGameStore((s) => s.view)!;
  const navigate = useNavigate();
  const me = view.me;
  const players = view.public.players.filter((p) => p.seat !== 'left');
  const [pool, setPool] = useState<CardPool>(view.public.settings.cardPool);
  const [copied, setCopied] = useState(false);

  const reasons = useMemo(() => startBlockers(players), [players]);
  const canStart = me.isHost && reasons.length === 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/join/${view.public.roomCode}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const leave = () => {
    socket.send({ type: 'LEAVE' });
    clearSession(view.public.roomCode);
    navigate('/');
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-12 sm:px-6">
      <TopBar>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-raised px-3 text-[13px] ring-1 ring-hairline hover:bg-panel"
          aria-label="Copy invite link"
        >
          <span className="tabular tracking-[0.2em] text-ink">{view.public.roomCode}</span>
          {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} className="text-ink-muted" />}
        </button>
      </TopBar>

      <section className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] font-bold tracking-tight text-ink">Lobby</h1>
          <p className="mt-1 text-[15px] text-ink-muted">Pick a team. Each team needs one spymaster and at least one operative.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={leave} leading={<SignOut size={16} />}>
          Leave
        </Button>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-12">
        <TeamColumn team="ember" players={players} me={me} className="lg:col-span-4" />
        <TeamColumn team="tide" players={players} me={me} className="lg:col-span-4" />

        <div className="flex flex-col gap-4 lg:col-span-4">
          <Panel inner="p-4">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-faint">Watching</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {players.filter((p) => p.team === null).length === 0 ? <li className="text-[14px] text-ink-faint">Nobody is on the bench.</li> : null}
              {players
                .filter((p) => p.team === null)
                .map((p) => (
                  <li key={p.id}>
                    <Chip>
                      <UserCircle size={14} /> {p.nickname}
                      {p.isHost ? <Crown size={12} weight="fill" className="text-accent" /> : null}
                    </Chip>
                  </li>
                ))}
            </ul>
            {me.team !== null ? (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => socket.send({ type: 'SET_TEAM', team: null })}>
                Sit out
              </Button>
            ) : null}
          </Panel>

          <Panel inner="p-4">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-faint">Rules</h2>
            <div role="radiogroup" aria-label="Card pool" className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ['mvp', 'Gambit', 'Twelve ability cards'],
                  ['none', 'Classic', 'No cards at all'],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={pool === value}
                  disabled={!me.isHost}
                  onClick={() => setPool(value)}
                  className={cn(
                    'rounded-[var(--radius-input)] px-3 py-2.5 text-left ring-1 transition-colors',
                    pool === value ? 'bg-accent/12 ring-accent text-ink' : 'bg-sunken ring-hairline text-ink-muted hover:text-ink',
                    !me.isHost && 'cursor-default opacity-70',
                  )}
                >
                  <span className="block text-[14px] font-medium">{label}</span>
                  <span className="block text-[12px] text-ink-faint">{hint}</span>
                </button>
              ))}
            </div>
            {!me.isHost ? <p className="mt-2 text-[12px] text-ink-faint">The host chooses the rules.</p> : null}
          </Panel>

          <Panel inner="p-4">
            {me.isHost ? (
              <>
                <Button size="lg" className="w-full" disabled={!canStart} onClick={() => socket.send({ type: 'START_GAME', settings: { cardPool: pool } })} trailing={<Play size={16} weight="fill" />}>
                  Start game
                </Button>
                {reasons.length ? (
                  <ul className="mt-3 space-y-1 text-[13px] text-ink-muted">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[13px] text-ink-muted">Everyone is seated. You can start.</p>
                )}
              </>
            ) : (
              <p className="text-[14px] text-ink-muted">
                Waiting for {players.find((p) => p.isHost)?.nickname ?? 'the host'} to start.
                {reasons.length ? ` Still needed: ${reasons.join(' ')}` : ''}
              </p>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
};

const startBlockers = (players: PublicPlayer[]): string[] => {
  const out: string[] = [];
  if (players.length < 4) out.push(`${4 - players.length} more player${4 - players.length === 1 ? '' : 's'} needed.`);
  for (const team of ['ember', 'tide'] as const) {
    const members = players.filter((p) => p.team === team);
    const sm = members.filter((p) => p.role === 'spymaster').length;
    const ops = members.filter((p) => p.role === 'operative').length;
    if (sm !== 1) out.push(`${teamLabel[team]} needs a spymaster.`);
    if (ops < 1) out.push(`${teamLabel[team]} needs an operative.`);
  }
  return out;
};

const TeamColumn = ({ team, players, me, className }: { team: TeamId; players: PublicPlayer[]; me: { playerId: string; team: TeamId | null; role: string }; className?: string }) => {
  const members = players.filter((p) => p.team === team);
  const spymaster = members.find((p) => p.role === 'spymaster');
  const onTeam = me.team === team;
  const isSpy = onTeam && me.role === 'spymaster';
  const tone = team === 'ember' ? 'ember' : 'tide';

  return (
    <Panel className={className} inner="p-4">
      <div className="flex items-center justify-between">
        <h2 className={cn('font-display text-[22px] font-bold', team === 'ember' ? 'text-ember' : 'text-tide')}>{teamLabel[team]}</h2>
        <span className="tabular text-[13px] text-ink-faint">{members.length}</span>
      </div>
      <ul className="mt-4 min-h-[120px] space-y-2">
        {members.length === 0 ? <li className="text-[14px] text-ink-faint">No one yet.</li> : null}
        {members.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-[var(--radius-input)] bg-sunken px-3 py-2 ring-1 ring-hairline">
            <span className="flex items-center gap-2 text-[15px] text-ink">
              {p.role === 'spymaster' ? <Eye size={16} weight="fill" className={team === 'ember' ? 'text-ember' : 'text-tide'} /> : <UserCircle size={16} className="text-ink-muted" />}
              {p.nickname}
              {p.isHost ? <Crown size={13} weight="fill" className="text-accent" aria-label="Host" /> : null}
            </span>
            <span className="text-[12px] text-ink-faint">{p.role === 'spymaster' ? 'Spymaster' : 'Operative'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {!onTeam ? (
          <Button variant={tone} size="sm" onClick={() => socket.send({ type: 'SET_TEAM', team })}>
            Join {teamLabel[team]}
          </Button>
        ) : isSpy ? (
          <Button variant="secondary" size="sm" onClick={() => socket.send({ type: 'SET_ROLE', role: 'operative' })}>
            Be an operative
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={!!spymaster} onClick={() => socket.send({ type: 'SET_ROLE', role: 'spymaster' })} leading={<Eye size={14} />}>
            {spymaster ? 'Spymaster taken' : 'Be the spymaster'}
          </Button>
        )}
      </div>
    </Panel>
  );
};
