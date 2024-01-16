import type { PgCodecWithAttributes, PgResource } from '@dataplan/pg';
import type { GraphQLInputFieldConfigMap, GraphQLInputType } from 'graphql';
import { gatherRelationshipData } from '../gather-relationship-data';
import type { PgTableResource } from '../interfaces';

interface State {}

const EMPTY_OBJECT = Object.freeze({});

function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

export const PgNestedMutationsSchemaPlugin: GraphileConfig.Plugin = {
  name: '',
  version: '',
  inflection: {
    add: {
      nestedConnectByKeyAttributesFieldName(options, details) {
        const {
          relationship: { localAttributes },
        } = details;
        return this.camelCase(`connect_by_${localAttributes.join('_and_')}`);
      },
      nestedConnectByKeyAttributesInputType(options, details) {
        const {
          relationship: { isUnique, localAttributes, remoteResource },
        } = details;

        const foreignTableName = this.tableFieldName(remoteResource);

        return this.upperCamelCase(
          `${foreignTableName}_${localAttributes.join('_and_')}_${
            isUnique ? 'pkey' : 'fkey'
          }_connect`,
        );
      },
      nestedConnectByNodeIdFieldName(options, details) {
        return this.camelCase(`connect_by_node_id`);
      },
      nestedConnectByNodeIdInputType(options, details) {
        const foreignTableName = this.tableFieldName(
          details.relationship.remoteResource,
        );
        return this.upperCamelCase(`${foreignTableName}_node_id_connect`);
        return '';
      },
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
    },
  },
  schema: {
    hooks: {
      build(build) {
        build.pgNestedRelationships = new Map();
        build.pgNestedMutationTypes = new Set();
        build.pgNestedMutationConnectorTypes = [];
        return build;
      },

      init(init, build, context) {
        const { pgResources } = build.input.pgRegistry;

        const {
          graphql: {
            GraphQLInputObjectType,
            GraphQLNonNull,
            GraphQLID,
            GraphQLBoolean,
          },
          inflection,
          pgNestedMutationTypes,
        } = build;

        const tables = Object.values(pgResources);

        for (const table of tables) {
          if (!isPgTableResource(table)) {
            continue;
          }

          const details = gatherRelationshipData(table, build);

          for (const detail of details) {
            const typeName = inflection.nestedConnectorFieldType(detail);
            build.recoverable(null, () => {
              if (!pgNestedMutationTypes.has(typeName)) {
                pgNestedMutationTypes.add(typeName);

                // add types starting from leaf out
                // nestedConnectTypes
                const nestedConnectByNodeIdInputType =
                  inflection.nestedConnectByNodeIdInputType(detail);

                if (
                  !pgNestedMutationTypes.has(nestedConnectByNodeIdInputType)
                ) {
                  pgNestedMutationTypes.add(nestedConnectByNodeIdInputType);
                  build.registerInputObjectType(
                    nestedConnectByNodeIdInputType,
                    {}, // scope
                    () => ({
                      description: '',
                      fields: ({ fieldWithHooks }) => {
                        return {
                          nodeId: fieldWithHooks(
                            {
                              fieldName: 'nodeId',
                            },
                            () => ({
                              type: new GraphQLNonNull(GraphQLID),
                            }),
                          ),
                        };
                      },
                    }),
                    'some-helpful-string',
                  );
                }
                const nestedConnectByKeyAttributesInputType =
                  inflection.nestedConnectByKeyAttributesInputType(detail);

                if (
                  !pgNestedMutationTypes.has(
                    nestedConnectByKeyAttributesInputType,
                  )
                ) {
                  pgNestedMutationTypes.add(
                    nestedConnectByKeyAttributesInputType,
                  );

                  build.registerInputObjectType(
                    nestedConnectByKeyAttributesInputType,
                    {}, // scope
                    () => ({
                      description: '',
                      fields: ({ fieldWithHooks }) => {
                        const keys = detail.relationship.remoteAttributes;
                        const codecs =
                          detail.relationship.remoteResource.codec.attributes;

                        const fields = keys.reduce((acc, key) => {
                          const codec = codecs[key];
                          if (!codec) return acc;

                          return {
                            ...acc,
                            [key]: fieldWithHooks(
                              {
                                fieldName: key,
                              },
                              () => ({
                                type: build.getGraphQLTypeByPgCodec(
                                  codec.codec,
                                  'input',
                                ),
                              }),
                            ),
                          };
                        }, {});

                        return fields;
                      },
                    }),
                    'some-helpful-string',
                  );
                }

                const nestedCreateInputType =
                  inflection.nestedCreateInputType(detail);

                // if (!pgNestedMutationTypes.has(nestedCreateInputType)) {
                //   pgNestedMutationTypes.add(nestedCreateInputType);

                //   build.registerInputObjectType(
                //     nestedCreateInputType,
                //     {},
                //     () => ({
                //       description: '',
                //       fields: ({ fieldWithHooks }) => {
                //         const tableName = inflection.tableFieldName(
                //           detail.relationship.remoteResource,
                //         );
                //         const tableType = build.getGraphQLTypeByPgCodec(
                //           detail.relationship.remoteResource.codec,
                //           'output',
                //         );

                //         return {};
                //       },
                //     }),
                //     'input-type-for-nested-create',
                //   );
                // }

                const nestedConnectByKeyFieldName =
                  inflection.nestedConnectByKeyAttributesFieldName(detail);
                const nestedConnectByNodeIdFieldName =
                  inflection.nestedConnectByNodeIdFieldName(detail);

                // nestedUpdateTypes

                // nestedDisconnectTypes

                // nestedCreateTypes

                // finally, nested connector type

                build.registerInputObjectType(
                  typeName,
                  {}, // scope
                  () => ({
                    description: '',
                    fields: ({ fieldWithHooks }) => {
                      build.getTypeByName(
                        nestedConnectByKeyAttributesInputType,
                      );
                      return {
                        deleteOthers: fieldWithHooks(
                          {
                            fieldName: 'deleteOthers',
                          },
                          () => ({
                            type: GraphQLBoolean,
                          }),
                        ),
                        // connectByNodeId
                        [nestedConnectByNodeIdFieldName]: fieldWithHooks(
                          {
                            fieldName: nestedConnectByNodeIdFieldName,
                          },
                          () => ({
                            type: build.getTypeByName(
                              nestedConnectByNodeIdInputType,
                            ),
                          }),
                        ),
                        [nestedConnectByKeyFieldName]: fieldWithHooks(
                          { fieldName: nestedConnectByKeyFieldName },
                          () => ({
                            type: build.getTypeByName(
                              nestedConnectByKeyAttributesInputType,
                            ),
                          }),
                        ),
                      };
                    },
                  }),
                  'some-helpful-string',
                );
                build.pgNestedMutationConnectorTypes.push({
                  leftTable: table,
                  rightTable: detail.relationship.remoteResource,
                  typeName,
                  isUnique: detail.relationship.isUnique,
                });
              }
            });
          }
        }

        return init;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {
          extend,
          inflection,
          graphql: { GraphQLList },
        } = build;
        const {
          fieldWithHooks,
          scope: { isPgRowType, pgCodec },
          Self,
        } = context;
        if (isPgRowType) {
          const table = build.pgTableResource(pgCodec as PgCodecWithAttributes);

          const connections = build.pgNestedMutationConnectorTypes.filter(
            ({ leftTable }) => leftTable === table,
          );

          const fieldsToAdd = connections.reduce<GraphQLInputFieldConfigMap>(
            (acc, { leftTable, rightTable, typeName, isUnique }) => {
              const fieldName = inflection.tableFieldName(rightTable);
              const key = isUnique
                ? fieldName
                : inflection.pluralize(fieldName);
              const baseType = build.getTypeByName(typeName) as
                | GraphQLInputType
                | undefined;
              if (!baseType) {
                throw new Error(`Could not find type ${typeName}`);
              }
              const type = isUnique
                ? baseType
                : (new GraphQLList(baseType) as GraphQLInputType);

              return {
                ...acc,
                [key]: {
                  type,
                },
              };
            },
            {},
          );

          fields = extend(
            fields,
            {
              ...fieldsToAdd,
            },
            'add nested connector fields',
          );
        }
        return fields;
      },
      // GraphQLInputObjectType_fields_field(field, build, context) {
      //   const { extend, inflection, graphql } = build;
      //   const {
      //     scope: { isPgBaseInput, isPgRowType },
      //     Self,
      //   } = context;

      //   console.log(context.scope, field);

      //   return field;
      // },
    },
  },
};
