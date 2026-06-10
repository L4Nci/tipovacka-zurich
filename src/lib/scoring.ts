export type SportId = 'football' | 'hockey';

export const calculatePoints = (
  ph: number,
  pa: number,
  mh: number,
  ma: number,
  sport: SportId = 'football'
): number => {
  if (ph === mh && pa === ma) return 5;

  if (sport === 'football') {
    const isActualDraw = mh === ma;
    const isPredictedDraw = ph === pa;

    if (isActualDraw) {
      return isPredictedDraw ? 2 : 0;
    }

    const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);
    if (!correctWinner) return 0;

    return ph - pa === mh - ma ? 3 : 2;
  }

  if ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) return 2;

  return 0;
};
