import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { NicknameSchema, RoomCodeSchema } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { activateSession, clearSession, loadSession, peekPendingNickname, takePendingNickname, type StoredSession } from '@/shared/ws/session';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Panel } from '@/shared/ui/Panel';
import { TopBar } from '@/shared/ui/TopBar';
import { LobbyPage } from '@/features/lobby/LobbyPage';
import { GamePage } from '@/features/game/GamePage';
import { ResultsPage } from '@/features/results/ResultsPage';

interface Entry {
  active: StoredSession | null;
  remembered: StoredSession | null;
  pending: string | null;
}

/**
 * One route for the whole room. The server's status decides which screen renders, so every
 * client is on the same screen without navigation events to synchronise.
 */
export const RoomPage = () => {
  const params = useParams();
  const codeParsed = RoomCodeSchema.safeParse((params.code ?? '').toUpperCase());
  const roomCode = codeParsed.success ? codeParsed.data : null;
  const view = useGameStore((s) => s.view);
  const connection = useGameStore((s) => s.connection);
  const lastError = useGameStore((s) => s.lastError);
  const reset = useGameStore((s) => s.reset);

  // Read storage once, synchronously, so the first render already knows how we will enter.
  const [entry] = useState<Entry>(() => {
    if (!roomCode) return { active: null, remembered: null, pending: null };
    const { active, remembered } = loadSession(roomCode);
    return { active, remembered, pending: peekPendingNickname() };
  });
  const [joinedInline, setJoinedInline] = useState(false);

  useEffect(() => {
    if (!roomCode) return;
    if (entry.active) socket.connect({ roomCode, session: entry.active });
    else if (entry.pending) {
      takePendingNickname();
      socket.connect({ roomCode, nickname: entry.pending });
    }
    return () => {
      socket.disconnect();
      reset();
    };
  }, [roomCode, entry, reset]);

  const authFailed = !view && lastError?.code === 'NOT_AUTHED';
  const roomMissing = !view && lastError?.code === 'ROOM_NOT_FOUND';

  // A stored token the server no longer accepts is forgotten (external system, no state).
  useEffect(() => {
    if (authFailed && roomCode) clearSession(roomCode);
  }, [authFailed, roomCode]);

  if (!roomCode) return <NotFound message="That room code is not valid." />;
  if (roomMissing) return <NotFound message="No room with that code. It may have expired." />;

  if (!view) {
    const needsJoin = (!entry.active && !entry.pending) || authFailed;
    if (needsJoin && !joinedInline) {
      return (
        <JoinInline
          roomCode={roomCode}
          remembered={authFailed ? null : entry.remembered}
          onJoined={() => setJoinedInline(true)}
          error={lastError?.code === 'NAME_TAKEN' ? lastError.message : null}
        />
      );
    }
    if (joinedInline && lastError && lastError.code !== 'NOT_AUTHED') {
      // The inline join was rejected (name taken, room full): show the form again with the reason.
      return <JoinInline roomCode={roomCode} remembered={null} onJoined={() => setJoinedInline(true)} error={lastError.message} />;
    }
    return <Connecting state={connection} />;
  }

  switch (view.public.status) {
    case 'lobby':
      return <LobbyPage />;
    case 'in_game':
      return <GamePage />;
    case 'game_over':
      return <ResultsPage />;
  }
};

const Connecting = ({ state }: { state: string }) => (
  <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
    <TopBar />
    <div className="mx-auto mt-24 max-w-[440px]">
      <Panel inner="p-6">
        <div className="h-3 w-24 animate-pulse rounded-full bg-raised" />
        <div className="mt-4 h-8 w-64 animate-pulse rounded-lg bg-raised" />
        <p className="mt-6 text-[14px] text-ink-muted">{state === 'reconnecting' ? 'Reconnecting to the room.' : 'Connecting to the room.'}</p>
      </Panel>
    </div>
  </main>
);

const NotFound = ({ message }: { message: string }) => (
  <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
    <TopBar />
    <div className="mx-auto mt-24 max-w-[440px]">
      <h1 className="font-display text-[30px] font-bold text-ink">Room not found</h1>
      <p className="mt-2 text-ink-muted">{message}</p>
      <div className="mt-6 flex gap-3">
        <Link to="/join">
          <Button variant="secondary">Try another code</Button>
        </Link>
        <Link to="/new">
          <Button>Create a game</Button>
        </Link>
      </div>
    </div>
  </main>
);

const JoinInline = ({ roomCode, remembered, onJoined, error }: { roomCode: string; remembered: StoredSession | null; onJoined: () => void; error: string | null }) => {
  const [nickname, setNickname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const n = NicknameSchema.safeParse(nickname);
    if (!n.success) return setLocalError(n.error.issues[0]?.message ?? 'Pick a name');
    setLocalError(null);
    useGameStore.getState().dismissError();
    socket.connect({ roomCode, nickname: n.data });
    onJoined();
  };

  const rejoin = () => {
    if (!remembered) return;
    activateSession(remembered);
    socket.connect({ roomCode, session: remembered });
    onJoined();
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      <TopBar />
      <section className="mx-auto mt-10 max-w-[440px] sm:mt-20">
        <p className="text-[12px] uppercase tracking-[0.16em] text-ink-faint">Room</p>
        <h1 className="font-display tabular text-[40px] font-bold tracking-[0.2em] text-ink">{roomCode}</h1>
        {remembered ? (
          <Panel className="mt-6" inner="p-5">
            <p className="text-[15px] text-ink">You were here before as {remembered.nickname}.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={rejoin}>Rejoin as {remembered.nickname}</Button>
            </div>
          </Panel>
        ) : null}
        <Panel className="mt-6" inner="p-5">
          <form onSubmit={join} className="flex flex-col gap-5">
            <Field label={remembered ? 'Or join as someone else' : 'Your name'} value={nickname} onChange={(e) => setNickname(e.target.value)} autoFocus maxLength={16} error={localError ?? error} />
            <Button type="submit" variant={remembered ? 'secondary' : 'primary'}>
              Join room
            </Button>
          </form>
        </Panel>
      </section>
    </main>
  );
};
