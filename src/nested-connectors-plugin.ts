import { GraphileConfig } from 'graphile-build';
import { PgResource } from '@dataplan/pg';

declare global {
  namespace GraphileBuild {
    interface Inflection {
      nestedConnectByNodeIdField(
        this: Inflection,
        resource: PgResource,
      ): string;
    }
  }
}

const config: GraphileConfig.Plugin = {
  name: '',
  version: '',
  description: '',
  experimental: true,
  provides: ['Nested Mutations'],
  after: [''],
  before: [''],
  inflection: {
    add: {},
  },
  gather: {},
  schema: {},
};
