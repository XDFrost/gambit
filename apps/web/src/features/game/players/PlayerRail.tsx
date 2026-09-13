import { Crown, Eye, UserCircle, WifiSlash } from '@phosphor-icons/react';
import type { PublicPlayer, TeamId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { cn } from '@/shared/lib/cn';

const teamName = (t: TeamId) => (t === 'ember' ? 'Ember' : 'Tide');

/** Both teams, who is who, who is here. The active team's group is emphasised. */
export const PlayerRail = ({ className }: { className?: string }) => {
  const view = useGameStore((s) => s.view)!;
  const players = view.public.players.filter((p) => p.seat !== 'left');
  const turn = view.public.turn;
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(['ember', 'tide'] as const).map((team) => (
        <TeamGroup key={team} team={team} players={players.filter((p) => p.team === team)} active={turn?.team === team} wordsRemaining={view.public.teams[team].wordsRemaining} wordsTotal={view.public.teams[team].wordsTotal} me={view.me} />
      ))}
      {players.some((p) => p.team === null) ? (
        <div className="px-1 text-[12px] text-ink-faint">Watching: {players.filter((p) => p.team === null).map((p) => p.nickname).join(', ')}</div>
      ) : null}
    </div>
  );
};

const TeamGroup = ({ team, players, active, wordsRemaining, wordsTotal, me }: { team: TeamId; players: PublicPlayer[]; active: boolean; wordsRemaining: number; wordsTotal: number; me: { playerId: string; team: TeamId | null; role: string; isHost: boolean } }) => {
  const spymaster = players.find((p) => p.role === 'spymaster');
  const spymasterAway = !!spymaster && spymaster.seat !== 'connected';
  const canPromote = spymasterAway && (me.team === team || me.isHost);
  return (
    <section className={cn('rounded-[var(--radius-panel-inner)] p-3 ring-1 transition-colors', active ? (team === 'ember' ? 'bg-ember-soft ring-ember/30' : 'bg-tide-soft ring-tide/30') : 'bg-panel ring-hairline')} aria-label={`${teamName(team)} team`}>
      <div className="flex items-baseline justify-between">
        <h2 className={cn('font-display text-[16px] font-bold', team === 'ember' ? 'text-ember' : 'text-tide')}>{teamName(team)}</h2>
        <span className="tabular text-[13px] text-ink-muted">
          {wordsRemaining}
          <span className="text-ink-faint"> of {wordsTotal} left</span>
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {players.map((p) => (
          <li key={p.id} className={cn('flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[14px]', p.id === me.playerId && 'bg-black/10')}>
            <span className="flex min-w-0 items-center gap-2 text-ink">
              {p.role === 'spymaster' ? <Eye size={15} weight="fill" className={team === 'ember' ? 'text-ember' : 'text-tide'} aria-label="Spymaster" /> : <UserCircle size={15} className="text-ink-muted" aria-label="Operative" />}
              <span className="truncate">{p.nickname}</span>
              {p.isHost ? <Crown size={12} weight="fill" className="shrink-0 text-accent" aria-label="Host" /> : null}
              {p.seat !== 'connected' ? <WifiSlash size={13} className="shrink-0 text-ink-faint" aria-label="Away" /> : null}
            </span>
            {canPromote && p.role === 'operative' && !p.keyTainted ? (
              <button type="button" onClick={() => socket.send({ type: 'PROMOTE_SPYMASTER', playerId: p.id })} className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] text-ink-muted ring-1 ring-hairline hover:text-ink">
                Promote
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {spymasterAway ? <p className="mt-2 text-[12px] text-ink-muted">Spymaster is away. A teammate can be promoted.</p> : null}
    </section>
  );
};
