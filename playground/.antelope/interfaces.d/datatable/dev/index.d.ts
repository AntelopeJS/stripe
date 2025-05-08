import { ComputedParameter, RequestContext } from '@ajs/api/beta';
import { Class, ClassDecorator } from '@ajs/core/beta/decorators';
import { DataModel } from '@ajs/database-decorators/beta/model';
import { Query, ValueProxy } from '@ajs/database/beta';

export declare function getMetadata<T extends Record<string, any>, U extends Record<string, any>>(
  target: U,
  meta: Class<T, [U]> & {
    key: symbol;
  },
  inherit?: boolean,
): T;
export declare enum AccessMode {
  ReadOnly = 1,
  WriteOnly = 2,
  ReadWrite = 3,
}
export interface FieldData {
  dbName?: string;
  mode?: AccessMode;
  listable?: string[] | true;
  mandatory?: Set<string>;
  sortable?: boolean;
  foreign?: [table: string, index?: string, multi?: true];
  desc?: PropertyDescriptor;
}
export type Comparison = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';
export type FilterValue = [value: any, mode: Comparison];
export type FilterFunction<T extends Record<string, any>, U = any> = (
  context: RequestContext & {
    this: T;
  },
  row: ValueProxy.Proxy<U>,
  key: string,
  ...args: FilterValue
) => ValueProxy.ProxyOrVal<boolean>;
export declare enum HookPriority {
  HIGHEST = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  LOWEST = 4,
}
export type HookType = {
  Parameters: (params: Record<string, any>) => Record<string, any>;
  PreRead: (params: { query: Query }) => {
    query: Query;
  };
  PreWrite: (data: any) => any;
  PostWrite: (data: any, result: any) => any;
  PostRead: (result: any) => any;
  Response: (result: any, ...args: any[]) => any;
};
type PromisedFunction<F> = F extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
export declare class DatatableMeta {
  static key: symbol;
  readonly hooks: Record<
    string,
    {
      [K in keyof HookType]?: Array<{
        parameters: (ComputedParameter | null)[];
        callback: PromisedFunction<HookType[K]>;
        priority: HookPriority;
      }>;
    }
  >;
  readonly filters: Record<string, FilterFunction<any>>;
  readonly fields: Record<string, FieldData>;
  readonly listing_pluck: Set<string>;
  tableKey?: string;
  readonly readable: Record<'getters' | 'props', [string, FieldData][]>;
  readonly writable: Record<'setters' | 'props', [string, FieldData][]>;
  constructor();
  inherit(parent: DatatableMeta): void;
  private field;
  private recomputeListable;
  private recomputeAccess;
  setMode(name: string, mode: AccessMode): this;
  setListable(name: string, requiredFields: boolean | string[]): this;
  setMandatory(name: string, modes: string[]): this;
  setSortable(name: string, active: boolean, noIndex: boolean): this;
  setForeign(name: string, table: string, index?: string, multi?: boolean): this;
  setDescriptor(name: string, desc?: PropertyDescriptor): this;
  setFilter(name: string, func: FilterFunction<Record<string, any>, Record<string, any>>): this;
  setTableKey(name: string): this;
  addHook<K extends keyof HookType>(
    method: string,
    type: K,
    parameters: (ComputedParameter | null)[],
    callback: PromisedFunction<HookType[K]>,
    priority: HookPriority,
  ): void;
  runHooks<K extends keyof HookType>(
    context: RequestContext,
    method: string,
    type: K,
    thisArg: any,
    ...args: Parameters<HookType[K]>
  ): Promise<ReturnType<HookType[K]>>;
}
export declare const Access: (
  mode: AccessMode,
) => import('@ajs/core/beta/decorators').PropertyDecorator & import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Listable: (
  requiredFields?: boolean | string[] | undefined,
) => import('@ajs/core/beta/decorators').PropertyDecorator & import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Mandatory: (
  ...args: string[]
) => import('@ajs/core/beta/decorators').PropertyDecorator & import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Optional: () => import('@ajs/core/beta/decorators').PropertyDecorator &
  import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Sortable: (
  options?:
    | {
        noIndex?: boolean | undefined;
      }
    | undefined,
) => import('@ajs/core/beta/decorators').PropertyDecorator & import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Foreign: (
  table: string,
  index?: string | undefined,
  multi?: boolean | undefined,
) => import('@ajs/core/beta/decorators').PropertyDecorator & import('@ajs/core/beta/decorators').MethodDecorator;
export declare const Filter: <T extends Record<string, any>>(
  func?: FilterFunction<T> | undefined,
) => (target: T, propertyKey: string | symbol) => void;
export declare const TableReference: () => import('@ajs/core/beta/decorators').PropertyDecorator;
export declare const DatatableHook: <T extends {}, K extends keyof T, KT extends keyof HookType>(
  method: string,
  type: KT,
  priority?: HookPriority,
) => (
  t: T,
  key: K,
  descriptor: T[K] extends (...args: [...Parameters<HookType[KT]>, ...any[]]) => ReturnType<HookType[KT]>
    ? PropertyDescriptor
    : never,
) => void;
export interface GetOptions<T = any> {
  index?: keyof T & string;
  /** Ignore foreign keys */
  shallow?: boolean;
}
export interface ListOptions<T = any> {
  filters?: Record<string, FilterValue>;
  page?: [start: number, count: number];
  maxPage?: number;
  sorting?: [field: keyof T & string, ascending: boolean];
  /** Ignore foreign keys */
  shallow?: boolean;
  /** Ignore Listing decorators, fetch every field */
  complete?: boolean;
}
export interface NewOptions<T = any> {
  /** Ignore fields marked mandatory for new entries */
  ignoreMandatory?: boolean;
  /** */
  createForeign?: boolean;
}
export interface EditOptions<T = any> {
  /** Ignore fields marked mandatory for existing entries */
  ignoreMandatory?: boolean;
}
export interface DeleteOptions<T = any> {}
export declare const Get: <T, D>(
  thisObj: T,
  context: RequestContext,
  model: DataModel,
  table: Class<D>,
  id: string,
  options?: GetOptions<T>,
) => Promise<D | undefined>;
export declare const List: <T, D>(
  thisObj: T,
  context: RequestContext,
  model: DataModel,
  table: Class<D>,
  options?: ListOptions<T>,
) => Promise<D[]>;
export declare const New: <T, D>(
  thisObj: T,
  context: RequestContext,
  model: DataModel,
  table: Class<D>,
  data: Partial<T>,
  options?: NewOptions<T>,
) => Promise<string>;
export declare const Edit: <T, D>(
  thisObj: T,
  context: RequestContext,
  model: DataModel,
  table: Class<D>,
  id: string,
  data: Partial<T>,
  options?: EditOptions<T>,
) => Promise<void>;
export declare const Delete: <T, D>(
  thisObj: T,
  context: RequestContext,
  model: DataModel,
  table: Class<D>,
  id: string | string[],
  options?: DeleteOptions<T>,
) => Promise<void>;
type EndpointDeclaration = {
  location: string;
} & (
  | {
      type: 'get';
      options?: GetOptions;
    }
  | {
      type: 'list';
      options?: ListOptions;
    }
  | {
      type: 'new';
      options?: NewOptions;
    }
  | {
      type: 'edit';
      options?: EditOptions;
    }
  | {
      type: 'delete';
      options?: DeleteOptions;
    }
);
export interface DatatableOptions {
  defaultMandatoryModes?: string[];
}
export declare const Datatable: <T, K extends keyof T>(
  modelKey: K,
  endpoints: EndpointDeclaration[],
  options?: DatatableOptions,
) => ClassDecorator<
  Class<T> & {
    location: string;
  }
>;
