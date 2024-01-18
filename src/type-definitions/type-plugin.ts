import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './connect-plugin';
import { GrafastInputFieldConfig } from 'grafast';
import type {
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLScalarType,
} from 'graphql';
import { PgCodecWithAttributes } from '@dataplan/pg';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'post_graphile_nested_types_plugin',
  description: 'PostGraphile plugin for nested types',
  version: '0.0.1',
  after: ['PostGraphileNestedConnectorsPlugin'],

  inflection: {
    add: {
      nestedConnectorFieldType(options, details) {
        // name for the Input Object
        // e.g., SessionUserIdFkeyInput for user object in SessionInput
        // e.g., SessionUserIdFkeyInverseInput for session object in UserInput
        const { table, relationship } = details;

        const isForward = !relationship.isReferencee;

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
      nestedCreateInputType(options, details) {
        // name for the create input type
        // e.g., SessionUserIdFkeyUserCreateInput
        // e.g., SessionUserIdFkeySessionCreateInput

        const { table, relationship } = details;

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
      nestedConnectorFieldName(options, details) {
        const foreignTable = details.relationship.remoteResource;
        const tableFieldName = this.tableFieldName(foreignTable);
        const { localAttributes, remoteAttributes, isUnique, isReferencee } =
          details.relationship;

        const multipleFks =
          Object.keys(details.table.getRelations()).length > 1;

        console.log(details.table.name, details.table.uniques, localAttributes);

        const computedReverseMutationName = this.camelCase(
          isUnique ? tableFieldName : this.pluralize(tableFieldName),
        );

        if (!isReferencee) {
          return this.camelCase(
            `${tableFieldName}_to_${localAttributes.join('_and_')}`,
          );
        }

        if (!multipleFks) {
          return this.camelCase(
            `${computedReverseMutationName}_using_${localAttributes.join(
              '_and_ ',
            )}`,
          );
        }

        return this.camelCase(
          `${computedReverseMutationName}_to_${localAttributes.join(
            '_and_',
          )}_using_${remoteAttributes.join('_and_')}`,
        );
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        build.pgNestedPluginForwardInputTypes = {};
        build.pgNestedPluginReverseInputTypes = {};
        build.pgNestedTableDeleterFields = {};
        build.pgNestedFieldName = '';
        return build;
      },

      init(init, build, context) {
        const {
          inflection,
          getGraphQLTypeByPgCodec,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          pgNestedConnectorFields,
          pgNestedTableDeleterFields,
          pgNestedTableUpdaterFields,
          pgNestedFieldName,
          pgTableResource,
          graphql: { GraphQLInputObjectType, GraphQLList, GraphQLNonNull },
        } = build;

        const pgResources = build.input.pgRegistry.pgResources ?? {};

        const tables = Object.values(pgResources);

        for (const table of tables) {
          if (!isPgTableResource(table)) {
            continue;
          }

          const relations = table.getRelations();

          if (!Object.keys(relations).length) {
            // table has no foreign relations
            return init;
          }

          const tableTypeName = inflection.tableType(table.codec);

          pgNestedPluginForwardInputTypes[table.name] = [];
          pgNestedPluginReverseInputTypes[table.name] = [];

          for (const [relationName, relationship] of Object.entries(
            relations,
          )) {
            // todo: add behavior checks
            const isForward = !relationship.isReferencee;
            const foreignTable = relationship.remoteResource;

            const foreignTableName = inflection.tableFieldName(foreignTable);

            const detail = {
              table,
              relationship,
              relationName,
            };

            const fieldName = inflection.nestedConnectorFieldName(detail);
            console.log(fieldName);

            const nestedConnectorFieldType =
              inflection.nestedConnectorFieldType(detail);

            const exists = [
              ...(pgNestedPluginForwardInputTypes[table.name] ?? []),
              ...(pgNestedPluginReverseInputTypes[table.name] ?? []),
            ].find(
              (x) => x.connectorInputFieldType === nestedConnectorFieldType,
            );

            if (!exists) {
              build.registerInputObjectType(
                nestedConnectorFieldType,
                {
                  isNestedMutationConnectorType: true,
                  isNestedInverseMutation: !isForward,
                },
                () => ({
                  description: `Input for the nested mutation of \`${foreignTableName}\` in the \`${tableTypeName}\` mutation.`,
                  fields: ({ fieldWithHooks }) => {
                    const foreignTableType = getGraphQLTypeByPgCodec(
                      foreignTable.codec,
                      'input',
                    ) as GraphQLInputObjectType;

                    const operations: Record<
                      string,
                      GrafastInputFieldConfig<any, any, any, any, any>
                    > = {};

                    // add delete others field if backwards relation and deleteable

                    pgNestedConnectorFields[foreignTable.name]?.forEach(
                      ({
                        typeName,
                        fieldName: connectorFieldName,
                        relationship,
                      }) => {
                        operations[connectorFieldName] = fieldWithHooks(
                          { fieldName: connectorFieldName },
                          () => ({
                            type: relationship.isUnique
                              ? build.getInputTypeByName(typeName)
                              : new GraphQLList(
                                  new GraphQLNonNull(
                                    build.getInputTypeByName(typeName),
                                  ),
                                ),

                            description: `The primary key(s) for \`${foreignTableName}\` for the far side of the relationship.`,
                          }),
                        );
                      },
                    );

                    // add delete fields if deleteable

                    // add nested updater fields

                    // if creatable, add create field
                    const createInputTypeName =
                      inflection.nestedCreateInputType(detail);

                    const createInputType = new GraphQLInputObjectType({
                      name: createInputTypeName,
                      description: `The \`${foreignTableName}\` to be created by this mutation.`,
                      fields: () => {
                        const inputFields = foreignTableType.getFields();

                        return Object.entries(inputFields).reduce(
                          (memo, [k, v]) => {
                            if (v) {
                              return { ...memo, [k]: v };
                            }
                            return memo;
                          },
                          {},
                        );
                      },
                    });

                    operations.create = fieldWithHooks(
                      {
                        fieldName: 'create',
                        isNestedMutationInputType: true,
                        isNestedMutationCreateInputType: true,
                        isNestedInverseMutation: !isForward,
                      },
                      () => ({
                        description: `A \`${foreignTableType}\` object that will be created and connected to this object.`,
                        type: isForward
                          ? createInputType
                          : new GraphQLList(
                              new GraphQLNonNull(createInputType),
                            ),
                      }),
                    );

                    return operations;
                  },
                }),
                `Nested connector field type for field ${fieldName} on table ${table.name}`,
              );
            }
            if (isForward) {
              pgNestedPluginForwardInputTypes[table.name]?.push({
                ...detail,
                name: fieldName,
                connectorInputFieldType: nestedConnectorFieldType,
              });
            } else {
              pgNestedPluginReverseInputTypes[table.name]?.push({
                ...detail,
                name: fieldName,
                connectorInputFieldType: nestedConnectorFieldType,
              });
            }
          }
        }

        return init;
      },
      GraphQLInputObjectType_fields(inFields, build, context) {
        const {
          inflection,
          extend,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
        } = build;

        const {
          scope: { isPgRowType, pgCodec, isPgPatch },
          Self,
          fieldWithHooks,
        } = context;

        let fields = inFields;

        const nestedFields: GraphQLInputFieldConfigMap = {};
        if (isPgRowType && pgCodec) {
          const table = build.pgTableResource(pgCodec as PgCodecWithAttributes);
          if (!table) {
            throw new Error(`Could not find table for ${pgCodec.name}`);
          }
          const forwardTypes =
            pgNestedPluginForwardInputTypes[table.name] ?? [];

          const reverseTypes =
            pgNestedPluginReverseInputTypes[table.name] ?? [];

          for (const {
            table,
            relationship: { localAttributes },
            name,
            connectorInputFieldType,
          } of forwardTypes) {
            // override nulls on keys that have forward mutations available
            localAttributes.forEach((attr) => {
              const field = fields[inflection.camelCase(attr)];
              if (!field) {
                throw new Error(
                  `Could not find field ${attr} on input object ${Self.name}`,
                );
              }

              const codec = table.codec.attributes[attr];
              if (!codec) {
                throw new Error(
                  `Could not find codec for ${attr} on table ${table.name}`,
                );
              }

              const type = build.getGraphQLTypeByPgCodec(
                codec.codec,
                'input',
              ) as GraphQLScalarType;
              if (!type) {
                throw new Error(`Could not find type for codec ${codec}`);
              }
              nestedFields[attr] = {
                ...field,
                type,
              };
            });

            nestedFields[name] = fieldWithHooks(
              {
                fieldName: name,
              },
              () => ({
                type: build.getInputTypeByName(connectorInputFieldType),
              }),
            );
          }

          for (const { name, connectorInputFieldType } of reverseTypes) {
            nestedFields[name] = fieldWithHooks(
              {
                fieldName: name,
              },
              () => ({
                type: build.getInputTypeByName(connectorInputFieldType),
              }),
            );
          }
        }

        fields = extend(
          fields,
          { ...nestedFields },
          `Adding nested fields for ${Self.name}`,
        );
        return fields;
      },
    },
  },
};
