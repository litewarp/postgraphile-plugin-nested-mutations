import { GraphileConfig } from 'graphile-build';
import { isPgTableResource } from './helpers';
import {
  ExecutableStep,
  ListStep,
  ObjectStep,
  __InputListStep,
  __InputObjectStep,
  access,
  applyTransforms,
  each,
  first,
  lambda,
  object,
  setter,
} from 'grafast';

import { getNestedMutationRelationships } from './get-nested-relationships';
import { PgNestedMutationRelationship } from '../interfaces';
import {
  PgInsertSingleStep,
  PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';

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
        const { isReverse, leftTable, localAttributes } = details;

        return this.upperCamelCase(
          [
            this.tableFieldName(leftTable),
            localAttributes,
            'fkey',
            isReverse ? 'inverse' : null,
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

        const { leftTable, rightTable, localAttributes } = details;

        return this.upperCamelCase(
          [
            this.tableFieldName(leftTable),
            localAttributes,
            'fkey',
            this.tableFieldName(rightTable),
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
          graphql: {
            GraphQLInputObjectType,
            GraphQLObjectType,
            GraphQLNonNull,
            GraphQLList,
            GraphQLID,
          },
          inflection,
          EXPORTABLE,
        } = build;

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

          const createdTypes = new Set<string>();

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

            // register createType
            build.recoverable(null, () => {
              if (!createdTypes.has(createInputTypeName)) {
                createdTypes.add(createInputTypeName);

                build.registerInputObjectType(
                  createInputTypeName,
                  {
                    isNestedInverseMutation: relationship.isReverse,
                    isNestedMutationCreateInputType: true,
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
                                      console.log(attributeName, $parent);
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
              }

              // dedupe
              if (!createdTypes.has(relationship.connectorTypeName)) {
                createdTypes.add(relationship.connectorTypeName);

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
                              isNestedInverseMutation: relationship.isReverse,
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
                                  fieldName,
                                  isReverse,
                                  localAttributes,
                                  remoteAttributes,
                                  resource,
                                ) =>
                                  function plan($parent, args) {
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
                                        console.log(
                                          otherAttrs,
                                          leftTable.name,
                                          foreignKeys,
                                        );

                                        const $list =
                                          args.getRaw() as __InputListStep;

                                        const depLength = $list.evalLength();

                                        if (!depLength) {
                                          return;
                                        }

                                        for (let i = 0; i < depLength; i++) {
                                          const $dep = $list.getDep(
                                            i,
                                          ) as __InputObjectStep;

                                          pgInsertSingle(resource, {
                                            ...foreignKeys,
                                            ...otherAttrs.reduce(
                                              (memo, field) => {
                                                return {
                                                  ...memo,
                                                  [field]: $dep.get(
                                                    inflection.camelCase(field),
                                                  ),
                                                };
                                              },
                                              {},
                                            ),
                                          });
                                        }
                                      } else {
                                        // if the root table contains the foreign keys
                                        // create the new object and then update the root
                                      }
                                    }
                                  },
                                [
                                  fieldName,
                                  isReverse,
                                  localAttributes,
                                  remoteAttributes,
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
              }
            });
          }
        }

        return init;
      },

      GraphQLObjectType_fields_field(field, build, context) {
        const {
          scope: { isRootMutation, fieldName },
        } = context;

        if (!isRootMutation) {
          return field;
        }

        const fieldKey = build.pgNestedMutationInputObjMap.get(fieldName);

        if (!fieldKey) {
          return field;
        }

        const nestedMutationDetails = build.pgNestedMutationRelationships.get(
          fieldKey.codec,
        );

        if (!nestedMutationDetails) {
          return field;
        }

        const updatePaths = nestedMutationDetails.reduce((memo, rel) => {
          const connectorPath = rel.connectorFieldName;
          return rel.mutationFields.map((f) => [connectorPath, f]);
        }, [] as string[][]);

        return {
          ...field,
          plan(parent, args, info) {
            const previousPlan = field.plan!(parent, args, info);
            const inputPlan = previousPlan.get('result') as ObjectStep;
            for (const paths of updatePaths) {
              args.apply(inputPlan, ['input', fieldKey.field, ...paths]);
            }
            return previousPlan;
          },
        };
      },

      GraphQLInputObjectType_fields(fields, build, context) {
        const { inflection, EXPORTABLE } = build;

        const {
          fieldWithHooks,
          scope: { isPgRowType, pgCodec },
          Self,
        } = context;

        if (
          isPgRowType &&
          pgCodec &&
          build.pgNestedMutationRelationships.has(pgCodec)
        ) {
          const data = build.pgNestedMutationRelationships.get(pgCodec) ?? [];

          return data.reduce((memo, relationship) => {
            return build.recoverable(memo, () => {
              const {
                connectorTypeName,
                connectorFieldName,
                leftTable,
                rightTable,
                localAttributes,
                remoteAttributes,
                isReverse,
              } = relationship;
              const type = build.getInputTypeByName(connectorTypeName);
              if (!type) {
                return memo;
              }

              const result = {
                [connectorFieldName]: fieldWithHooks(
                  {
                    fieldName: connectorFieldName,
                    isNestedMutationInputField: true,
                  },
                  {
                    description: build.wrapDescription(
                      `The input field for the relationship to ${rightTable.name}`,
                      'field',
                    ),
                    type,
                    applyPlan: EXPORTABLE(
                      (fieldName) =>
                        function plan($parent, args) {
                          const isInsertOrUpdate =
                            $parent instanceof PgInsertSingleStep ||
                            $parent instanceof PgUpdateSingleStep;

                          if (isInsertOrUpdate) {
                            if (isReverse) {
                              // if the relation table contains the foreign keys
                              // i.e., isReverse = true
                              // get the referenced key on the root table
                              // add it to the payload for the nested create
                              const keySteps = localAttributes.reduce(
                                (memo, attr, index) => {
                                  const remoteAttr = remoteAttributes[index];
                                  if (!remoteAttr) return memo;
                                  return {
                                    ...memo,
                                    [inflection.camelCase(remoteAttr)]:
                                      $parent.get(attr),
                                  };
                                },
                                {} as Record<string, ExecutableStep>,
                              );
                            } else {
                              // if the root table contains the foreign keys
                              // create the new object and then update the root
                            }
                          }
                        },
                      [connectorFieldName],
                    ),
                  },
                ),
              };

              return build.extend(
                memo,
                result,
                `Adding connector field for ${connectorTypeName} on input or patch for ${leftTable.name}`,
              );
            });
          }, fields);
        }

        return fields;
      },
    },
  },
};
