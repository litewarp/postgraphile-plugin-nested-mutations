import { GrafastInputFieldConfigMap } from 'grafast';
import type {
  PgNestedMutationRelationDetails,
  ResourceNestedMutationDetails,
} from './interfaces';

// need to define the Input Types for
// 1. connect
// 2. update
// 3. delete

type BuildInputObjectArguments = Parameters<
  GraphileBuild.Build['registerInputObjectType']
>;

export function createNestedConnectorType(
  details: PgNestedMutationRelationDetails,
  build: GraphileBuild.Build,
) {
  const {
    inflection,
    graphql: { GraphQLNonNull, GraphQLInputObjectType, GraphQLBoolean },
    grafast: {},
    getTypeByName,
    options: {},
    nullableIf,
  } = build;

  const { name, table, relationship } = details;

  const tableName = build.inflection.tableFieldName(table);

  const foreignTable = relationship.remoteResource;
  const foreignTableName = build.inflection.tableFieldName(foreignTable);

  const connectable = Boolean(foreignTable.uniques.length);

  // to do
  // const createable = true;
  // const updateable = true;
  // const deleteable = true;
  // return early if not connectable, createable, updateable, deletable or omit on read for the foreign table
  // if (
  //   (!connectable && !creatable && !deleteable && !updateable) ||
  //   omit(foreignTable, 'read')
  // ) {
  //   return;
  // }

  /* start from most granular and work out */
  /* connector fields first */
  /* deleter fields second */
  /* updater fields third */
  /* create and field types last */

  const connectByKeyInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const connectByNodeIdInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const deleteByKeyInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const deleteByNodeIdInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const updateByKeyInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const updateByNodeIdInputType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const updateByPatchType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const nestedConnectorFieldType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const nestedConnectorCreateType: BuildInputObjectArguments = [
    'typename',
    {},
    () => ({
      description: '',
      fields: ({ fieldWithHooks }) => {
        return {};
      },
    }),
    'info',
  ];

  const nestedTypes = [
    connectByKeyInputType,
    connectByNodeIdInputType,
    deleteByKeyInputType,
    deleteByNodeIdInputType,
    updateByKeyInputType,
    updateByNodeIdInputType,
    updateByPatchType,
    nestedConnectorFieldType,
    nestedConnectorCreateType,
  ];

  for (const type of nestedTypes) {
    build.registerInputObjectType(...type);
  }
}

function pgNestedFieldName(
  rel: ResourceNestedMutationDetails,
  inflection: GraphileBuild.Build['inflection'],
): string {
  const {
    isForward,
    table,
    foreignTable,
    leftTableKeyNames,
    foreignTableKeyNames,
  } = rel;

  const tableFieldName = inflection.tableFieldName(foreignTable);

  // filter out non applicable constraints
  // dont include constraints where read is omitted

  // multiple fk check to see if it's a many to many relationship
  const multipleFKs = false;

  const isUnique = foreignTable.isUnique;

  const computedReverseMutationName = inflection.camelCase(
    isUnique ? tableFieldName : inflection.pluralize(tableFieldName),
  );

  if (isForward) {
    return inflection.camelCase(
      `${tableFieldName}_to_${leftTableKeyNames.join('_and_')}`,
    );
  }

  if (!multipleFKs) {
    return inflection.camelCase(
      `${computedReverseMutationName}_using_${foreignTableKeyNames.join(
        '_and_',
      )}`,
    );
  }

  // tables have mutliple relations between them
  return inflection.camelCase(
    `${computedReverseMutationName}_to_${leftTableKeyNames.join(
      '_and_',
    )}_using_${foreignTableKeyNames.join('_and_')}`,
  );
}
