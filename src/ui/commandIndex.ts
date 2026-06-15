export const clampCommandActiveIndex = (index: number, itemCount: number) => {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), itemCount - 1);
};
