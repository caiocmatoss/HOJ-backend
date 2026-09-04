/** Returns the rounded percentage of a venue's known capacity that is occupied. */
export function getOccupancyPercent(
  occupancy: number,
  capacity: number | null | undefined,
): number | null {
  if (capacity == null || capacity <= 0 || !Number.isFinite(occupancy)) {
    return null;
  }

  return Math.round((occupancy / capacity) * 100);
}
