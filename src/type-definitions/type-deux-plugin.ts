import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './helpers';
import {
  ExecutableStep,
  GrafastInputFieldConfigMap,
  ObjectStep,
  __InputListStep,
  __InputObjectStep,
} from 'grafast';

import { getNestedMutationRelationships } from './get-nested-relationships';
import {
  PgInsertSingleStep,
  PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'pg-nested-mutation-plugin',
  description: 'PostGraphile plugin for nested types',
  version: '0.0.1',
  after: [],

  inflection: {
    add: {
      nestedConnectByNodeIdFieldName(options) {
        return this.camelCase(`connect_by_${this.nodeIdFieldName()}`);
      },
      nestedConnectByNodeIdInputType(options, { tableFieldName }) {
        return this.upperCamelCase(`${tableFieldName}_node_id_connect`);
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
            const {
              leftTable,
              mutationFields,
              localUnique,
              isReverse,
              localAttributes,
              remoteAttributes,
              rightTable,
              tableFieldName,
            } = relationship;

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
              const { create } = mutationFields;
              createdTypes.add(create.typeName);
              // register createType

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  create.typeName,
                  {
                    isNestedInverseMutation: relationship.isReverse,
                    isNestedMutationInputType: true,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The \`${relationship.rightTable.name}\` to be created by this mutation.`,
                      'type',
                    ),
                    fields: ({ fieldWithHooks }) => {
                      return Object.entries(
                        relationship.rightTable.codec.attributes,
                      ).reduce((memo, [attributeName, attribute]) => {
                        const attributeType = build.getGraphQLTypeByPgCodec(
                          attribute.codec,
                          'input',
                        );
                        if (!attributeType) {
                          return memo;
                        }

                        const fieldName = inflection.attribute({
                          attributeName,
                          codec: relationship.rightTable.codec,
                        });

                        return {
                          ...memo,
                          [fieldName]: fieldWithHooks(
                            { fieldName, pgAttribute: attribute },
                            () => ({
                              description: attribute.description,
                              type: build.nullableIf(
                                (!attribute.notNull &&
                                  !attribute.extensions?.tags?.notNull) ||
                                  attribute.hasDefault ||
                                  Boolean(
                                    attribute.extensions?.tags?.hasDefault,
                                  ),
                                attributeType,
                              ),
                              applyPlan: EXPORTABLE(
                                (attributeName) =>
                                  function plan($parent, args) {
                                    $parent.set(attributeName, args.get());
                                  },
                                [attributeName],
                              ),
                            }),
                          ),
                        };
                      }, {});
                    },
                  }),
                  ``,
                );
              });
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
                      fields: ({ fieldWithHooks }) => {
                        const createInputType = mutationFields.create
                          ? build.getInputTypeByName(
                              mutationFields.create.typeName,
                            )
                          : null;

                        if (!createInputType) {
                          throw new Error(
                            `Could not find type ${input.typeName}`,
                          );
                        }

                        return {
                          ...(mutationFields.create
                            ? {
                                create: fieldWithHooks(
                                  {
                                    fieldName: mutationFields.create.fieldName,
                                    isNestedMutationInputType: true,
                                    isNestedMutationCreateInputType: true,
                                    pgCodec: leftTable.codec,
                                  },
                                  {
                                    description: build.wrapDescription(
                                      `A \`${relationship.rightTable.name}\` object that will be created and connected to this object.`,
                                      'type',
                                    ),
                                    type:
                                      !relationship.isReverse ||
                                      relationship.isUnique
                                        ? createInputType
                                        : new GraphQLList(
                                            new GraphQLNonNull(createInputType),
                                          ),
                                    applyPlan: EXPORTABLE(
                                      (
                                        isReverse,
                                        localAttributes,
                                        remoteAttributes,
                                        rightTable,
                                      ) =>
                                        function plan($parent, args) {
                                          $parent.hasSideEffects = true;
                                          const isInsertOrUpdate =
                                            $parent instanceof
                                              PgInsertSingleStep ||
                                            $parent instanceof
                                              PgUpdateSingleStep;

                                          if (isInsertOrUpdate) {
                                            if (isReverse) {
                                              // if the relation table contains the foreign keys
                                              // i.e., isReverse = true
                                              // get the referenced key on the root table
                                              // add it to the payload for the nested create
                                              const foreignKeys =
                                                localAttributes.reduce(
                                                  (memo, attr, index) => {
                                                    const remoteAttr =
                                                      remoteAttributes[index];
                                                    if (!remoteAttr)
                                                      return memo;
                                                    return {
                                                      ...memo,
                                                      [remoteAttr]:
                                                        $parent.get(attr),
                                                    };
                                                  },
                                                  {} as Record<
                                                    string,
                                                    ExecutableStep
                                                  >,
                                                );
                                              //

                                              const otherAttrs = Object.keys(
                                                rightTable.codec.attributes,
                                              ).filter(
                                                (a) =>
                                                  !foreignKeys[a] && a !== 'id',
                                              );

                                              const $list =
                                                args.getRaw() as __InputListStep;

                                              for (const idx of Array.from(
                                                Array(
                                                  $list.evalLength() ?? 0,
                                                ).keys(),
                                              )) {
                                                const $dep = $list.getDep(
                                                  idx,
                                                ) as __InputObjectStep;
                                                pgInsertSingle(rightTable, {
                                                  ...foreignKeys,
                                                  ...otherAttrs.reduce(
                                                    (memo, field) => ({
                                                      ...memo,
                                                      [field]: $dep.get(
                                                        inflection.camelCase(
                                                          field,
                                                        ),
                                                      ),
                                                    }),
                                                    {},
                                                  ),
                                                });
                                              }
                                            } else {
                                              console.log(
                                                'WOOO NOT INVERSE YOU WEIRDOS',
                                              );
                                              // if the root table contains the foreign keys
                                              // the relation is unique so you can only input one
                                              // create the new object and then update the root

                                              const $inputObj =
                                                args.getRaw() as __InputObjectStep;

                                              const inputs = Object.entries(
                                                $inputObj.eval() ?? {},
                                              ).reduce(
                                                (m, [k, v]) =>
                                                  Boolean(v) ? [...m, k] : m,
                                                [] as string[],
                                              );

                                              const $inserted = pgInsertSingle(
                                                rightTable,
                                                {
                                                  ...inputs.reduce(
                                                    (m, f) => ({
                                                      ...m,
                                                      [f]: args.get(f),
                                                    }),
                                                    {},
                                                  ),
                                                },
                                              );

                                              for (
                                                let j = 0;
                                                j < localAttributes.length;
                                                j++
                                              ) {
                                                const localAttr =
                                                  localAttributes[j];
                                                const remoteAttr =
                                                  remoteAttributes[j];

                                                if (localAttr && remoteAttr) {
                                                  $parent.set(
                                                    localAttr,
                                                    $inserted.get(
                                                      inflection.camelCase(
                                                        remoteAttr,
                                                      ),
                                                    ),
                                                  );
                                                }
                                              }
                                            }
                                          }
                                        },
                                      [
                                        isReverse,
                                        localAttributes,
                                        remoteAttributes,
                                        rightTable,
                                      ],
                                    ),
                                  },
                                ),
                              }
                            : {}),
                        };
                      },
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
          const nestedFieldPaths = (
            build.pgNestedMutationRelationships.get(fieldKey.codec) ?? []
          ).reduce(
            (memo, rel) => {
              const connectorPath = rel.mutationFields.input.fieldName;
              return [
                ...memo,
                ...Object.keys(rel.mutationFields)
                  .filter(
                    (k) =>
                      // remove filter as you add types
                      !['input', 'connectByKeys', 'connectByNodeId'].includes(
                        k,
                      ),
                  )
                  .map((action) => [connectorPath, action] as [string, string]),
              ];
            },
            [] as Array<[string, string]>,
          );

          return {
            ...field,
            plan(parent, args, info) {
              const previousPlan = field.plan!(parent, args, info);
              const inputPlan = previousPlan.get('result') as ObjectStep;
              for (const [connectorField, action] of nestedFieldPaths) {
                // don't apply the path if the key is not present in the input
                // object
                const rawObj = args.getRaw(['input', fieldKey.field]).eval();

                if (rawObj[connectorField]) {
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
                        `The input field for the relationship to ${rightTable.name}`,
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
