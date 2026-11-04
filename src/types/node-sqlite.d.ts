/**
 * Minimal ambient types for the `node:sqlite` built-in module (Node >= 22.5).
 * @types/node 20 does not ship them yet, and we only use a small surface.
 */
declare module 'node:sqlite' {
  export interface StatementResult {
    changes?: number | bigint;
    lastInsertRowid?: number | bigint;
  }

  export interface Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): StatementResult;
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
