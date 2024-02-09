import {
  specFromNodeId,
  type __InputListStep,
  type __InputObjectStep,
  SafeError,
  object,
  type ExecutableStep,
  list,
} from 'grafast';
import {
  withPgClientTransaction,
  type WithPgClientStepCallback,
} from '@dataplan/pg';
import type { SQL } from 'postgraphile/pg-sql2';
import { inspect } from '../helpers';
import type { PgNestedMutationRelationship } from '../interfaces';

export function buildUpdateByNodeIdField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build,
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    inflection,
    EXPORTABLE,
    graphql: { GraphQLList, GraphQLNonNull },
    sql,
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
        (
          SafeError,
          inspect,
          isReverse,
          isUnique,
          list,
          nodeIdFieldName,
          object,
          rightHandler,
          rightTable,
          specFromNodeId,
          sql,
          withPgClientTransaction,
        ) =>
          function plan($parent, args, info) {
            const tableName = rightTable.name;
            const tableSymbol = Symbol(tableName);
            const tableAlias = sql.identifier(tableSymbol);
            const resourceSource = rightTable.from;

            if (!sql.isSQL(resourceSource)) {
              throw new Error(
                `Error in nested updateById field: can only update into resources defined as SQL, however ${rightTable.name} has ${inspect(rightTable.from)}`,
              );
            }
            const table = sql`${resourceSource} AS ${tableAlias}`;

            const updateSingleRecord: WithPgClientStepCallback<
              Record<string, string>,
              unknown
            > = async (client, data) => {
              const { patch, ...keys } = data;

              const attributes = Object.keys(patch ?? {});
              const attributesCount = attributes.length;

              if (attributesCount === 0) {
                throw new SafeError(
                  'Attempted to update a record, but no new values were specified',
                );
              }

              const sqlWhereClauses: SQL[] = [];
              const sqlSets: SQL[] = [];
              const sqlSelects: SQL[] = [];

              Object.entries(keys).forEach(([key, value], index) => {
                const attr = rightTable.codec.attributes[key];
                if (!attr?.codec) {
                  return;
                }

                sqlWhereClauses[index] = sql.parens(
                  sql`${sql.identifier(tableSymbol, key)} = ${sql.value(attr.codec.toPg(value))}`,
                );
              });

              Object.entries(rightTable.codec.attributes)
                .filter(([k, _v]) => attributes.includes(k))
                .forEach(([attr, attrDeets], i) => {
                  const identifier = sql.identifier(attr);
                  const value = sql.value(
                    attrDeets.codec.toPg((patch as any)[attr]),
                  );

                  sqlSets[i] = sql`${identifier} = ${value}`;
                  sqlSelects[i] = sql`${value} as ${identifier}`;
                });

              const set = sql` set ${sql.join(sqlSets, ', ')}`;
              const where = sql` where ${sql.parens(sql.join(sqlWhereClauses, ' and '))}`;

              const returning =
                sqlSelects.length > 0
                  ? sql` returning\n${sql.indent(sql.join(sqlSelects, '\n'))}`
                  : sql.blank;

              const query = sql`update ${table}${set}${where}${returning};`;

              const { text, values } = sql.compile(query);

              const { rows } = await client.query({
                text,
                values,
              });
              return rows[0];
            };

            const newlist: ExecutableStep[] = [];

            if (!isReverse || isUnique) {
              const $inputObj = object({
                ...specFromNodeId(rightHandler, args.get(nodeIdFieldName)),
                patch: args.get('patch'),
              });
              newlist.push($inputObj);
            } else {
              const $inputObj = args.getRaw() as __InputListStep;

              const length = $inputObj.evalLength() ?? 0;

              for (let i = 0; i < length; i++) {
                const dep = $inputObj.getDep(i) as __InputObjectStep;
                newlist.push(
                  object({
                    ...specFromNodeId(rightHandler, dep.get(nodeIdFieldName)),
                    patch: dep.get('patch'),
                  }),
                );
              }
            }

            const $newlist = list(newlist);

            withPgClientTransaction(
              rightTable.executor,
              $newlist,
              async (client, dataArray) => {
                await Promise.all(
                  dataArray.map(async (data) =>
                    updateSingleRecord(client, data as Record<string, string>),
                  ),
                );
              },
            );
          },
        [
          SafeError,
          inspect,
          isReverse,
          isUnique,
          list,
          nodeIdFieldName,
          object,
          rightHandler,
          rightTable,
          specFromNodeId,
          sql,
          withPgClientTransaction,
        ],
      ),
    },
  ];
}
