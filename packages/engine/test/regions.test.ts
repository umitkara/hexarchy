import { describe, expect, it } from 'vitest';
import { computeRegions, getRegions, innermostTile, regionAt, regionCenter } from '../src/rules';
import { parseFixture } from './fixtures/ascii';

function regionSizes(text: string): number[] {
  const { state } = parseFixture(text);
  return computeRegions(state, state.owners).regions.map((r) => r.tiles.length);
}

describe('regions (treasury graph)', () => {
  it('groups connected tiles of the same owner', () => {
    const { state, tile } = parseFixture(`
      A*  A   .   B*  B
        A   .   .   B   .
      .   .   A   A   .
    `);
    const regions = computeRegions(state, state.owners);
    expect(regions.regions.map((r) => [r.owner, r.tiles.length])).toEqual([
      [0, 3],
      [1, 3],
      [0, 2],
    ]);
    expect(regionAt(regions, tile(2, 2))?.tiles).toEqual([tile(2, 2), tile(3, 2)]);
    expect(regionAt(regions, tile(1, 1))).toBeUndefined();
    expect(regionCenter(state, regions.regions[0] ?? { id: 0, owner: 0, tiles: [] })).toBe(
      tile(0, 0),
    );
  });

  it('is cut by a river that separates the tiles completely', () => {
    expect(
      regionSizes(`
        A   A  |A   A
                \\
          A   A  |A   A
      `),
    ).toEqual([4, 4]);
  });

  it('is not cut by a river with a way around it', () => {
    // The diagonal side between the rows stays open.
    expect(
      regionSizes(`
        A   A  |A   A
          A   A  |A   A
      `),
    ).toEqual([8]);
  });

  it('is joined by a ford in the river', () => {
    expect(
      regionSizes(`
        A   A  =A   A
                \\
          A   A  |A   A
      `),
    ).toEqual([8]);
  });

  it('ignores rivers between different owners and neutral tiles', () => {
    expect(
      regionSizes(`
        A  |B   .  |A
      `),
    ).toEqual([1, 1, 1]);
  });

  it('memoizes per ownership snapshot', () => {
    const { state } = parseFixture('A   A   B');
    expect(getRegions(state)).toBe(getRegions(state));
    expect(getRegions({ ...state, owners: [...state.owners] })).not.toBe(getRegions(state));
  });
});

describe('innermostTile', () => {
  it('picks the tile farthest from the region edge', () => {
    const { state, tile } = parseFixture(`
      .   .   .   .   .
        .   A   A   .   .
      .   A   A   A   .
        .   A   A   .   .
      .   .   .   .   .
    `);
    const regions = computeRegions(state, state.owners);
    const region = regions.regions[0];
    if (!region) throw new Error('no region');
    expect(innermostTile(state, regions, region)).toBe(tile(2, 2));
  });

  it('treats a river side as the region edge', () => {
    // Same blob, but a river cuts the middle tile off from its west neighbor: now every
    // tile touches the edge, and the tie goes to the tile nearest the middle.
    const { state, tile } = parseFixture(`
      .   .   .   .   .
        .   A   A   .   .
      .   A  |A   A   .
        .   A   A   .   .
      .   .   .   .   .
    `);
    const regions = computeRegions(state, state.owners);
    const region = regions.regions[0];
    if (!region) throw new Error('no region');
    expect(region.tiles).toHaveLength(7);
    expect(innermostTile(state, regions, region)).toBe(tile(2, 2));
  });

  it('breaks full ties by the lowest tile index', () => {
    const { state, tile } = parseFixture('.   A   A   .');
    const regions = computeRegions(state, state.owners);
    const region = regions.regions[0];
    if (!region) throw new Error('no region');
    expect(innermostTile(state, regions, region)).toBe(tile(1, 0));
  });
});
