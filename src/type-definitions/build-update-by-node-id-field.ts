import {
  specFromNodeId,
  type __InputListStep,
  type __InputObjectStep,
  type ObjectStep,
  SafeError,
  object,
} from 'grafast';
import { pgUpdateSingle, withPgClientTransaction } from '@dataplan/pg';
import type { SQL, SQLRawValue } from 'postgraphile/pg-sql2';
import { inspect, isInsertOrUpdate } from '../helpers';
import type { PgNestedMutationRelationship } from '../interfaces';

type QueryValueDetailsBySymbol = Map<
  symbol,
  { name: string; processor: (value: any) => SQLRawValue }
>;

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
          nodeIdFieldName,
          object,
          rightHandler,
          rightTable,
          specFromNodeId,
          sql,
          withPgClientTransaction,
        ) =>
          function plan($parent, args, info) {
            const spec = specFromNodeId(
              rightHandler,
              args.get(nodeIdFieldName),
            );

            const obj = object({
              ...spec,
              patch: args.get('patch'),
            });
            const $nestedUpdate = withPgClientTransaction(
              rightTable.executor,
              obj,
              async (client, data) => {
                const { patch, ...keys } = data;

                const attributes = Object.keys(patch ?? {});
                const attributesCount = attributes.length;

                if (attributesCount === 0) {
                  throw new SafeError(
                    'Attempted to update a record, but no new values were specified',
                  );
                }

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

                const sqlWhereClauses: SQL[] = [];
                const sqlSets: SQL[] = [];
                const sqlSelects: SQL[] = [];
                const queryValueDetailsBySymbol: QueryValueDetailsBySymbol =
                  new Map();

                const attrs = Object.entries(rightTable.codec.attributes)
                  .filter(([k, _v]) => attributes.includes(k))
                  .map(([k, v]) => ({ pgCodec: v.codec, name: k }));

                Object.entries(keys).forEach(([key, value], index) => {
                  const attr = rightTable.codec.attributes[key];
                  if (!attr?.codec) {
                    return;
                  }
                  const { codec } = attr;

                  const symbol = Symbol(key);

                  sqlWhereClauses[index] = sql.parens(
                    sql`${sql.identifier(tableSymbol, key)} = ${sql.value(value as any)}`,
                  );
                  queryValueDetailsBySymbol.set(symbol, {
                    name: key,
                    processor: codec.toPg,
                  });
                });

                // where is the node id translated

                for (let i = 0; i < attributesCount; i++) {
                  const attr = attrs[i];
                  if (!attr?.pgCodec || !attr.name) {
                    continue;
                  }
                  const { pgCodec, name } = attr;

                  const symbol = Symbol(name);

                  const identifier = sql.identifier(name);
                  const value = sql`${sql.value(
                    // THIS IS A DELIBERATE HACK - we will be replacing this symbol with
                    // a value before executing the query.
                    symbol as any,
                  )}::${pgCodec.sqlType}`;

                  sqlSets[i] = sql`${identifier} = ${value}`;
                  sqlSelects[i] = sql`${value} as ${identifier}`;
                  queryValueDetailsBySymbol.set(symbol, {
                    name: attr.name,
                    processor: pgCodec.toPg,
                  });
                }

                const set = sql` set ${sql.join(sqlSets, ', ')}`;
                const where = sql` where ${sql.parens(sql.join(sqlWhereClauses, ' and '))}`;

                const returning =
                  sqlSelects.length > 0
                    ? sql` returning\n${sql.indent(sql.join(sqlSelects, '\n'))}`
                    : sql.blank;

                const query = sql`update ${table}${set}${where}${returning};`;

                const { text, values: rawSqlValues } = sql.compile(query);

                const sqlValues = queryValueDetailsBySymbol.size
                  ? rawSqlValues.map((v) => {
                      if (typeof v === 'symbol') {
                        const details = queryValueDetailsBySymbol.get(v);
                        if (!details) {
                          throw new Error(
                            `Saw unexpected symbol '${inspect(v)}'`,
                          );
                        }
                        const val = (patch as Record<string, string | number>)[
                          details.name
                        ];
                        return !val ? null : details.processor(val);
                      }
                      return v;
                    })
                  : rawSqlValues;

                const { rows } = await client.query({
                  text,
                  values: sqlValues,
                });
                return rows[0];
              },
            );
          },
        [
          SafeError,
          inspect,
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
