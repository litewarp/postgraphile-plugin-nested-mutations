import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './helpers';
import {
  FieldArgs,
  GrafastInputFieldConfig,
  GrafastInputFieldConfigMap,
  __InputListStep,
  __InputObjectStep,
  each,
} from 'grafast';
import { GraphQLInputObjectType } from 'graphql';
import {
  PgCodecWithAttributes,
  PgInsertSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'pg-nested-mutation-types-plugin',
  description: 'PostGraphile plugin for nested types',
  version: '0.0.1',
  after: [],

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
        build.pgNestedPluginFieldMap = new Map();
        return build;
      },

      init(init, build, context) {
        const {
          inflection,
          getGraphQLTypeByPgCodec,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          pgNestedTableConnectorFields,
          pgNestedTableDeleterFields,
          pgNestedTableUpdaterFields,
          pgTableResource,
          EXPORTABLE,
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
                  isNestedMutationInputType: true,
                  isNestedMutationConnectorType: true,
                  isNestedInverseMutation: relationship.isReferencee,
                  pgCodec: table.codec,
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

                    pgNestedTableConnectorFields[foreignTable.name]?.forEach(
                      ({
                        typeName,
                        fieldName: connectorFieldName,
                        relationship,
                        isNodeIdConnector,
                      }) => {
                        operations[connectorFieldName] = fieldWithHooks(
                          {
                            fieldName: connectorFieldName,
                            isNestedMutationInputType: true,
                            ...(isNodeIdConnector
                              ? { isNestedMutationConnectByNodeIdType: true }
                              : { isNestedMutationConnectByKeyType: true }),
                          },
                          () => ({
                            description: `The primary key(s) for \`${foreignTableName}\` for the far side of the relationship.`,
                            type: relationship.isUnique
                              ? build.getInputTypeByName(typeName)
                              : new GraphQLList(
                                  new GraphQLNonNull(
                                    build.getInputTypeByName(typeName),
                                  ),
                                ),
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
                              return { ...memo, [inflection.camelCase(k)]: v };
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

                    const detailInput = {
                      resource: table,
                      unique: table.uniques[0]!,
                    };

                    // add create type

                    if (detailInput.unique) {
                      // add fields to map
                      const allFieldNames = [
                        inflection.updateByKeysField(detailInput),
                        inflection.updateNodeField(detailInput),
                        inflection.createField(table),
                        inflection.deleteByKeysField(detailInput),
                        inflection.deleteNodeField(detailInput),
                      ];

                      for (const fieldName of allFieldNames) {
                        build.pgNestedPluginFieldMap.set(fieldName, {
                          fieldNames: Object.keys(operations),
                          tableName: table.name,
                        });
                      }
                    }

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

      GraphQLObjectType_fields_field(field, build, context) {
        const {
          scope: { fieldName, isRootMutation },
          Self,
        } = context;

        const {
          inflection,
          getTypeByName,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          EXPORTABLE,
        } = build;

        if (isRootMutation) {
          const deets = build.pgNestedPluginFieldMap.get(fieldName);
          if (!deets) {
            return field;
          }

          const { tableName, fieldNames } = deets;

          const forward = pgNestedPluginForwardInputTypes[tableName] ?? [];
          const reverse = pgNestedPluginReverseInputTypes[tableName] ?? [];

          const combined = [...forward, ...reverse].map((x) => x.name);

          /**
           * Step One - Pass the arguments from the root object down
           */

          return {
            ...field,
            plan($parentPlan, args, info) {
              console.log('STEP ONE', fieldName);
              if (!field.plan) {
                throw new Error('No plan');
              }
              const $oldPlan = field.plan($parentPlan, args, info);
              const $inputPlan = $oldPlan.get('result');
              combined.forEach((lename) => {
                if (!lename) {
                  return;
                }
                args.apply($inputPlan, ['input', tableName, lename]);
              });
              return $oldPlan;
            },
          };
        }

        return field;
      },

      GraphQLInputObjectType_fields_field(inField, build, context) {
        const {
          scope: {
            fieldName,
            fieldBehaviorScope,
            pgCodec,
            isPgRowType,
            isMutationInput,
            isNestedMutationConnectorType,
          },
          Self,
          type,
        } = context;

        const {
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          EXPORTABLE,
        } = build;

        if (fieldName === 'create') {
          const found = [
            ...Object.values(pgNestedPluginForwardInputTypes),
            ...Object.values(pgNestedPluginReverseInputTypes),
          ].find((types) => {
            if (types.find((x) => x.connectorInputFieldType === Self.name)) {
              return true;
            }
          });

          if (found && found[0]) {
            const foreignTable = found[0].relationship.remoteResource;

            return {
              ...inField,
              applyPlan: EXPORTABLE(
                () =>
                  function ($parent, fieldArgs) {
                    console.log('STEP FOUR', Self.name, 'create');

                    const $list = fieldArgs.getRaw();

                    const $alllist = each($list, ($item) => {
                      return $item.get('result');
                    });
                    console.log($alllist);
                    return $parent;
                  },
                [],
              ),
            };
          }
        }

        // proxy for table input
        if (isMutationInput && fieldBehaviorScope === 'insert:input:record') {
          return {
            ...inField,
            applyPlan: EXPORTABLE(
              () =>
                function ($parent, fieldArgs) {
                  console.log('STEP TWO', fieldName);
                  return $parent;
                },
              [],
            ),
          };
        }

        if (isPgRowType) {
          const table = build.pgTableResource(pgCodec as PgCodecWithAttributes);

          if (!table) {
            throw new Error(`Could not find table for ${pgCodec?.name}`);
          }

          const forward = pgNestedPluginForwardInputTypes[table.name] ?? [];
          const reverse = pgNestedPluginReverseInputTypes[table.name] ?? [];

          const combined = [...forward, ...reverse];

          if (combined.find((c) => c.name === fieldName)) {
            return {
              ...inField,
              applyPlan: EXPORTABLE(
                (fieldName) =>
                  function ($parent, fieldArgs) {
                    console.log('STEP THREE', fieldName);
                    return $parent;
                  },
                [fieldName],
              ),
            };
          }
        }

        return inField;
      },

      GraphQLInputObjectType_fields(inFields, build, context) {
        const {
          inflection,
          extend,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          EXPORTABLE,
        } = build;

        const {
          scope: {
            isPgRowType,
            pgCodec,
            isPgPatch,
            isMutationInput,
            pgResource,
          },
          Self,
          fieldWithHooks,
        } = context;

        let fields = inFields;

        if (isPgRowType && pgCodec) {
          const table = build.pgTableResource(pgCodec as PgCodecWithAttributes);

          if (!table) {
            throw new Error(`Could not find table for ${pgCodec.name}`);
          }

          const nestedFields: GrafastInputFieldConfigMap<any, any> = {};

          const forwardTypes =
            pgNestedPluginForwardInputTypes[table.name] ?? [];

          const reverseTypes =
            pgNestedPluginReverseInputTypes[table.name] ?? [];

          for (const {
            table,
            relationship: { localAttributes },
            name,
            connectorInputFieldType,
            relationName,
          } of forwardTypes) {
            if (!connectorInputFieldType) {
              throw new Error(
                `connectorInputFieldType missing for ${relationName}`,
              );
            }
            if (!name) {
              throw new Error(
                `fieldName missing for ${connectorInputFieldType}`,
              );
            }
            // override nulls on keys that have forward mutations available

            // localAttributes.forEach((attr) => {
            //   const field = fields[inflection.camelCase(attr)];
            //   if (!field) {
            //     throw new Error(
            //       `Could not find field ${attr} on input object ${Self.name}`,
            //     );
            //   }

            //   const codec = table.codec.attributes[attr];
            //   if (!codec) {
            //     throw new Error(
            //       `Could not find codec for ${attr} on table ${table.name}`,
            //     );
            //   }

            //   const type = build.getGraphQLTypeByPgCodec(
            //     codec.codec,
            //     'input',
            //   ) as GraphQLScalarType;
            //   if (!type) {
            //     throw new Error(`Could not find type for codec ${codec}`);
            //   }
            //   nestedFields[inflection.camelCase(attr)] = {
            //     ...field,
            //     type,
            //   };
            // });

            nestedFields[name] = fieldWithHooks(
              {
                fieldName: name,
                isNestedMutationInputField: true,
              },
              () => ({
                type: build.getInputTypeByName(connectorInputFieldType),
                // autoApplyAfterParentApplyPlan: true,
                // applyPlan: EXPORTABLE(
                //   (name) =>
                //     function ($parent, fieldArgs: FieldArgs) {
                //       console.log($parent);
                //       $parent.set(name, fieldArgs.get());
                //     },
                //   [name],
                // ),
              }),
            );
          }

          for (const {
            name,
            connectorInputFieldType,
            relationship,
            relationName,
            table,
          } of reverseTypes) {
            if (!connectorInputFieldType) {
              throw new Error(
                `connectorInputFieldType missing for ${relationName}`,
              );
            }
            if (!name) {
              throw new Error(
                `fieldName missing for ${connectorInputFieldType}`,
              );
            }
            const inputType = build.getInputTypeByName(
              connectorInputFieldType,
            ) as GraphQLInputObjectType;

            nestedFields[name] = fieldWithHooks(
              {
                fieldName: name,
                isNestedMutationInputField: true,
                isNestedInverseMutation: true,
              },
              () => ({
                type: inputType,
                applyPlan: EXPORTABLE(
                  (name) =>
                    function ($parent, fieldArgs: FieldArgs) {
                      console.log('DOWN SOUTH', name);
                      return $parent;
                    },
                  [name],
                ),
              }),
            );
          }
          fields = extend(
            fields,
            { ...nestedFields },
            `Adding nested fields for ${Self.name}`,
          );
        }
        return fields;
      },
    },
  },
};
