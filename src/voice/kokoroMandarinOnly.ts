// The optional English phonemizer is outside the Mandarin-only game build.
export async function phonemize(): Promise<never> {
  throw new Error('kokoro-language');
}
