import type { __InputListStep, __InputObjectStep } from 'grafast';
import { isInsertOrUpdate } from '../helpers';
import type { PgNestedMutationRelationship } from '../interfaces';

export function buildUpdateByNodeIdField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build,
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    inflection,
    EXPORTABLE,
    graphql: { GraphQLList, GraphQLNonNull },
  } = build;

  const {
    isReverse,
    isUnique,
    rightTable,
    relationName,
    mutationFields: { updateByNodeId },
  } = relationship;

  if (!updateByNodeId) {
    throw new Error(
      `Could not find updateByNodeId field for relation ${relationName}`,
    );
  }

  const inputType = build.getInputTypeByName(updateByNodeId.typeName);

  if (!build.getNodeIdHandler) {
    throw new Error(`No build.getNodeIdHandler function found`);
  }

  const rightTableType = inflection.tableType(rightTable.codec);

  const rightHandler = build.getNodeIdHandler(rightTableType);

  if (!rightHandler) {
    throw new Error(`No node id handler found for ${rightTable.name}`);
  }

  const nodeIdFieldName = inflection.nodeIdFieldName();

  return [
    { fieldName: updateByNodeId.fieldName },
    {
      description: build.wrapDescription(
        `The primary keys and patch data for ${rightTable.name} for the far side of the relationship`,
        'field',
      ),
      type:
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      autoApplyAfterParentApplyPlan: true,
      applyPlan: EXPORTABLE(
        () =>
          function plan($parent, args, info) {
            console.log('YYYARRS');
            console.log(args.get());
          },
        [],
      ),
    },
  ];
}
