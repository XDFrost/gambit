/** Room codes avoid 0/O and 1/I so they survive being read aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const generateRoomCode = (random: (n: number) => Uint8Array = randomBytes): string => {
  const bytes = random(ROOM_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  return out;
};

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export const randomHex = (bytes: number): string =>
  Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
