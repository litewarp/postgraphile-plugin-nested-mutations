import type {
  PgResource,
  PgResourceUnique,
  PgRegistry,
  PgCodecWithAttributes,
} from '@dataplan/pg';
import type {} from 'postgraphile';
import type { GrafastInputFieldConfig } from 'grafast';
import type { GraphQLInputObjectType } from 'graphql';
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
}

interface PgNestedTableConnectorField {
  fieldName: string;
  unique?: PgResourceUnique;
  typeName: string;
  isNodeIdConnector?: boolean;
  relationship: PgTableRelationship;
}

interface PgNestedRelationshipDetail extends PgNestedMutationRelationDetails {
  name: string;
  connectorInputFieldType: string;
}

declare global {
  namespace GraphileBuild {
    interface Build {
      pgNestedRelationships: PgNestedMutationRelationDetails[];
      pgNestedMutationTypes: Set<string>;
      pgNestedConnectorFields: Record<string, PgNestedTableConnectorField[]>;
      pgNestedPluginForwardInputTypes: Record<
        string,
        PgNestedRelationshipDetail[]
      >;
      pgNestedPluginReverseInputTypes: Record<
        string,
        PgNestedRelationshipDetail[]
      >;
      pgNestedTableConnectorFields: any;
      pgNestedTableDeleterFields: any;
      pgNestedTableUpdaterFields: any;
      pgNestedFieldName: any;
    }
    interface Inflection {
      buildConstraintName: PgNestedConnectorsInflectionFn;
      nestedConnectByNodeIdInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByNodeIdFieldName: () => string;
      nestedConnectByKeyInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyFieldName: PgNestedConnectorsInflectionFn;
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
      isNestedMutationConnectorType?: boolean;
      isNestedMutationDeleteInputType?: boolean;
      isNestedMutationDeleteByNodeInputType?: boolean;
      isNestedMutationUpdateInputType?: boolean;
      isNestedMutationUpdateByNodeIdType?: boolean;
      isNestedMutationPatchType?: boolean;
      pgNestedForeignInflection?: PgResource;
    }
  }
}
