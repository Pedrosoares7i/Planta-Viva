let counter = 0;

const random = (): string => {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
};

export const createId = (prefix: string): string => {
  counter += 1;
  return `${prefix}_${random()}${counter.toString(36)}`;
};

export const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
