import { PgNestedMutationRelationship } from '../interfaces';

export function buildCreateInputType(
  rel: PgNestedMutationRelationship,
  build: GraphileBuild.Build,
): void {
  const { inflection, EXPORTABLE } = build;

  const {
    mutationFields: { create },
    rightTable,
    isReverse,
    relationName,
  } = rel;

  if (!create) {
    throw new Error(
      `Could not find create field and type names for relation ${relationName}`,
    );
  }

  build.registerInputObjectType(
    create.typeName,
    {
      isNestedInverseMutation: isReverse,
      isNestedMutationCreateInputType: true,
      isNestedMutationInputType: true,
    },
    () => ({
      description: build.wrapDescription(
        `The \`${rightTable.name}\` to be created by this mutation.`,
        'type',
      ),
      fields: ({ fieldWithHooks }) => {
        return Object.entries(rightTable.codec.attributes).reduce(
          (memo, [attributeName, attribute]) => {
            const attributeType = build.getGraphQLTypeByPgCodec(
              attribute.codec,
              'input',
            );
            if (!attributeType) {
              return memo;
            }

            const fieldName = inflection.attribute({
              attributeName,
              codec: rightTable.codec,
            });

            return {
              ...memo,
              [fieldName]: fieldWithHooks(
                { fieldName, pgAttribute: attribute },
                () => ({
                  description: attribute.description,
                  type: build.nullableIf(
                    (!attribute.notNull &&
                      !attribute.extensions?.tags?.notNull) ||
                      attribute.hasDefault ||
                      Boolean(attribute.extensions?.tags?.hasDefault),
                    attributeType,
                  ),
                  applyPlan: EXPORTABLE(
                    (attributeName) =>
                      function plan($parent, args) {
                        $parent.set(attributeName, args.get());
                      },
                    [attributeName],
                  ),
                }),
              ),
            };
          },
          {},
        );
      },
    }),
    `Generated input type for ${rightTable.name}`,
  );
}
