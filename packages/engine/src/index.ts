export const ENGINE_NAME = 'hexarchy-engine';
export const ENGINE_VERSION = '0.0.0';

export interface EngineInfo {
  readonly name: string;
  readonly version: string;
}

export function getEngineInfo(): EngineInfo {
  return { name: ENGINE_NAME, version: ENGINE_VERSION };
}
