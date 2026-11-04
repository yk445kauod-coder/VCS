export class DutyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = 'bad_request', details?: unknown) {
    super(message);
    this.name = 'DutyError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string): DutyError =>
  new DutyError(`${what} not found`, 404, 'not_found');

export const unauthorized = (message = 'Unauthorized'): DutyError =>
  new DutyError(message, 401, 'unauthorized');

export const badRequest = (message: string, details?: unknown): DutyError =>
  new DutyError(message, 400, 'bad_request', details);

export const conflict = (message: string): DutyError => new DutyError(message, 409, 'conflict');

export const notImplemented = (message: string): DutyError =>
  new DutyError(message, 501, 'not_implemented');

export const isDutyError = (error: unknown): error is DutyError => error instanceof DutyError;
