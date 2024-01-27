import { PgTableResource } from '@graphile-contrib/pg-many-to-many';
import { PgNestedMutationRelationship } from '../interfaces';

export function getNestedMutationRelationships(
  leftTable: PgTableResource,
  build: GraphileBuild.Build,
): PgNestedMutationRelationship[] {
  const { inflection } = build;

  return Object.entries(leftTable.getRelations()).reduce(
    (memoLeft, [relationName, relationDetails]) => {
      const {
        localAttributes,
        remoteResource,
        isReferencee,
        remoteAttributes,
        isUnique,
        localCodec,
      } = relationDetails;

      const rightTable: PgTableResource = remoteResource;
      const isReverse = isReferencee;

      if (!rightTable) {
        return memoLeft;
      }

      const remoteUniq = rightTable.uniques.find((u) =>
        u.attributes.every((a) => remoteAttributes.includes(a)),
      );

      const remoteCodecs = Object.entries(rightTable.codec.attributes).reduce(
        (memoCodec, [k, v]) =>
          remoteUniq?.attributes.includes(k)
            ? { ...memoCodec, [k]: v }
            : memoCodec,
        {},
      );

      const obj = {
        leftTable,
        rightTable,
        relationName,
        isUnique,
        localCodec,
        isReverse,
        localAttributes,
        remoteAttributes,
        remoteCodecs,
        mutationFields: ['create'],
        connectorFieldName: '',
        connectorTypeName: '',
      };

      return [
        ...memoLeft,
        {
          ...obj,
          connectorFieldName: inflection.nestedConnectorFieldName(obj),
          connectorTypeName: inflection.nestedConnectorFieldType(obj),
        },
      ];
    },
    [] as PgNestedMutationRelationship[],
  );
}
