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

export type PgTableRelationship = ReturnType<
  PgTableResource['getRelations']
>[1];

export interface PgNestedMutationRelationDetails {
  relationName: string;
  table: PgTableResource;
  relationship: PgTableRelationship;
}

declare global {
  namespace GraphileBuild {
    interface Build {
      pgNestedRelationshipsByResource: Map<
        PgTableResource,
        PgNestedMutationRelationDetails[]
      >;
      pgNestedPluginForwardInputType: Record<string, unknown>;
      pgNestedPluginReverseInputType: Record<string, unknown>;
      pgNestedCreateResolvers: Record<string, unknown>;
      pgNestedUpdateResolvers: Record<string, unknown>;
      pgNestedMutationsByTypeName: Record<string, unknown>;
      pgNestedFieldName: (options: unknown[]) => string;
      pgNestedTableConnect: (options: unknown[]) => Promise<unknown>;
      pgNestedTableConnectorFields: Record<string, unknown>;
      pgNestedTableDelete: (options: unknown[]) => Promise<unknown>;
      pgNestedTableDeleterFields: Record<string, unknown>;
      pgNestedTableUpdate: (options: unknown[]) => Promise<unknown>;
      pgNestedTableUpdaterFields: Record<string, unknown>;
    }
    interface Inflection {
      nestedConnectByNodeIdFieldName: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedConnectByKeyFieldName: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedConnectByNodeIdInputType: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedConnectByKeyInputType: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedConnectorType: (
        this: Inflection,
        rel: PgNestedMutationRelationDetails,
      ) => string;
      nestedCreateInputType: (
        this: Inflection,
        rel: PgNestedMutationRelationDetails,
      ) => string;
      nestedDeleteByNodeIdField: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedDeleteByKeyField: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedDeleteByNodeIdInputType: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedDeleteByKeyInputType: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedUpdateByNodeIdField: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedUpdateByKeyField: (
        this: Inflection,
        resource: PgResource,
      ) => string;
      nestedUpdatePatchType: (this: Inflection, resource: PgResource) => string;
      nestedUpdateByKeyInputType: (
        this: Inflection,
        resource: PgResource,
      ) => string;
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

    interface ScopeObjectFieldsField {
      isNodeIdConnector: boolean;
    }
  }
}
