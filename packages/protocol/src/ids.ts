import { z } from 'zod';

export const TeamIdSchema = z.enum(['ember', 'tide']);
export type TeamId = z.infer<typeof TeamIdSchema>;

export const OwnerSchema = z.enum(['ember', 'tide', 'neutral', 'assassin']);
export type Owner = z.infer<typeof OwnerSchema>;

export const RoleSchema = z.enum(['spymaster', 'operative', 'spectator']);
export type Role = z.infer<typeof RoleSchema>;

export const PhaseSchema = z.enum(['clue', 'guess']);
export type Phase = z.infer<typeof PhaseSchema>;

export const GameStatusSchema = z.enum(['lobby', 'in_game', 'game_over']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const SeatStatusSchema = z.enum(['connected', 'away', 'left']);
export type SeatStatus = z.infer<typeof SeatStatusSchema>;

export const PlayerIdSchema = z.string().min(1).max(64);
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const TileIdSchema = z.number().int().min(0).max(24);
export type TileId = z.infer<typeof TileIdSchema>;

export const RoomCodeSchema = z
  .string()
  .regex(/^[A-Z2-9]{6}$/, 'Room codes are 6 characters, letters and digits (no 0, 1, O, I)');
export type RoomCode = z.infer<typeof RoomCodeSchema>;

export const NicknameSchema = z
  .string()
  .trim()
  .min(2, 'At least 2 characters')
  .max(16, 'At most 16 characters')
  .regex(/^[\p{L}\p{N} _'.-]+$/u, 'Letters, numbers, spaces and . _ - only');
export type Nickname = z.infer<typeof NicknameSchema>;

export const otherTeam = (team: TeamId): TeamId => (team === 'ember' ? 'tide' : 'ember');
