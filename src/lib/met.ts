export const LIFTING_MET = 6.0;
export const MINUTES_PER_SET = 1;

export function liftingMetMinutes(setCount: number): number {
  if (setCount <= 0) return 0;
  return setCount * MINUTES_PER_SET * LIFTING_MET;
}
