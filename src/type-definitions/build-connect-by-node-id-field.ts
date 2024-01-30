import { __InputObjectStep, constant, node, specFromNodeId } from 'grafast';
import { PgNestedMutationRelationship } from '../interfaces';
import { isInsertOrUpdate } from './create-helpers';
import { pgUpdateSingle } from '@dataplan/pg';

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
    leftTable,
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

  const rightTableType = inflection.tableType(rightTable.codec);

  const rightHandler = build.getNodeIdHandler(rightTableType);

  if (!rightHandler) {
    throw new Error(`No node id handler found for ${rightTable.name}`);
  }

  const nodeIdFieldName = inflection.nodeIdFieldName();

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
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      applyPlan: EXPORTABLE(
        (rightHandler, nodeIdFieldName, rightTable) =>
          function plan($parent, args, info) {
            if (isInsertOrUpdate($parent)) {
              if (isReverse) {
                const $inputObj = args.getRaw() as __InputObjectStep;

                // extract the ids to connect by from the input object
                // can't use args.get('id') because it's an array
                const inputs = Object.entries($inputObj.eval() ?? {}).reduce(
                  (m, [k, v]) => {
                    if (v) {
                      const id = Object.entries(v).find(
                        ([k, v]) => k === nodeIdFieldName,
                      )?.[1];
                      return id ? [...m, id] : m;
                    }
                    return m;
                  },
                  [] as string[],
                );

                for (const id of inputs) {
                  const spec = specFromNodeId(rightHandler, constant(id));

                  pgUpdateSingle(rightTable, spec, {
                    ...localAttributes.reduce((m, local, i) => {
                      const remote = remoteAttributes[i];
                      if (local && remote) {
                        return {
                          ...m,
                          [remote]: $parent.get(local),
                        };
                      }
                      return m;
                    }, {}),
                  });
                }
              } else {
                // key is on the object being updated or created
                // find the node_id and update the foreign key column
                const $nodeId = args.get('id');
                const spec = specFromNodeId(rightHandler, $nodeId);

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
        [rightHandler, nodeIdFieldName, rightTable],
      ),
    },
  ];
}
