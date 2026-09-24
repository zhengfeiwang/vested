const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

// 48-bit timestamp (10 chars) + 80-bit randomness (16 chars).
export function ulid(now: number = Date.now()): string {
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ENCODING[now % 32] + time;
    now = Math.floor(now / 32);
  }
  let rand = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of crypto.getRandomValues(new Uint8Array(10))) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rand += ENCODING[(buffer >>> bits) & 31];
    }
  }
  return time + rand;
}
