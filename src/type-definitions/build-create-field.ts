import { constantCase, type GraphileBuild } from 'graphile-build';
import { object, type __InputListStep, type __InputObjectStep } from 'grafast';
import type { SQL } from 'postgraphile/pg-sql2';
import type { PgCodec } from '@dataplan/pg';
import type { PgNestedMutationRelationship } from '../interfaces';
import { inspect, isInsertOrUpdate } from '../helpers';
import { withPgClientResource } from '../steps/with-pgclient-resource';
import { nestedCreateStep } from '../steps/nested-create-step';

export function buildCreateField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build,
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    sql,
    EXPORTABLE,
    graphql: { GraphQLList, GraphQLNonNull },
  } = build;

  const {
    mutationFields: { create },
    rightTable,
    isReverse,
    isUnique,
    relationName,
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
        (isInsertOrUpdate, nestedCreateStep, relationName, relationship) =>
          function plan($parent, args, _info) {
            const {
              isReverse,
              isUnique,
              rightTable,
              localAttributes,
              remoteAttributes,
            } = relationship;

            if (isInsertOrUpdate($parent)) {
              if (!isReverse || isUnique) {
                console.log(isReverse);
                // if the left table contains the foreign keys
                // the relation is unique so you can only input one
                // create the new right table object and then update the left table

                const $nestedObj = nestedCreateStep(rightTable, args.get());

                for (let i = 0; i < localAttributes.length; i++) {
                  const field = localAttributes[i];
                  const remote = remoteAttributes[i];
                  if (field && remote) {
                    $parent.set(field, $nestedObj.get(remote));
                  }
                }
              } else {
                // if the relation table contains the foreign keys
                // i.e., isReverse = true
                // get the referenced key on the root table
                // add it to the payload for the nested create

                const $list = args.getRaw() as __InputListStep;

                const listLength = $list.evalLength() ?? 0;

                for (let j = 0; j < listLength; j++) {
                  const $item = $list.getDep(j) as __InputObjectStep;

                  const $nestedObj = nestedCreateStep(rightTable, $item);

                  console.log(relationName, localAttributes, remoteAttributes);
                  for (let i = 0; i < localAttributes.length; i++) {
                    const field = localAttributes[i];
                    const remote = remoteAttributes[i];
                    if (field && remote) {
                      $nestedObj.set(remote, $parent.get(field));
                    }
                  }

                  // add localAttributions to nested create
                  // nestedCreate(relationship, $parent, $item);
                }
              }
            }
          },

        [isInsertOrUpdate, nestedCreateStep, relationName, relationship],
      ),
    },
  ];
}
