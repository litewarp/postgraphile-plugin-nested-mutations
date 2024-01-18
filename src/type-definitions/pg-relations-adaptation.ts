import {
  pgInsertSingle,
  type PgCodecWithAttributes,
  type PgResource,
} from '@dataplan/pg';
import type { GraphQLInputObjectType, GraphQLInputType } from 'graphql';
import { gatherRelationshipData } from '../gather-relationship-data';
import type { PgTableResource } from '../interfaces';

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
      nestedConnectorFieldName(options, details) {
        const foreignTable = details.relationship.remoteResource;
        const tableFieldName = this.tableFieldName(foreignTable);
        const { localAttributes, isUnique, isReferencee } =
          details.relationship;

        const multipleFks = localAttributes.length > 1;

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
          `${computedReverseMutationName}_to_${localAttributes.join('_and_')}`,
        );
      },
    },
  },
  schema: {
    entityBehavior: {},
    hooks: {
      build(build) {
        build.pgNestedRelationships = [];
        build.pgNestedMutationTypes = new Set();
        build.pgNestedMutationConnectorTypes = [];
        return build;
      },

      init(init, build, context) {
        const { pgResources } = build.input.pgRegistry;

        const {
          graphql: { GraphQLNonNull, GraphQLID, GraphQLBoolean, GraphQLList },
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
            const { relationship } = detail;
            const foreignTable = relationship.remoteResource;
            const foreignTableName = inflection.tableFieldName(foreignTable);

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
                    {
                      isNestedMutationInputType: true,
                      isNestedMutationConnectInputType: true,
                      isNestedMutationConnectByNodeIdType: true,
                    }, // scope
                    () => ({
                      description:
                        'The globally unique `ID` look up for the row to connect.',
                      fields: ({ fieldWithHooks }) => {
                        return {
                          nodeId: fieldWithHooks(
                            {
                              fieldName: 'nodeId',
                            },
                            () => ({
                              description: `The globally unique \`ID\` which identifies a single \`${foreignTableName}\` to be connected.`,
                              type: new GraphQLNonNull(GraphQLID),
                            }),
                          ),
                        };
                      },
                    }),
                    `${foreignTableName}NodeIdConnectInput`,
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
                    {
                      isNestedMutationInputType: true,
                      isNestedMutationConnectInputType: true,
                    }, // scope
                    () => ({
                      description: `The fields on \`${foreignTableName}\` to look up the row to connect.`,
                      fields: ({ fieldWithHooks }) => {
                        const keys = relationship.remoteAttributes;
                        const codecs = foreignTable.codec.attributes;

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

                if (!pgNestedMutationTypes.has(nestedCreateInputType)) {
                  pgNestedMutationTypes.add(nestedCreateInputType);

                  build.registerInputObjectType(
                    nestedCreateInputType,
                    {
                      isNestedMutationInputType: true,
                      isNestedMutationConnectInputType: true,
                      isNestedInverseMutation: relationship.isReferencee,
                    },
                    () => ({
                      description: `The \`${foreignTableName}\` to be created by this mutation.`,
                      fields: ({ fieldWithHooks }) => {
                        const foreignTableInputType =
                          build.getGraphQLTypeByPgCodec(
                            foreignTable.codec,
                            'input',
                          ) as GraphQLInputObjectType | undefined;
                        const inputFields =
                          foreignTableInputType?.getFields() ?? {};
                        return Object.entries(inputFields).reduce(
                          (acc, [k, v]) => {
                            if (relationship.localAttributes.includes(k)) {
                              return acc;
                            }
                            return {
                              ...acc,
                              [k]: fieldWithHooks(
                                {
                                  fieldName: k,
                                },
                                () => ({
                                  type: v.type,
                                }),
                              ),
                            };
                          },
                          {},
                        );
                      },
                    }),
                    'input-type-for-nested-create',
                  );
                }

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
                    description: `Input for the nested mutation of \`${foreignTableName}\` in the \`${inflection.tableType(
                      table.codec,
                    )}\` mutation.`,
                    fields: ({ fieldWithHooks }) => {
                      return {
                        deleteOthers: fieldWithHooks(
                          {
                            fieldName: 'deleteOthers',
                          },
                          () => ({
                            description: `Flag indicating whether all other \`${foreignTableName}\` records that match this relationship should be removed.`,
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
                          () => {
                            const getType = () => {
                              const field = build.getTypeByName(
                                nestedConnectByKeyAttributesInputType,
                              );
                              if (!relationship.isReferencee) {
                                return field;
                              }
                              if (relationship.isUnique) {
                                return field;
                              }
                              return new GraphQLList(
                                field as GraphQLInputObjectType,
                              );
                            };
                            return {
                              description: `The primary key(s) for \`${foreignTableName}\` for the far side of the relationship.`,
                              type: getType(),
                            };
                          },
                        ),
                        create: fieldWithHooks({ fieldName: 'create' }, () => {
                          const type = build.getTypeByName(
                            nestedCreateInputType,
                          );
                          return {
                            description: `A \`${build.getGraphQLTypeNameByPgCodec(
                              foreignTable.codec,
                              'output',
                            )}\` object that will be created and connected to this object.`,
                            type: !relationship.isReferencee
                              ? type
                              : new GraphQLList(type as GraphQLInputType),
                          };
                        }),
                      };
                    },
                  }),
                  'some-helpful-string',
                );

                build.pgNestedRelationships.push({
                  ...detail,
                  typeName,
                });
              }
            });
          }
        }

        return init;
      },
      GraphQLInputObjectType_fields(inFields, build, context) {
        let fields = inFields;
        const {
          extend,
          inflection,
          graphql: { GraphQLList },
          getGraphQLTypeByPgCodec,
        } = build;
        const {
          fieldWithHooks,
          scope: { isPgRowType, pgCodec },
          Self,
        } = context;

        if (isPgRowType) {
          const table = build.pgTableResource(pgCodec as PgCodecWithAttributes);
          const newFields = {};

          const connections = build.pgNestedRelationships.filter(
            (obj) => obj.table === table,
          );

          fields = extend(
            fields,
            connections.reduce((memo, con) => {
              const fieldName = inflection.nestedConnectorFieldName(con);
              const typeName = inflection.nestedConnectorFieldType(con);
              const type = build.getTypeByName(typeName);
              return {
                ...memo,
                [fieldName]: fieldWithHooks({ fieldName }, () => ({
                  type,
                })),
              };
            }, {}),
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
