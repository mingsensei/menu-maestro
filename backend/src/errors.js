export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function unwrap({ data, error }) {
  if (error) throw new HttpError(502, 'Database request failed. Please try again.');
  return data;
}
