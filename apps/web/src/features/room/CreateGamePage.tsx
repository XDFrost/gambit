import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight } from '@phosphor-icons/react';
import { NicknameSchema } from '@gambit/protocol';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Panel } from '@/shared/ui/Panel';
import { TopBar } from '@/shared/ui/TopBar';
import { setPendingNickname } from '@/shared/ws/session';
import { apiUrl } from '@/shared/config';

export const CreateGamePage = () => {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = NicknameSchema.safeParse(nickname);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Pick a name');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/rooms'), { method: 'POST' });
      if (!res.ok) throw new Error(`Server said ${res.status}`);
      const { roomCode } = (await res.json()) as { roomCode: string };
      setPendingNickname(parsed.data);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? `Could not create a room. ${err.message}` : 'Could not create a room.');
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      <TopBar />
      <section className="mx-auto mt-10 max-w-[440px] sm:mt-20">
        <h1 className="font-display text-[34px] font-bold tracking-tight text-ink">Create a game</h1>
        <p className="mt-2 text-[15px] text-ink-muted">You will get a six-letter code to share. You host the lobby.</p>
        <Panel className="mt-8" inner="p-5">
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field
              label="Your name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoFocus
              autoComplete="nickname"
              maxLength={16}
              hint="2 to 16 characters. Others see this in the room."
              error={error}
            />
            <Button type="submit" loading={busy} trailing={<ArrowRight size={16} />}>
              {busy ? 'Creating' : 'Create room'}
            </Button>
          </form>
        </Panel>
      </section>
    </main>
  );
};
