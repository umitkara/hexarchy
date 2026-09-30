import { describe, expect, it } from 'vitest';
import { ENGINE_NAME, ENGINE_VERSION, getEngineInfo } from '../src/index';

describe('getEngineInfo', () => {
  it('reports the engine name and version', () => {
    expect(getEngineInfo()).toEqual({ name: ENGINE_NAME, version: ENGINE_VERSION });
  });

  it('uses a semver version string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
