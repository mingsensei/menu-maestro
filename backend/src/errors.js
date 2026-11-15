export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; }
}

export function unwrap({ data, error }) {
  if (error) throw new HttpError(502, 'Database request failed. Please try again.');
  return data;
}
