import { PgNestedMutationRelationDetails, PgTableResource } from './interfaces';

/**
 * For each table, gather all the relationships that are nested
 * and prepare them for the nested connector plugin.
 */
export function gatherRelationshipData(
  leftTable: PgTableResource,
  build: GraphileBuild.Build,
): PgNestedMutationRelationDetails[] {
  const relations = leftTable.getRelations();

  return Object.entries(relations).reduce(
    (acc, [relationName, rightRelation]) => {
      const details: PgNestedMutationRelationDetails = {
        relationName: relationName,
        table: leftTable,
        relationship: rightRelation,
        typeName: '',
      };

      return [...acc, details];
    },
    [] as PgNestedMutationRelationDetails[],
  );
}
