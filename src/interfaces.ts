import type {
  PgResource,
  PgResourceUnique,
  PgRegistry,
  PgCodecWithAttributes,
} from '@dataplan/pg';
import type {} from 'postgraphile';
import type { GrafastInputFieldConfig } from 'grafast';
import { GraphQLInputType } from 'graphql';

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
  typeName: string;
}

export interface PgNestedConnectorTypeObj {
  leftTable: PgTableResource;
  rightTable: PgTableResource;
  isUnique: boolean;
  typeName: string;
}

interface PgNestedTableConnectorField {
  fieldName: string;
  type: GraphQLInputType;
  relationship: PgTableRelationship;
}

declare global {
  namespace GraphileBuild {
    interface Build {
      pgNestedRelationships: PgNestedMutationRelationDetails[];
      pgNestedMutationConnectorTypes: PgNestedConnectorTypeObj[];
      pgNestedMutationTypes: Set<string>;
      pgNestedConnectorFields: Record<string, PgNestedTableConnectorField>;
    }
    interface Inflection {
      nestedConnectByNodeIdInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByNodeIdFieldName: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyAttributesInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyAttributesFieldName: PgNestedConnectorsInflectionFn;
      nestedCreateInputType: PgNestedConnectorsInflectionFn;
      nestedConnectorFieldType: PgNestedConnectorsInflectionFn;
      nestedConnectorFieldName: PgNestedConnectorsInflectionFn;
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
