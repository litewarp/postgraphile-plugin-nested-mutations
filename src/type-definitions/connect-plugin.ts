import { PgResource } from '@dataplan/pg';
import { GraphileConfig } from 'graphile-build';
import { PgTableResource } from '../interfaces';
import { gatherRelationshipData } from '../gather-relationship-data';

type BuildInputObjectArguments = Parameters<
  GraphileBuild.Build['registerInputObjectType']
>;

export const PostGraphileNestedConnectorsPlugin: GraphileConfig.Plugin = {
  name: 'postgraphile_nested_connectors_plugin',
  version: '0.0.1',

  inflection: {
    add: {
      nestedConnectByNodeIdFieldName() {
        return this.camelCase(`connect_by_node_id_${this.nodeIdFieldName()}`);
      },
      nestedConnectByKeyFieldName(options, resource) {
        const keys = resource.uniques.reduce((acc, unique) => {
          return [...acc, ...unique.attributes];
        }, [] as string[]);

        return this.camelCase(`connect_by_${keys.join('_and_')}`);
      },
      nestedConnectByNodeIdInputType(options, resource) {
        const tableName = this.tableFieldName(resource);
        return this.upperCamelCase(`${tableName}_node_id_connect`);
      },
      nestedConnectByKeyInputType(options, resource) {
        const tableFieldName = this.tableFieldName(resource);

        const keys = resource.uniques.reduce((acc, unique) => {
          if (unique.isPrimary) {
            return [...acc, unique.attributes.join('_and_'), 'pkey'];
          }
          return [...acc, unique.attributes.join('_and_'), 'key'];
        }, [] as string[]);

        return this.upperCamelCase(
          `${tableFieldName}_${keys.join('_and_')}_connect`,
        );
      },
    },
  },
  schema: {
    hooks: {
      init(init, build) {
        const {
          inflection,
          graphql: { GraphQLNonNull, GraphQLID },
          getGraphQLTypeByPgCodec,
        } = build;
        // create obj to store data in
        const pgNestedMutationsByTypeName: Record<
          string,
          { table: PgTableResource; fieldName: string }
        > = {};

        const { pgResources } = build.input.pgRegistry;

        const leftTables = Object.values(pgResources);

        for (const leftTable of leftTables) {
          if (!isPgTableResource(leftTable)) {
            continue;
          }

          const relationshipDetails = gatherRelationshipData(leftTable, build);

          for (const detail of relationshipDetails) {
            // build type
            const { relationName, relationship, table } = detail;

            const foreignTable = relationship.remoteResource;

            const connectByNodeId = [
              inflection.nestedConnectByNodeIdFieldName(foreignTable),
              inflection.nestedConnectByNodeIdInputType(foreignTable),
            ] as const;

            const connectByNodeIdInputType: BuildInputObjectArguments = [
              connectByNodeId[1],
              {
                isNestedMutationInputType: true,
                isNestedMutationConnectByNodeIdType: true,
                pgCodec: foreignTable.codec,
              },
              () => ({
                description: `The globally unique \`ID\` look up for the row to connect.`,
                fields: ({ fieldWithHooks }) => {
                  const fieldName = inflection.nodeIdFieldName();
                  return {
                    [fieldName]: fieldWithHooks(
                      {
                        fieldName,
                      },
                      () => ({
                        type: new GraphQLNonNull(GraphQLID),
                      }),
                    ),
                  };
                },
              }),
              'connect-by-node-id',
            ];
            if (!pgNestedMutationsByTypeName[connectByNodeId[1]]) {
              build.registerInputObjectType(...connectByNodeIdInputType);
              pgNestedMutationsByTypeName[connectByNodeId[1]] = {
                table: foreignTable,
                fieldName: connectByNodeId[0],
              };
            }

            const codecs = Object.entries(foreignTable.codec.attributes).filter(
              ([k, v]) => relationship.remoteAttributes.includes(k),
            );

            const connectByKeyField = [
              inflection.nestedConnectByKeyFieldName(foreignTable),
              inflection.nestedConnectByKeyInputType(foreignTable),
            ] as const;

            const connectByKeyInputType: BuildInputObjectArguments = [
              connectByKeyField[1],
              {
                isNestedMutationInputType: true,
                isNestedMutationConnectInputType: true,
                pgCodec: foreignTable.codec,
              },
              () => ({
                description: `The fields on \`${inflection.tableFieldName(
                  foreignTable,
                )}\` to look up the row to connect.`,
                fields: ({ fieldWithHooks }) => {
                  return codecs.reduce((acc, [fieldName, v]) => {
                    const fieldType = getGraphQLTypeByPgCodec(v.codec, 'input');
                    if (!fieldType) return { ...acc };
                    return {
                      ...acc,
                      [fieldName]: {
                        type: new GraphQLNonNull(fieldType),
                      },
                    };
                  }, {});
                },
              }),
              'connect-by-unique-key-field',
            ];

            if (!pgNestedMutationsByTypeName[connectByKeyField[1]]) {
              build.registerInputObjectType(...connectByKeyInputType);
              pgNestedMutationsByTypeName[connectByKeyField[1]] = {
                table: foreignTable,
                fieldName: connectByKeyField[0],
              };
            }
            console.log(pgNestedMutationsByTypeName);
          }
        }

        // build.pgNestedMutationsByTypeName = pgNestedMutationsByTypeName;

        // attach obj to build
        // build.extend(
        //   build,
        //   { pgNestedMutationsByTypeName },
        //   'add map of types containing fields',
        // );

        return init;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {
          extend,
          sql,
          grafast,
          inflection,
          graphql: { GraphQLInputObjectType },
        } = build;

        const {
          scope: {
            isNestedMutationInputType,
            isNestedMutationConnectByNodeIdType,
            isNestedMutationConnectInputType,
            pgCodec,
          },
        } = context;

        return fields;
      },
    },
  },
};

function isPgTableResource(r: PgResource): r is PgTableResource {
  return !!r.codec.attributes && !r.parameters;
}
