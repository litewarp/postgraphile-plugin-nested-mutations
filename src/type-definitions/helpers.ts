import { PgResource } from '@dataplan/pg';
import { PgTableResource } from '@graphile-contrib/pg-many-to-many';

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

export const isInsertable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  return build.behavior.pgResourceMatches(resource, 'resource:insert') === true;
};

export const isUpdatable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return !!build.behavior.pgResourceMatches(resource, 'resource:update');
};

export const isDeletable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return !!build.behavior.pgResourceMatches(resource, 'resource:delete');
};

export const getCRUDBehavior = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return {};
  if (!resource.codec.attributes) return {};
  if (resource.codec.polymorphism) return {};
  if (resource.codec.isAnonymous) return {};
  if (!resource.uniques || resource.uniques.length < 1) return {};

  return {
    insertable: isInsertable(build, resource),
    // connectable: isInsertable(build, resource), // TODO
    updatable: isUpdatable(build, resource),
    deletable: isDeletable(build, resource),
  };
};
