import { GraphileConfig } from 'graphile-build';
import { PgResource } from '@dataplan/pg';
import { PgTableResource } from './interfaces';
import { gatherRelationshipData } from './gather-relationship-data';
import { createNestedConnectorType } from './create-nested-connector-type';

function isPgTableResource(r: PgResource): r is PgTableResource {
  return !!r.codec.attributes && !r.parameters;
}

export const NestedMutationConnectorsPlugin: GraphileConfig.Plugin = {
  name: '',
  version: '',
  description: '',
  experimental: true,
  provides: ['Nested Connectors'],
  schema: {
    hooks: {
      build(build) {
        return build.extend(
          build,
          {
            pgNestedTableConnectorFields: {},
          },
          'Nested Connectors',
        );
      },

      init(init, build, context) {
        const { pgResources } = build.input.pgRegistry;

        const {
          scope: {},
        } = context;

        const leftTables = Object.values(pgResources);

        for (const leftTable of leftTables) {
          // punt if not a pgTableResource
          if (!isPgTableResource(leftTable)) {
            continue;
          }
          const relationships = gatherRelationshipData(leftTable, build);
          // build relationships from the table and build options

          // add those to the nestedRelationship Resource Map

          // create the new input types
          for (const relationship of relationships) {
            createNestedConnectorType(relationship, build, leftTable);
            // create the new input types
            // create the new resolvers
            // add the new fields to the connector fields
          }
        }

        return init;
      },
    },
  },
};
