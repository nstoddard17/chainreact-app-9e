/**
 * Coerce a picker/mapped id string to the integer Motive expects — MOTIVE-1.
 * Pickers save Motive's numeric id as a string; variable mapping can also carry
 * one. A non-numeric value fails the run legibly instead of sending garbage.
 */
export function toMotiveId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `Motive ${label} must be a positive numeric id (got "${value}").`,
    );
  }
  return n;
}
