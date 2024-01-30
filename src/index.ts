import type { GraphileConfig } from 'graphile-build';
import {
  PostGraphileNestedTypesPlugin,
  PostGraphileNestedMutationsConnectPlugin,
  PostGraphileNestedMutationsCreatePlugin,
} from './plugins';

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [
    PostGraphileNestedMutationsConnectPlugin,
    PostGraphileNestedMutationsCreatePlugin,
    PostGraphileNestedTypesPlugin,
  ],
};
