import type { GraphileBuild } from 'graphile-build';
import type {
  ExecutableStep,
  __InputListStep,
  __InputObjectStep,
} from 'grafast';
import { pgInsertSingle } from '@dataplan/pg';
import type { PgNestedMutationRelationship } from '../interfaces';
import { isInsertOrUpdate } from '../helpers';

export function buildCreateField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build,
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    inflection,
    EXPORTABLE,
    graphql: { GraphQLList, GraphQLNonNull },
  } = build;

  const {
    mutationFields: { create },
    leftTable,
    rightTable,
    isReverse,
    isUnique,
    localAttributes,
    relationName,
    remoteAttributes,
  } = relationship;

  if (!create) {
    throw new Error(
      `Could not find create field and type names for relation ${relationName}`,
    );
  }

  const inputType = build.getInputTypeByName(create.typeName);

  return [
    {
      fieldName: create.fieldName,
      isNestedMutationInputType: true,
      isNestedMutationCreateInputType: true,
    },
    {
      description: build.wrapDescription(
        `A \`${build.getGraphQLTypeNameByPgCodec(
          rightTable.codec,
          'input',
        )}\` object that will be created and connected to this object.`,
        'field',
      ),
      type:
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      applyPlan: EXPORTABLE(
        (
          inflection,
          isInsertOrUpdate,
          isReverse,
          localAttributes,
          pgInsertSingle,
          remoteAttributes,
          rightTable,
        ) =>
          function plan($parent, args, info) {
            if (isInsertOrUpdate($parent)) {
              if (isReverse) {
                // if the relation table contains the foreign keys
                // i.e., isReverse = true
                // get the referenced key on the root table
                // add it to the payload for the nested create

                const foreignKeySteps = localAttributes.reduce<
                  Record<string, ExecutableStep>
                >((memo, local, i) => {
                  const remote = remoteAttributes[i];
                  return remote
                    ? { ...memo, [remote]: $parent.get(local) }
                    : memo;
                }, {});

                const remotePrimaryUnique = rightTable.uniques.find(
                  (u) => u.isPrimary,
                );

                // remove primary key and all the foreign keys you are adding
                const nonForeignKeys = Object.keys(
                  rightTable.codec.attributes,
                ).filter((a) => {
                  const attr = rightTable.codec.attributes[a];
                  return (
                    !remoteAttributes.includes(a) &&
                    (remotePrimaryUnique
                      ? !remotePrimaryUnique.attributes.includes(a)
                      : true)
                  );
                });

                const $list = args.getRaw() as __InputListStep;

                const listLength = $list.evalLength() ?? 0;

                for (let j = 0; j < listLength; j++) {
                  const $item = $list.getDep(j) as __InputObjectStep;

                  pgInsertSingle(rightTable, {
                    ...foreignKeySteps,
                    ...nonForeignKeys.reduce((m, f) => {
                      return {
                        ...m,
                        [f]: $item.get(
                          inflection.attribute({
                            codec: rightTable.codec,
                            attributeName: f,
                          }),
                        ),
                      };
                    }, {}),
                  });
                }
              } else {
                // if the root table contains the foreign keys
                // the relation is unique so you can only input one
                // create the new object and then update the root
                const $inputObj = args.getRaw() as __InputObjectStep;

                // TODO REPLACE WITH PGTRANSACTION??

                const { attributes } = rightTable.codec;

                const inputValues = Object.keys(attributes).reduce(
                  (inputObjMemo, attr) => {
                    // filter out primary keys
                    // add in foreign keys(?)
                    const attrFieldName = inflection.attribute({
                      attributeName: attr,
                      codec: rightTable.codec,
                    });
                    if ($inputObj.evalHas(attrFieldName)) {
                      return {
                        ...inputObjMemo,
                        [attr]: $inputObj.get(attrFieldName),
                      };
                    }
                    return inputObjMemo;
                  },
                  {},
                );

                const $inserted = pgInsertSingle(rightTable, inputValues);

                for (let j = 0; j < localAttributes.length; j++) {
                  const localAttr = localAttributes[j];
                  const remoteAttr = remoteAttributes[j];

                  if (localAttr && remoteAttr) {
                    $parent.set(
                      localAttr,
                      $inserted.get(inflection.camelCase(remoteAttr)),
                    );
                  }
                }
              }
            }
          },
        [
          inflection,
          isInsertOrUpdate,
          isReverse,
          localAttributes,
          pgInsertSingle,
          remoteAttributes,
          rightTable,
        ],
      ),
    },
  ];
}
