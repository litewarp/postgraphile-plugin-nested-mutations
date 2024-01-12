import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { makeSchema } from 'graphile-build';
import { PostGraphileAmberPreset } from 'postgraphile/presets/amber';
import { PgManyToManyPreset } from '@graphile-contrib/pg-many-to-many';
import { hookArgs, grafastGraphql as graphql } from 'grafast';
import { parse, printSchema } from 'graphql';
import { makeV4Preset } from 'postgraphile/presets/v4';
import { NestedMutationPreset } from '../src';
import { withPgClient } from './helpers';

const readFixtureForSqlSchema = async (sqlSchema: string, fixture: string) =>
  readFile(
    path.resolve(
      __dirname,
      'schemas',
      sqlSchema,
      'fixtures',
      'queries',
      fixture,
    ),
    'utf8',
  );

async function queryResult(sqlSchema: string, fixture: string) {
  return withPgClient({
    cb: async (pgClient) => {
      // reset schema
      const setupSchema = await readFile(
        path.resolve(__dirname, 'schemas', sqlSchema, 'schema.sql'),
        'utf8',
      );

      await pgClient.query(setupSchema);

      const data = await readFile(
        path.resolve(__dirname, 'schemas', sqlSchema, 'data.sql'),
        'utf8',
      );

      await pgClient.query(data);

      const { schema, resolvedPreset } = await makeSchema({
        extends: [
          PostGraphileAmberPreset,
          makeV4Preset(),
          PgManyToManyPreset,
          NestedMutationPreset,
        ],
        pgServices: [
          {
            name: 'main',
            adaptor: '@dataplan/pg/adaptors/pg',
            withPgClientKey: 'withPgClient',
            pgSettingsKey: 'pgSettings',
            pgSettingsForIntrospection: {},
            schemas: [sqlSchema],
            adaptorSettings: {
              poolClient: pgClient,
            },
          },
        ],
      });

      await writeFile('./tmp/schema.graphql', printSchema(schema));

      const query = await readFixtureForSqlSchema(sqlSchema, fixture);

      const args = {
        schema,
        source: query,
      };

      await hookArgs(
        {
          schema,
          document: parse(query),
        },
        resolvedPreset,
        {
          /* optional details for your context callback(s) to use */
        },
      );

      return graphql(args);
    },
  });
}

const getFixturesForSqlSchema = (sqlSchema: string) =>
  existsSync(
    path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries'),
  )
    ? readdirSync(
        path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries'),
      ).sort()
    : [];

const getSqlSchemas = () =>
  readdirSync(path.resolve(__dirname, 'schemas')).sort();

const sqlSchemas = getSqlSchemas();

describe.each(sqlSchemas)('%s', (sqlSchema) => {
  const fixtures = getFixturesForSqlSchema(sqlSchema);
  if (fixtures.length > 0) {
    test.each(fixtures)('query=%s', async (fixture) => {
      const result = await queryResult(sqlSchema, fixture);
      if (result.errors) {
        console.log(result.errors.map((e) => e.originalError ?? e));
      }
      expect(result).toMatchSnapshot();
    });
  }
});
