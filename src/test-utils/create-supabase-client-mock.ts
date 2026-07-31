/**
 * Minimal browser Supabase client stub for Vitest.
 * Supports query chaining (`.select().eq().in()…`) and realtime (`.channel().on().subscribe()`).
 */

type QueryResult = { data: unknown; error: null };

export type SupabaseClientMock = {
  from: (table?: string) => SupabaseQueryBuilderMock;
  channel: (name?: string) => SupabaseChannelMock;
  removeChannel: (channel: unknown) => Promise<'ok'>;
};

export type SupabaseQueryBuilderMock = {
  select: (...args: unknown[]) => SupabaseQueryBuilderMock;
  insert: (...args: unknown[]) => SupabaseQueryBuilderMock;
  update: (...args: unknown[]) => SupabaseQueryBuilderMock;
  upsert: (...args: unknown[]) => SupabaseQueryBuilderMock;
  delete: (...args: unknown[]) => SupabaseQueryBuilderMock;
  eq: (...args: unknown[]) => SupabaseQueryBuilderMock;
  in: (...args: unknown[]) => SupabaseQueryBuilderMock;
  order: (...args: unknown[]) => SupabaseQueryBuilderMock;
  limit: (...args: unknown[]) => SupabaseQueryBuilderMock;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: PromiseLike<QueryResult>['then'];
};

export type SupabaseChannelMock = {
  on: (...args: unknown[]) => SupabaseChannelMock;
  subscribe: (cb?: (status: string) => void) => SupabaseChannelMock;
  unsubscribe: () => void;
};

export function createSupabaseClientMock(
  result: QueryResult = { data: [], error: null },
): SupabaseClientMock {
  const createBuilder = (): SupabaseQueryBuilderMock => {
    const builder: SupabaseQueryBuilderMock = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () =>
        Promise.resolve({
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
          error: null,
        }),
      maybeSingle: () =>
        Promise.resolve({
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
          error: null,
        }),
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const createChannel = (): SupabaseChannelMock => {
    const channel: SupabaseChannelMock = {
      on: () => channel,
      subscribe: (cb) => {
        cb?.('SUBSCRIBED');
        return channel;
      },
      unsubscribe: () => undefined,
    };
    return channel;
  };

  return {
    from: () => createBuilder(),
    channel: () => createChannel(),
    removeChannel: async () => 'ok',
  };
}
