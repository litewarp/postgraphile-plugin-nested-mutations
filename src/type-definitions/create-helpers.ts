import {
  PgDeleteSingleStep,
  PgInsertSingleStep,
  PgUpdateSingleStep,
} from '@dataplan/pg';
import { PgNestedMutationRelationship } from '../interfaces';
import { ExecutableStep, __InputObjectStep } from 'grafast';

export function getReverseForeignKeysSteps(
  $parent: PgInsertSingleStep | PgUpdateSingleStep | PgDeleteSingleStep,
  { localAttributes, remoteAttributes }: PgNestedMutationRelationship,
): Record<string, ExecutableStep> {
  return localAttributes.reduce((steps, localAttr, i) => {
    const remote = remoteAttributes[i];
    return remote ? { ...steps, [remote]: $parent.get(localAttr) } : steps;
  }, {});
}

export function getReverseNonForeignKeySteps(
  $dep: __InputObjectStep,
  { rightTable, remoteAttributes }: PgNestedMutationRelationship,
  inflection: GraphileBuild.Inflection,
): Record<string, ExecutableStep> {
  return Object.keys(rightTable.codec.attributes)
    .filter((a) => a !== 'id' && remoteAttributes.includes(a))
    .reduce((steps, attr) => {
      // todo -- add generic type to ensure all attributes are present
      const field = inflection.attribute({
        attributeName: attr,
        codec: rightTable.codec,
      });

      return field
        ? {
            ...steps,
            [attr]: $dep.get(field),
          }
        : steps;
    }, {});
}

export function isInsertOrUpdate(
  $step: ExecutableStep,
): $step is PgInsertSingleStep | PgUpdateSingleStep {
  return (
    $step instanceof PgInsertSingleStep || $step instanceof PgUpdateSingleStep
  );
}
