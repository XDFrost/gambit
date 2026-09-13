import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowRight } from '@phosphor-icons/react';
import { NicknameSchema, RoomCodeSchema } from '@gambit/protocol';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Panel } from '@/shared/ui/Panel';
import { TopBar } from '@/shared/ui/TopBar';
import { setPendingNickname } from '@/shared/ws/session';

const normalizeCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export const JoinGamePage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [code, setCode] = useState(normalizeCode(params.code ?? ''));
  const [nickname, setNickname] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = RoomCodeSchema.safeParse(code);
    const n = NicknameSchema.safeParse(nickname);
    setCodeError(c.success ? null : 'Six letters or digits, no O, 0, I or 1.');
    setNameError(n.success ? null : n.error.issues[0]?.message ?? 'Pick a name');
    if (!c.success || !n.success) return;
    setPendingNickname(n.data);
    navigate(`/room/${c.data}`);
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      <TopBar />
      <section className="mx-auto mt-10 max-w-[440px] sm:mt-20">
        <h1 className="font-display text-[34px] font-bold tracking-tight text-ink">Join a game</h1>
        <p className="mt-2 text-[15px] text-ink-muted">Ask the host for the room code.</p>
        <Panel className="mt-8" inner="p-5">
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field
              label="Room code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              autoFocus={!params.code}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="tabular text-[22px] tracking-[0.3em] uppercase"
              error={codeError}
            />
            <Field
              label="Your name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoFocus={!!params.code}
              autoComplete="nickname"
              maxLength={16}
              error={nameError}
            />
            <Button type="submit" trailing={<ArrowRight size={16} />}>
              Join room
            </Button>
          </form>
        </Panel>
      </section>
    </main>
  );
};
