export const ENGINE_NAME = 'hexarchy-engine';
export const ENGINE_VERSION = '0.1.0';

export interface EngineInfo {
  readonly name: string;
  readonly version: string;
}

export function getEngineInfo(): EngineInfo {
  return { name: ENGINE_NAME, version: ENGINE_VERSION };
}

export * from './balance';
export * from './commands';
export * from './hex';
export * from './map';
export * from './rng';
export * from './rules';
export * from './state';
