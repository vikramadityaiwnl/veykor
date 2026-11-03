import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const version = "v1";

const saltBytes = 16;

const keyLength = 64;

const scryptOptions = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, derived) => {
      if (error) {
        reject(error);
      } else {
        resolve(derived);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes).toString("hex");
  const derived = await deriveKey(password, salt);

  return `${version}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");

  if (parts.length !== 3 || parts[0] !== version) {
    return false;
  }

  const salt = parts[1];
  const expected = parts[2];

  if (!/^[0-9a-f]+$/.test(salt) || !/^[0-9a-f]+$/.test(expected)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");

  if (expectedBuffer.length !== keyLength) {
    return false;
  }

  const derived = await deriveKey(password, salt);

  return timingSafeEqual(derived, expectedBuffer);
}
