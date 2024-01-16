import type {
  PgResource,
  PgResourceUnique,
  PgRegistry,
  PgCodecWithAttributes,
} from '@dataplan/pg';
import type {} from 'postgraphile';

// A generic table resource with attributes, uniques, relations, and no paramters
export type PgTableResource = PgResource<
  string,
  PgCodecWithAttributes,
  PgResourceUnique[],
  undefined,
  PgRegistry
>;

export type PgNestedConnectorsInflectionFn = (
  this: GraphileBuild.Inflection,
  details: PgNestedMutationRelationDetails,
) => string;

export type PgTableRelationship = ReturnType<
  PgTableResource['getRelations']
>[1];

export type BuildInputObjectArguments = Parameters<
  GraphileBuild.Build['registerInputObjectType']
>;

export interface PgNestedMutationRelationDetails {
  relationName: string;
  table: PgTableResource;
  relationship: PgTableRelationship;
}

export interface PgNestedConnectorTypeObj {
  leftTable: PgTableResource;
  rightTable: PgTableResource;
  isUnique: boolean;
  typeName: string;
}

declare global {
  namespace GraphileBuild {
    interface Build {
      pgNestedRelationships: Map<
        PgTableResource,
        PgNestedMutationRelationDetails[]
      >;
      pgNestedMutationConnectorTypes: PgNestedConnectorTypeObj[];
      pgNestedMutationTypes: Set<string>;
    }
    interface Inflection {
      nestedConnectByNodeIdInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByNodeIdFieldName: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyAttributesInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyAttributesFieldName: PgNestedConnectorsInflectionFn;
      nestedCreateInputType: PgNestedConnectorsInflectionFn;
      nestedConnectorFieldType: PgNestedConnectorsInflectionFn;
    }

    interface ScopeInputObject {
      isNestedMutationInputType?: boolean;
      isNestedMutationCreateInputType?: boolean;
      isNestedInverseMutation?: boolean;
      isNestedMutationConnectInputType?: boolean;
      isNestedMutationConnectByNodeIdType?: true;
      isNestedMutationDeleteInputType?: boolean;
      isNestedMutationDeleteByNodeInputType?: boolean;
      isNestedMutationUpdateInputType?: boolean;
      isNestedMutationUpdateByNodeIdType?: boolean;
      isNestedMutationPatchType?: boolean;
      pgNestedForeignInflection?: PgResource;
    }
  }
}
