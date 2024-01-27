import type {
  PgResource,
  PgResourceUnique,
  PgRegistry,
  PgCodecWithAttributes,
  PgCodec,
  PgCodecAttribute,
} from '@dataplan/pg';
import { PgTableResource } from '@graphile-contrib/pg-many-to-many';
import type {} from 'postgraphile';

export type PgNestedConnectorsInflectionFn = (
  this: GraphileBuild.Inflection,
  details: PgNestedMutationRelationship,
) => string;

export type PgTableRelationship = ReturnType<
  PgTableResource['getRelations']
>[1];

export type BuildInputObjectArguments = Parameters<
  GraphileBuild.Build['registerInputObjectType']
>;

export interface PgNestedMutationDetails {
  name?: string;
  connectorInputFieldType?: string;
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

export interface PgNestedMutationBehaviors {
  insertable?: boolean;
  connectable?: boolean;
  updatable?: boolean;
  deletable?: boolean;
}

export interface PgNestedMutationRelationship {
  connectorFieldName: string;
  connectorTypeName: string;
  leftTable: PgTableResource;
  rightTable: PgTableResource;
  relationName: string;
  isReverse?: boolean;
  isUnique?: boolean;
  localAttributes: readonly string[];
  remoteAttributes: readonly string[];
  localCodec: PgCodecWithAttributes;
  remoteCodecs: Record<string, PgCodecAttribute>;
  mutationFields: string[];
}

declare global {
  namespace GraphileBuild {
    interface BehaviorEntities {
      pgNestedCreate: PgNestedMutationRelationship;
    }

    interface Build {
      /**
       *
       */
      pgNestedMutationRelationships: Map<
        PgCodec,
        PgNestedMutationRelationship[]
      >;

      // returns the field in the input object
      // should be tablename for insert
      // patch for patch
      pgNestedMutationInputObjMap: Map<
        string,
        { field: string; codec: PgCodec }
      >;

      //

      /**
       * Old
       */
      pgNestedPluginFieldMap: Map<
        string,
        { fieldNames: string[]; tableName: string }
      >;
      pgNestedPluginForwardInputTypes: Record<
        string,
        PgNestedMutationDetails[]
      >;
      pgNestedPluginReverseInputTypes: Record<
        string,
        PgNestedMutationDetails[]
      >;
      pgNestedTableConnectorFields: Record<
        string,
        PgNestedTableConnectorField[]
      >;
      pgNestedTableDeleterFields: Record<string, PgNestedMutationDetails[]>;
      pgNestedTableUpdaterFields: Record<string, PgNestedMutationDetails[]>;
    }
    interface Inflection {
      nestedConnectByNodeIdInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByNodeIdFieldName: () => string;
      nestedConnectByKeyInputType: PgNestedConnectorsInflectionFn;
      nestedConnectByKeyFieldName: PgNestedConnectorsInflectionFn;
      nestedCreateInputType: PgNestedConnectorsInflectionFn;
      nestedConnectorFieldType: PgNestedConnectorsInflectionFn;
      nestedConnectorFieldName: PgNestedConnectorsInflectionFn;
    }

    interface ScopeInputObject {
      /**
       * General Flag for all nested mutation input types
       */
      isNestedMutationInputType?: boolean;
      /**
       * Indicates that the type is for the create field
       */
      isNestedMutationCreateInputType?: boolean;
      /**
       * Indicates that the type is for table to codec
       */
      isNestedInverseMutation?: boolean;
      /**
       * connect_by_key or connect_by_key_a_and_key_b field
       */
      isNestedMutationConnectByKeyType?: boolean;
      /**
       * connect_by_node_id field
       */
      isNestedMutationConnectByNodeIdType?: boolean;
      /**
       * type for the relationship field on the parent input
       * contains all the nested mutation input types
       */
      isNestedMutationConnectorType?: boolean;
      /**
       * delete_by_key or delete_by_key_a_and_key_b field
       */
      isNestedMutationDeleteByKeyType?: boolean;
      /**
       * delete_by_node_id field
       */
      isNestedMutationDeleteByNodeInputType?: boolean;
      /**
       * update_by_key or update_by_key_a_and_key_b field
       */
      isNestedMutationUpdateByKeyType?: boolean;
      /**
       * update_by_node_id field
       */
      isNestedMutationUpdateByNodeIdType?: boolean;
      /**
       * patch types for the update field for the foreign input
       */
      isNestedMutationPatchType?: boolean;
      /**
       * field which resolves to the the connector type
       */
      isNestedMutationInputField?: boolean;
    }

    interface ScopeInputObjectFieldsField {}
  }
}
