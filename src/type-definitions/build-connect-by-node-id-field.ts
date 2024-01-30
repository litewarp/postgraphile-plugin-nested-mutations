import { node, specFromNodeId } from 'grafast';
import { PgNestedMutationRelationship } from '../interfaces';
import { isInsertOrUpdate } from './create-helpers';

export function buildConnectByNodeIdField(
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
    mutationFields: { connectByNodeId },
    rightTable,
    relationName,
    localAttributes,
    remoteAttributes,
  } = relationship;

  if (!connectByNodeId) {
    throw new Error(
      `Could not find connectByNodeId field for relation ${relationName}`,
    );
  }

  const inputType = build.getInputTypeByName(connectByNodeId.typeName);

  if (!inputType) {
    throw new Error(`Could not find input type ${connectByNodeId.typeName}`);
  }

  if (!build.getNodeIdHandler) {
    throw new Error(`No build.getNodeIdHandler function found`);
  }
  const nodeIdHandler = build.getNodeIdHandler(
    inflection.tableType(rightTable.codec),
  );

  if (!nodeIdHandler) {
    throw new Error(`No node id handler found for ${rightTable.name}`);
  }

  return [
    {
      fieldName: connectByNodeId.fieldName,
      isNestedMutationConnectByNodeIdType: true,
      isNestedMutationInputType: true,
    },
    {
      description: build.wrapDescription(
        `A \`${rightTable.name}\` object that will be connected by its ID.`,
        'field',
      ),
      type:
        !isReverse || !isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      applyPlan: EXPORTABLE(
        (nodeIdHandler) =>
          function plan($parent, args, info) {
            if (isInsertOrUpdate($parent)) {
              if (isReverse) {
              } else {
                // key is on the object being updated or created
                // find the node_id and update the foreign key column
                const $nodeId = args.get('id');
                const spec = specFromNodeId(nodeIdHandler, $nodeId);

                for (let i = 0; i < remoteAttributes.length; i++) {
                  const local = localAttributes[i];
                  const remote = remoteAttributes[i];
                  const remoteStep = remote ? spec[remote] : null;
                  if (local && remoteStep) {
                    $parent.set(local, remoteStep);
                  }
                }
              }
            }
          },
        [nodeIdHandler],
      ),
    },
  ];
}
