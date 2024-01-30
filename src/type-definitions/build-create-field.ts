import { GraphileBuild } from 'graphile-build';
import { PgNestedMutationRelationship } from '../interfaces';
import { isInsertOrUpdate } from '../helpers';
import { ExecutableStep, __InputListStep, __InputObjectStep } from 'grafast';
import { pgInsertSingle } from '@dataplan/pg';

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

  if (!inputType) {
    throw new Error(
      `Could not find input type ${create.typeName} for create mutation for ${rightTable.name}`,
    );
  }

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
        (isReverse, localAttributes, remoteAttributes, rightTable) =>
          function plan($parent, args, info) {
            if (isInsertOrUpdate($parent)) {
              if (isReverse) {
                // if the relation table contains the foreign keys
                // i.e., isReverse = true
                // get the referenced key on the root table
                // add it to the payload for the nested create
                const foreignKeySteps = localAttributes.reduce(
                  (memo, local, i) => {
                    const remote = remoteAttributes[i];
                    return remote
                      ? { ...memo, [remote]: $parent.get(local) }
                      : memo;
                  },
                  {} as Record<string, ExecutableStep>,
                );

                const remotePrimaryUnique = rightTable.uniques.find(
                  (u) => u.isPrimary,
                );

                // remove primary key and all the foreign keys you are adding
                const nonForeignKeys = Object.keys(
                  rightTable.codec.attributes,
                ).filter(
                  (a) =>
                    !remoteAttributes.includes(a) &&
                    (remotePrimaryUnique
                      ? !remotePrimaryUnique.attributes.includes(a)
                      : true),
                );

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

                const inputs = Object.entries($inputObj.eval() ?? {}).reduce(
                  (m, [k, v]) => (Boolean(v) ? [...m, k] : m),
                  [] as string[],
                );

                const $inserted = pgInsertSingle(rightTable, {
                  ...inputs.reduce(
                    (m, f) => ({
                      ...m,
                      [f]: args.get(f),
                    }),
                    {},
                  ),
                });

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
        [isReverse, localAttributes, remoteAttributes, rightTable],
      ),
    },
  ];
}
