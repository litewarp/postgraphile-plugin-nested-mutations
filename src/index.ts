import type { GraphileConfig } from 'graphile-build';
import { PostGraphileNestedConnectorsPlugin } from './type-definitions/connect-plugin';
import { PgNestedMutationsSchemaPlugin } from './type-definitions/pg-relations-adaptation';

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [PgNestedMutationsSchemaPlugin],
};
