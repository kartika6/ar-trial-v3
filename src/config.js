export const PRODUCT = Object.freeze({
  name: 'Your couch',
  // These are v2's prototype dimensions, not verified retail specifications.
  width: 84 * 0.0254,
  depth: 38 * 0.0254,
  height: 34 * 0.0254,
  dimensionLabel: '84 × 38 × 34 in',
});

export const COLORS = Object.freeze({
  original: {name: 'Original brown', hex: '#714333'},
  red: {name: 'Red', hex: '#a62007'},
  blue: {name: 'Blue', hex: '#074ca6'},
});

export const PLACEMENT_MAX_AGE_MS = 350;

export function usableHit(hits, cameraY) {
  return hits.find(hit => {
    const p = hit?.position;
    return ['DETECTED_SURFACE', 'ESTIMATED_SURFACE'].includes(hit.type)
      && p && [p.x, p.y, p.z, hit.distance].every(Number.isFinite)
      && hit.distance >= 0.5 && hit.distance <= 6
      // Absolute-scale ground is y=0. Reject walls, furniture tops, and ceilings.
      && Math.abs(p.y) <= 0.18 && cameraY - p.y > 0.3;
  }) ?? null;
}
