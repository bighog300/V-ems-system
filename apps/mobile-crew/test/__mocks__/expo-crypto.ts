let counter = 0;

export const getRandomBytesAsync = jest.fn(async (byteCount: number) => {
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i += 1) bytes[i] = (counter += 1) % 256;
  return bytes;
});

export const randomUUID = jest.fn(() => `test-uuid-${(counter += 1)}`);
