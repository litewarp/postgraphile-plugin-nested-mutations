import { PgResource } from '@dataplan/pg';
import { GraphileConfig } from 'graphile-build';
import { PgTableResource } from '../interfaces';

export const PostGraphileNestedConnectorsPlugin: GraphileConfig.Plugin = {
  name: 'postgraphile_nested_connectors_plugin',
  description: 'PostGraphile plugin for nested connector types',
  version: '0.0.1',
  after: [],

  inflection: {
    add: {
      nestedConnectByNodeIdFieldName(options) {
        return this.camelCase(`connect_by_${this.nodeIdFieldName()}`);
      },
      nestedConnectByNodeIdInputType(options, { table }) {
        const tableFieldName = this.tableFieldName(table);
        return this.upperCamelCase(`${tableFieldName}_node_id_connect`);
      },
      nestedConnectByKeyInputType(options, { table, relationship }) {
        // to do - allow overriding of names through tags

        const tableFieldName = this.tableFieldName(table);

        const unique = table.uniques.find((u) => {
          return u.attributes.every((a) =>
            relationship.localAttributes.includes(a),
          );
        });
        if (!unique) {
          throw new Error(
            `No foreignKey found for ${relationship.localAttributes.join(
              ', ',
            )}`,
          );
        }
        // create the constraint name - examples
        // pkey => table_name_pkey
        // fkey => table_name_column_name_key
        const keyName = unique.isPrimary ? 'pk' : unique.attributes.join('_');

        return this.upperCamelCase(`${tableFieldName}_${keyName}_connect`);
      },
      nestedConnectByKeyFieldName(options, { table, relationship }) {
        const unique = table.uniques.find((u) => {
          return u.attributes.every((a) =>
            relationship.localAttributes.includes(a),
          );
        });
        if (!unique) {
          throw new Error(
            `No foreignKey found for ${relationship.localAttributes.join(
              '_and_',
            )}`,
          );
        }

        return this.camelCase(`connect_by_${unique.attributes.join('_and_')}`);
      },
    },
  },
  schema: {
    hooks: {
      build(build) {
        build.pgNestedConnectorFields = {};
        return build;
      },
      init(init, build, context) {
        const {
          inflection,
          getGraphQLTypeByPgCodec,
          pgNestedConnectorFields,
          graphql: { GraphQLNonNull, GraphQLID },
        } = build;

        const pgResources = build.input.pgRegistry.pgResources ?? {};

        const tables = Object.values(pgResources);

        for (const table of tables) {
          if (!isPgTableResource(table)) {
            continue;
          }

          const tableFieldName = inflection.tableFieldName(table);
          pgNestedConnectorFields[table.name] = [];

          for (const [relationName, relationship] of Object.entries(
            table.getRelations(),
          )) {
            // remove forward relations
            if (!relationship.isReferencee) {
              continue;
            }

            // return the object
            const unique = table.uniques.find((u) => {
              return u.attributes.every((a) =>
                relationship.localAttributes.includes(a),
              );
            });

            if (!unique) {
              throw new Error(
                `No unique constraint found for ${relationship.localAttributes.join(
                  '_and_',
                )}`,
              );
            }

            const typeName = inflection.nestedConnectByKeyInputType({
              table,
              relationship,
              relationName,
            });

            const exists = pgNestedConnectorFields[table.name]?.find(
              (o) => o.typeName === typeName,
            );

            if (!exists) {
              build.registerInputObjectType(
                typeName,
                {
                  isNestedMutationInputType: true,
                  isNestedMutationConnectInputType: true,
                },
                () => ({
                  description: `The fields on \`${tableFieldName}\` to look up the row to connect.`,
                  fields: ({ fieldWithHooks }) =>
                    unique.attributes.reduce((memo, attr) => {
                      const pgAttribute = table.codec.attributes[attr];
                      if (!pgAttribute) {
                        throw new Error(
                          `Could not find attribute ${attr} on ${table.name}`,
                        );
                      }
                      const type = getGraphQLTypeByPgCodec(
                        pgAttribute.codec,
                        'input',
                      );
                      if (!type) {
                        throw new Error(
                          `Could not find type for ${attr} on ${table.name}`,
                        );
                      }
                      return {
                        [attr]: fieldWithHooks(
                          {
                            fieldName: attr,
                          },
                          () => ({
                            type: new GraphQLNonNull(type),
                          }),
                        ),
                      };
                    }, {}),
                }),
                `Adding connect by unique key input type for ${table.name}`,
              );
            }

            pgNestedConnectorFields[table.name]!.push({
              fieldName: inflection.nestedConnectByKeyFieldName({
                table,
                relationship,
                relationName,
              }),
              unique,
              typeName,
              relationship,
            });

            // add type for nodeId if type supports it
            const getSpec = build.nodeIdSpecForCodec(table.codec);
            if (getSpec) {
              const nodeTypeName = inflection.nestedConnectByNodeIdInputType({
                table,
                relationship,
                relationName,
              });

              const exists = pgNestedConnectorFields[table.name]?.find(
                (o) => o.typeName === nodeTypeName,
              );

              if (!exists) {
                build.registerInputObjectType(
                  nodeTypeName,
                  {
                    isNestedMutationInputType: true,
                    isNestedMutationConnectInputType: true,
                    isNestedMutationConnectByNodeIdType: true,
                  },
                  () => ({
                    description:
                      'The globally unique `ID` look up for the row to connect.',
                    fields: ({ fieldWithHooks }) => ({
                      [inflection.nodeIdFieldName()]: fieldWithHooks(
                        {
                          fieldName: inflection.nodeIdFieldName(),
                        },
                        () => ({
                          description: `The globally unique \`ID\` which identifies a single \`${tableFieldName}\` to be connected.`,
                          type: new GraphQLNonNull(GraphQLID),
                        }),
                      ),
                    }),
                  }),
                  `Adding connect by nodeId input type for ${table.name}`,
                );

                pgNestedConnectorFields[table.name]!.push({
                  fieldName: inflection.nestedConnectByNodeIdFieldName(),
                  typeName,
                  isNodeIdConnector: true,
                  relationship,
                });
              }
            }
          }
        }

        return init;
      },
    },
  },
};

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return !!r.codec.attributes && !r.parameters;
}
