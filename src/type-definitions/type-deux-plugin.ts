import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './helpers';
import {
  GrafastInputFieldConfigMap,
  ObjectStep,
  __InputListStep,
  __InputObjectStep,
} from 'grafast';
import { getNestedMutationRelationships } from './get-nested-relationships';
import { buildCreateField } from './build-create-field';
import { buildCreateInputType } from './build-create-type';
import { buildConnectByNodeIdType } from './build-connect-by-node-id-type';
import { buildConnectByNodeIdField } from './build-connect-by-node-id-field';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'pg-nested-mutation-plugin',
  description: 'PostGraphile plugin for nested types',
  version: '0.0.1',
  after: ['PgTableNodePlugin'],

  inflection: {
    add: {
      nestedConnectByNodeIdFieldName(options) {
        return this.camelCase(`connect_by_${this.nodeIdFieldName()}`);
      },
      nestedConnectByNodeIdInputType(options, { rightTable }) {
        const rightTableFieldName = this.tableFieldName(rightTable);
        return this.upperCamelCase(`${rightTableFieldName}_node_id_connect`);
      },
      nestedConnectByKeyInputType(options, relationship) {
        // to do - allow overriding of names through tags
        const { leftTable, localUnique, tableFieldName } = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({ attributeName, codec: leftTable.codec }),
        );

        const keyName = localUnique.isPrimary ? 'pk' : attributes.join('_');

        return this.upperCamelCase(`${tableFieldName}_${keyName}_connect`);
      },
      nestedConnectByKeyFieldName(options, relationship) {
        const { leftTable, localUnique } = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({ attributeName, codec: leftTable.codec }),
        );

        return this.camelCase(`connect_by_${attributes.join('_and_')}`);
      },
      nestedConnectorFieldType(options, details) {
        const {
          isReverse,
          leftTable,
          localAttributes,
          remoteAttributes,
          rightTable,
        } = details;
        // name for the Input Object
        // e.g., SessionUserIdFkeyInput for user object in SessionInput
        // e.g., SessionUserIdFkeyInverseInput for session object in UserInput

        // If leftTable contains foreign key
        // leftTableType + leftTable_attributes + Fkey + Input

        // if righTable contains foreign key
        // rightTable + rightTable_attributes + Fkey + input

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fKey',
            isReverse ? 'inverse' : null,
            'input',
          ]
            .filter(Boolean)
            .join('_'),
        );
      },
      nestedCreateInputType(options, details) {
        // Same as fieldType except no 'inverse' and then add rightTableName + 'create'

        const {
          leftTable,
          rightTable,
          localAttributes,
          remoteAttributes,
          isReverse,
        } = details;

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fkey',
            this.tableFieldName(isReverse ? leftTable : rightTable),
            'create',
            'input',
          ]
            .filter(Boolean)
            .join('_'),
        );
      },
      nestedConnectorFieldName(options, details) {
        const {
          leftTable,
          rightTable,
          localAttributes,
          remoteAttributes,
          isUnique,
          isReverse,
        } = details;

        const tableFieldName = this.tableFieldName(rightTable);

        const multipleFks = Object.keys(leftTable.getRelations()).length > 1;

        const computedReverseMutationName = this.camelCase(
          isUnique ? tableFieldName : this.pluralize(tableFieldName),
        );

        if (!isReverse) {
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
    /**
     * TODO: Scope actions to behaviors
     */
    entityBehavior: {},

    hooks: {
      build(build) {
        build.pgNestedMutationRelationships = new Map();
        build.pgNestedMutationInputObjMap = new Map();
        return build;
      },

      init(init, build, context) {
        const {
          graphql: { GraphQLNonNull, GraphQLList, GraphQLID },
          inflection,
          EXPORTABLE,
        } = build;

        const createdTypes = new Set<string>();
        for (const table of Object.values(build.input.pgRegistry.pgResources)) {
          if (!isPgTableResource(table)) {
            continue;
          }
          const relationships = getNestedMutationRelationships(table, build);
          build.pgNestedMutationRelationships.set(table.codec, relationships);

          for (const relationship of relationships) {
            const { leftTable, mutationFields, localUnique, tableFieldName } =
              relationship;

            const patchFieldName = inflection.patchField(tableFieldName);

            /**Store the relevant fieldNames on which to add the connectorType */
            build.pgNestedMutationInputObjMap
              .set(inflection.createField(leftTable), {
                field: tableFieldName,
                codec: leftTable.codec,
              })
              .set(
                inflection.updateNodeField({
                  resource: leftTable,
                  unique: localUnique,
                }),
                {
                  field: patchFieldName,
                  codec: leftTable.codec,
                },
              );

            /**
             * If Create Enabled, Generate a CreateInput Type
             */
            if (
              mutationFields.create &&
              !createdTypes.has(mutationFields.create.typeName)
            ) {
              createdTypes.add(mutationFields.create.typeName);

              // register createType
              build.recoverable(null, () => {
                buildCreateInputType(relationship, build);
              });
            }

            // if connectbyNodeId types, create them
            if (
              mutationFields.connectByNodeId &&
              !createdTypes.has(mutationFields.connectByNodeId.typeName)
            ) {
              createdTypes.add(mutationFields.connectByNodeId.typeName);

              build.recoverable(null, () => {
                buildConnectByNodeIdType(relationship, build);
              });
            }

            // if connect by key types, create them
            if (mutationFields.connectByKeys) {
              const { connectByKeys } = mutationFields;

              for (const connectByKey of connectByKeys) {
                if (!createdTypes.has(connectByKey.typeName)) {
                  createdTypes.add(connectByKey.typeName);
                }
              }
            }
            /**
             * Add the Connector Input Field
             * if there is at least one nestedField
             */
            if (
              Object.keys(mutationFields).filter((k) => k !== 'input').length &&
              !createdTypes.has(mutationFields.input.typeName)
            ) {
              const { input } = mutationFields;
              createdTypes.add(input.typeName);

              build.recoverable(null, () => {
                // register the connectType
                build.registerInputObjectType(
                  input.typeName,
                  {
                    isNestedInverseMutation: relationship.isReverse,
                    isNestedMutationConnectorType: true,
                  },
                  () => {
                    return {
                      description: build.wrapDescription(
                        `Input for the nested mutation of \`${relationship.leftTable.name}\` `,
                        'type',
                      ),
                      fields: ({ fieldWithHooks }) => ({
                        ...(mutationFields.create
                          ? {
                              [mutationFields.create.fieldName]: fieldWithHooks(
                                ...buildCreateField(relationship, build),
                              ),
                            }
                          : {}),
                        ...(mutationFields.connectByNodeId
                          ? {
                              [mutationFields.connectByNodeId.fieldName]:
                                fieldWithHooks(
                                  ...buildConnectByNodeIdField(
                                    relationship,
                                    build,
                                  ),
                                ),
                            }
                          : {}),
                      }),
                    };
                  },
                  `PgNestedConnectorField for ${relationship.rightTable.name} in the ${relationship.leftTable.name} create or patch mutation`,
                );
              });
            }
          }
        }

        return init;
      },

      GraphQLObjectType_fields_field(field, build, context) {
        const {
          scope: { isRootMutation, fieldName },
        } = context;

        const fieldKey = build.pgNestedMutationInputObjMap.get(fieldName);

        if (
          isRootMutation &&
          fieldKey &&
          build.pgNestedMutationRelationships.has(fieldKey.codec)
        ) {
          const fieldPathsToApplyArgs = (
            build.pgNestedMutationRelationships.get(fieldKey.codec) ?? []
          ).reduce(
            (memo, rel) => {
              const connectorPath = rel.mutationFields.input.fieldName;
              const actions = Object.entries(rel.mutationFields).reduce(
                (acc, [key, { fieldName }]) => {
                  if (['input', 'connectByKeys'].includes(key) || !fieldName) {
                    return acc;
                  }
                  const tuple = [connectorPath, fieldName] as [string, string];
                  return [...acc, tuple];
                },
                [] as Array<[string, string]>,
              );
              return [...memo, ...actions];
            },
            [] as Array<[string, string]>,
          );

          return {
            ...field,
            plan(parent, args, info) {
              const previousPlan = field.plan!(parent, args, info);
              const inputPlan = previousPlan.get('result') as ObjectStep;
              for (const [connectorField, action] of fieldPathsToApplyArgs) {
                // don't apply the path if the key is not present in the input
                // object
                const inputObj = args.getRaw(['input', fieldKey.field]).eval();

                if (inputObj[connectorField]) {
                  args.apply(inputPlan, [
                    'input',
                    fieldKey.field,
                    connectorField,
                    action,
                  ]);
                }
              }
              return previousPlan;
            },
          };
        }
        return field;
      },

      GraphQLInputObjectType_fields(fields, build, context) {
        const {
          fieldWithHooks,
          scope: { isPgRowType, pgCodec, isNestedMutationCreateInputType },
          Self,
        } = context;

        if (
          isPgRowType &&
          pgCodec &&
          build.pgNestedMutationRelationships.has(pgCodec)
        ) {
          const data = build.pgNestedMutationRelationships.get(pgCodec) ?? [];

          const addedFields = data.reduce(
            (memo, relationship) => {
              const {
                mutationFields: { input },
                rightTable,
              } = relationship;

              const nestedType = build.getInputTypeByName(input.typeName);
              if (nestedType) {
                return {
                  ...memo,
                  [input.fieldName]: fieldWithHooks(
                    {
                      fieldName: input.fieldName,
                      isNestedMutationInputField: true,
                    },
                    {
                      description: build.wrapDescription(
                        `Input for the nested mutation of \`${rightTable.name}\ in the \`${Self.name}\` mutation`,
                        'field',
                      ),
                      type: nestedType,
                    },
                  ),
                };
              }
              return memo;
            },
            {} as GrafastInputFieldConfigMap<any, any>,
          );

          return build.extend(fields, addedFields, 'test');
        }

        return fields;
      },
    },
  },
};
