import type {
  GetPgResourceAttributes,
  PgClient,
  WithPgClient,
} from '@dataplan/pg';
import type { PgTableResource } from '@graphile-contrib/pg-many-to-many';
import { access, ExecutableStep } from 'grafast';
import type {
  GrafastResultsList,
  GrafastValuesList,
  PromiseOrDirect,
} from 'grafast';
import { sql, type SQL } from 'postgraphile/pg-sql2';

type ResourceObject<TResource extends PgTableResource> = {
  [K in keyof GetPgResourceAttributes<TResource>]: unknown;
};

export type WithPgClientReturningResourceCallback<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TResource extends PgTableResource = PgTableResource,
> = (
  client: PgClient,
  data: TData,
  attributes: keyof GetPgResourceAttributes<TResource>[],
) => Promise<ResourceObject<TResource>>;

export class WithPgClientReturningResourceStep<
  TResource extends PgTableResource = PgTableResource,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TResult extends ResourceObject<TResource> = ResourceObject<TResource>,
> extends ExecutableStep<TResult> {
  static $$export = {
    moduleName: '@litewarp/graphile-nested-mutations',
    exportName: 'WithPgClientReturningResourceStep',
  };

  isSyncAndSafe = false;
  hasSideEffects = true;

  public readonly resource: TResource;

  private name: string;

  private symbol: symbol | string;

  private alias: SQL;

  private contextId: number;

  private dataId: number;

  private attributes = new Set<keyof GetPgResourceAttributes<TResource>>();

  private params: Partial<TResult> = Object.create(null);

  constructor(
    resource: TResource,
    $data: ExecutableStep<TData>,
    private callback: WithPgClientReturningResourceCallback<TData, TResource>,
    private ioEquivalence?: Record<string, ExecutableStep>,
  ) {
    super();
    this.resource = resource;
    this.name = this.resource.name;
    this.symbol = Symbol(this.name);
    this.alias = sql.identifier(Symbol(this.name));
    this.contextId = this.addDependency(this.resource.executor.context());
    this.dataId = this.addDependency($data);
  }

  get(attr: keyof GetPgResourceAttributes<TResource>) {
    // Allow auto-collapsing of the waterfall by knowing keys are equivalent
    if (
      this.ioEquivalence &&
      this.operationPlan.phase === 'plan' &&
      this.ioEquivalence[attr as any]
    ) {
      return this.ioEquivalence[attr as any];
    }

    this.attributes.add(attr);
    return access(this, attr);
  }

  setParam<TParamKey extends keyof TResult>(
    paramKey: TParamKey,
    value: TResult[TParamKey],
  ): void {
    this.params[paramKey] = value;
  }

  execute(
    count: number,
    values: [
      GrafastValuesList<{
        pgSettings: Record<string, any>;
        withPgClient: WithPgClient;
      }>,
      GrafastValuesList<TData>,
    ],
  ): GrafastResultsList<TResult> {
    console.log(values);
    const contexts = values[this.contextId as 0] ?? [];
    const datas = values[this.dataId as 1];
    return contexts.map(async ({ pgSettings, withPgClient }, i) => {
      const data = datas[i]!;
      return withPgClient(pgSettings, (client) =>
        this.callback(client, data, [...this.attributes]),
      );
    });
  }
}

export function withPgClientResource<
  TResource extends PgTableResource = PgTableResource,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  resource: TResource,
  $data: ExecutableStep<TData>,
  callback: WithPgClientReturningResourceCallback<TData, TResource>,
) {
  return new WithPgClientReturningResourceStep(resource, $data, callback);
}
