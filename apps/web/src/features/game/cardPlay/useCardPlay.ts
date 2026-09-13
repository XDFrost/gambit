import { useCallback, useMemo } from 'react';
import type { CardDefinitionView, TileId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';

/**
 * The play-a-card interaction: inspect -> begin (targeting or confirm) -> confirm -> send.
 * All eligibility comes from the server-computed `playability`, so the client and server agree.
 */
export const useCardPlay = () => {
  const view = useGameStore((s) => s.view);
  const targeting = useGameStore((s) => s.targeting);
  const confirmCardId = useGameStore((s) => s.confirmCardId);
  const inspectingCardId = useGameStore((s) => s.inspectingCardId);
  const inspect = useGameStore((s) => s.inspect);
  const startTargeting = useGameStore((s) => s.startTargeting);
  const pickTile = useGameStore((s) => s.pickTile);
  const setConfirm = useGameStore((s) => s.setConfirm);

  const catalog = view?.public.cardCatalog ?? {};
  const hand = view?.team?.hand ?? [];
  const playability = view?.team?.playability ?? {};

  const defOf = (cardId: string): CardDefinitionView | null => {
    const inst = hand.find((c) => c.id === cardId);
    return inst ? catalog[inst.defId] ?? null : null;
  };

  const reasonFor = (cardId: string): string | null => {
    const p = playability[cardId];
    if (!p) return 'Not in your hand.';
    return p.playable ? null : p.reason ?? 'Cannot be played right now.';
  };

  const beginPlay = (cardId: string) => {
    const def = defOf(cardId);
    if (!def) return;
    const p = playability[cardId];
    if (!p?.playable) return;
    const kind = def.targeting.kind;
    if (kind === 'tile' || kind === 'two_tiles') {
      startTargeting({ cardId, needed: kind === 'tile' ? 1 : 2, picked: [], validTiles: p.validTiles ?? [] });
      return;
    }
    if (kind === 'none' || kind === 'discard_top') {
      inspect(null);
      setConfirm(cardId);
      return;
    }
    // Row / block / hand-card targeting is not in the MVP pool.
    inspect(null);
    useGameStore.setState({ lastError: { code: 'CONDITION_FAILED', message: 'This card type is not supported yet.', at: Date.now() } });
  };

  const onTargetTile = useCallback(
    (tile: TileId) => {
      const t = useGameStore.getState().targeting;
      if (!t) return;
      pickTile(tile);
      const after = useGameStore.getState().targeting;
      if (after && after.picked.length === after.needed) setConfirm(after.cardId);
    },
    [pickTile, setConfirm],
  );

  const cancel = useCallback(() => {
    startTargeting(null);
    setConfirm(null);
    inspect(null);
  }, [startTargeting, setConfirm, inspect]);

  const confirm = useCallback(() => {
    const s = useGameStore.getState();
    const cardId = s.confirmCardId;
    const turn = s.view?.public.turn;
    if (!cardId || !turn) return;
    const tiles = s.targeting?.cardId === cardId ? s.targeting.picked : [];
    socket.send(
      { type: 'PLAY_CARD', cardInstanceId: cardId, ...(tiles.length ? { target: { tiles } } : {}), expectedTurnIndex: turn.index },
      { cardId },
    );
    startTargeting(null);
    setConfirm(null);
  }, [startTargeting, setConfirm]);

  const confirmDef = confirmCardId ? defOf(confirmCardId) : null;
  const confirmTiles = useMemo(
    () => (targeting && confirmCardId && targeting.cardId === confirmCardId ? targeting.picked : []),
    [targeting, confirmCardId],
  );

  return { hand, catalog, defOf, reasonFor, inspectingCardId, inspect, beginPlay, targeting, onTargetTile, confirmCardId, confirmDef, confirmTiles, confirm, cancel };
};
