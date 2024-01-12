import type { GraphileConfig } from 'graphile-build';
import { PostGraphileNestedConnectorsPlugin } from './type-definitions/connect-plugin';

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [PostGraphileNestedConnectorsPlugin],
};
