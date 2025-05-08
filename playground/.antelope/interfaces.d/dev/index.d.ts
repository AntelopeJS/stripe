import { RequestContext, RouteHandlerMode } from '@ajs/api/beta';
import { MethodDecorator } from '@ajs/core/beta/decorators';
export interface Log {
  /**
   * Source/origin of the log
   */
  source: 'dashboard' | 'web' | 'api' | 'script';
  endpoint: string;
  namespace: string;
  /**
   * HTTP method of the request
   */
  method?: string;
  /**
   * User id of the user that made the request `user._id`
   */
  userId?: string;
  /**
   * Name of the table that the log is related to. We recommend using the model name for this field
   */
  relatedTable?: string;
  /**
   * Id of the record that the log is related to
   */
  relatedId?: string;
  requestBody?: any;
  requestHeader?: any;
  responseBody?: any;
  ipAddress?: string;
  userAgent?: string;
  errorLevel?: 'error' | 'critical';
  errorMessage?: string;
  stackTrace?: string;
  executionTime?: number;
}
export interface LoggerOptions extends Pick<Log, 'source' | 'relatedTable'> {
  /**
   * Function to extract the related id from the request body, params or query
   * @param body The request body
   * @param params The request params
   * @param query The request query
   * @returns The related id
   */
  relatedId?: (ctx: RequestContext) => Promise<string | undefined>;
  /**
   * If enable, the user will be extracted from the token and logged
   * @defaultValue true
   */
  trackAuthenticatedUser?: boolean;
}
/**
 * Insert a log in the database
 */
export declare const InsertLog: (data: Log) => Promise<void>;
export declare const LoggedPut: (
  options: LoggerOptions,
  location?: string | undefined,
  mode?: RouteHandlerMode | undefined,
) => MethodDecorator;
export declare const LoggedGet: (
  options: LoggerOptions,
  location?: string | undefined,
  mode?: RouteHandlerMode | undefined,
) => MethodDecorator;
export declare const LoggedPost: (
  options: LoggerOptions,
  location?: string | undefined,
  mode?: RouteHandlerMode | undefined,
) => MethodDecorator;
export declare const LoggedDelete: (
  options: LoggerOptions,
  location?: string | undefined,
  mode?: RouteHandlerMode | undefined,
) => MethodDecorator;
