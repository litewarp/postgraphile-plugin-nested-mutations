import { GraphileConfig } from 'graphile-build';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'post_graphile_nested_types_plugin',
  version: '0.0.1',

  inflection: {
    add: {
      /* Types */
      nestedConnectorType(options, resource) {
        // name for the Input Object
        // e.g., SessionUserIdFkeyInput for user object in SessionInput
        // e.g., SessionUserIdFkeyInverseInput for session object in UserInput
        const { relationName, table, relationship } = resource;
        const isForward = relationship.isReferencee ? false : true;

        return this.upperCamelCase(
          [
            this.tableFieldName(table),
            relationship.localAttributes,
            'fkey',
            isForward ? null : 'inverse',
            'input',
          ]
            .filter(Boolean)
            .join('_'),
        );
      },
      nestedCreateInputType(options, resource) {
        // name for the create input type
        // e.g., SessionUserIdFkeyUserCreateInput
        // e.g., SessionUserIdFkeySessionCreateInput
        // constraint name = leftabletype + columnname _ fkey or pkey
        // constraint name + Create input
        const { relationName, table, relationship } = resource;

        const constraintName = [].join('_');

        return this.upperCamelCase(
          [
            this.tableFieldName(table),
            relationship.localAttributes,
            'fkey',
            this.tableFieldName(relationship.remoteResource),
            'input',
          ]
            .filter(Boolean)
            .join('_'),
        );
      },
    },
  },

  schema: {
    hooks: {
      init(init, build) {
        return init;
      },
    },
  },
};
