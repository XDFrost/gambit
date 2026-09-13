import type { ErrorCode } from '@gambit/protocol';
import { ERROR_MESSAGES } from '@gambit/protocol';

export class EngineError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'EngineError';
  }
}

export const fail = (code: ErrorCode, message?: string): never => {
  throw new EngineError(code, message);
};

export const assert = (cond: unknown, code: ErrorCode, message?: string): void => {
  if (!cond) fail(code, message);
};
