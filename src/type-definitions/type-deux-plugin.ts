import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './helpers';
import {
  ExecutableStep,
  FieldArgs,
  GrafastInputFieldConfigMap,
  ObjectStep,
  __InputListStep,
  __InputObjectStep,
  each,
} from 'grafast';

import { getNestedMutationRelationships } from './get-nested-relationships';
import {
  PgInsertSingleStep,
  PgUpdateSingleStep,
  pgInsertSingle,
  pgUpdateSingle,
} from '@dataplan/pg';

export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'post_graphile_nested_types_plugin',
  description: 'PostGraphile plugin for nested types',
  version: '0.0.1',
  after: ['PostGraphileNestedConnectorsPlugin'],

  inflection: {
    add: {
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
        for (const leftTable of Object.values(
          build.input.pgRegistry.pgResources,
        )) {
          if (!isPgTableResource(leftTable)) {
            continue;
          }
          const relationships = getNestedMutationRelationships(
            leftTable,
            build,
          );
          build.pgNestedMutationRelationships.set(
            leftTable.codec,
            relationships,
          );

          for (const relationship of relationships) {
            const createInputTypeName =
              inflection.nestedCreateInputType(relationship);

            const tableFieldName = inflection.tableFieldName(leftTable);
            const patchFieldName = inflection.patchField(tableFieldName);

            const createFieldName = inflection.createField(leftTable);
            const updateFieldName = inflection.updateNodeField({
              resource: leftTable,
              unique: leftTable.uniques.find((u) =>
                u.attributes.every((a) =>
                  relationship.localAttributes.includes(a),
                ),
              )!,
            });

            build.pgNestedMutationInputObjMap
              .set(createFieldName, {
                field: tableFieldName,
                codec: leftTable.codec,
              })
              .set(updateFieldName, {
                field: patchFieldName,
                codec: leftTable.codec,
              });

            if (!createdTypes.has(createInputTypeName)) {
              createdTypes.add(createInputTypeName);
              // register createType
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  createInputTypeName,
                  {
                    isNestedInverseMutation: relationship.isReverse,
                    isNestedMutationInputType: true,
                  },
                  () => {
                    return {
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
                    };
                  },
                  ``,
                );
              });
            }

            if (!createdTypes.has(relationship.connectorTypeName)) {
              createdTypes.add(relationship.connectorTypeName);
              build.recoverable(null, () => {
                // dedupe

                // register the connectType
                build.registerInputObjectType(
                  relationship.connectorTypeName,
                  {
                    isNestedInverseMutation: relationship.isReverse,
                    isNestedMutationConnectorType: true,
                  },
                  () => {
                    return {
                      description: build.wrapDescription(
                        `Input for the nested mutation of \`${relationship.rightTable.name}\` in the \`${relationship.leftTable.name}\` create or patch mutation.`,
                        'type',
                      ),
                      fields: ({ fieldWithHooks }) => {
                        const createInputType =
                          build.getInputTypeByName(createInputTypeName);

                        if (!createInputType) {
                          throw new Error(
                            `Could not find type ${createInputTypeName}`,
                          );
                        }

                        const fieldName = 'create';

                        const {
                          isReverse,
                          localAttributes,
                          remoteAttributes,
                          rightTable,
                        } = relationship;

                        return {
                          create: fieldWithHooks(
                            {
                              fieldName,
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
                                !relationship.isReverse || relationship.isUnique
                                  ? createInputType
                                  : new GraphQLList(
                                      new GraphQLNonNull(createInputType),
                                    ),
                              applyPlan: EXPORTABLE(
                                (
                                  isReverse,
                                  localAttributes,
                                  remoteAttributes,
                                  leftTable,
                                  rightTable,
                                ) =>
                                  function plan($parent, args) {
                                    $parent.hasSideEffects = true;
                                    const isInsertOrUpdate =
                                      $parent instanceof PgInsertSingleStep ||
                                      $parent instanceof PgUpdateSingleStep;

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
                                              if (!remoteAttr) return memo;
                                              return {
                                                ...memo,
                                                [remoteAttr]: $parent.get(attr),
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
                                          (a) => !foreignKeys[a] && a !== 'id',
                                        );

                                        const $list =
                                          args.getRaw() as __InputListStep;

                                        for (const idx of Array.from(
                                          Array($list.evalLength() ?? 0).keys(),
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
                                                  inflection.camelCase(field),
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
                                          const localAttr = localAttributes[j];
                                          const remoteAttr =
                                            remoteAttributes[j];

                                          $parent.set(
                                            localAttr,
                                            $inserted.get(
                                              inflection.camelCase(remoteAttr!),
                                            ),
                                          );
                                        }
                                      }
                                    }
                                  },
                                [
                                  isReverse,
                                  localAttributes,
                                  remoteAttributes,
                                  leftTable,
                                  rightTable,
                                ],
                              ),
                            },
                          ),
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
              const connectorPath = rel.connectorFieldName;
              const pathTuples = rel.mutationFields.map(
                (f) => [connectorPath, f] as [string, string],
              );
              return [...memo, ...pathTuples];
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
                connectorTypeName,
                connectorFieldName: fieldName,
                rightTable,
              } = relationship;

              const nestedType = build.getInputTypeByName(connectorTypeName);
              if (nestedType) {
                return {
                  ...memo,
                  [fieldName]: fieldWithHooks(
                    {
                      fieldName,
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
