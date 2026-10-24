// relay/errors.ts — the only error type the relay's domain and HTTP layers share.
// Messages are written here, never copied from a request body or a token.
export type RelayErrorKind = 'conflict' | 'notfound' | 'forbidden' | 'badpayload';

export class RelayError extends Error {
  readonly kind: RelayErrorKind;
  readonly status: number;

  constructor(kind: RelayErrorKind, status: number, message: string) {
    super(message);
    this.name = 'RelayError';
    this.kind = kind;
    this.status = status;
  }
}
