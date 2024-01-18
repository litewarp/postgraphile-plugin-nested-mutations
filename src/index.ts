import type { GraphileConfig } from 'graphile-build';
import { PostGraphileNestedConnectorsPlugin } from './type-definitions/connect-plugin';
import { PostGraphileNestedTypesPlugin } from './type-definitions/type-plugin';

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [PostGraphileNestedConnectorsPlugin, PostGraphileNestedTypesPlugin],
};
