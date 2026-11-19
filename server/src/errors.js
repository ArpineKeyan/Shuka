// One error shape for the whole API: { "error": { "code", "message" } }
export class HttpError extends Error {
  constructor(status, code, message, fields, details) {
    super(message);
    this.status = status; this.code = code; this.fields = fields; this.details = details;
  }
}
export const badRequest = (message, fields) => new HttpError(400, 'invalid_input', message, fields);
export const unauthorized = () => new HttpError(401, 'signed_out', 'Please log in.');
export const forbidden = (m = 'You are not allowed to do this.') => new HttpError(403, 'forbidden', m);
export const notFound = (m = 'Not found.') => new HttpError(404, 'not_found', m);
export const conflict = (m, code = 'conflict', details) => new HttpError(409, code, m, undefined, details);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    const body = { code: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;     // per-field messages for forms
    if (err.details) body.details = err.details;  // e.g. which prices changed
    return res.status(err.status).json({ error: body });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_input', message: 'Body is not valid JSON.' } });
  }
  if (err.status === 404 || err.statusCode === 404) {   // e.g. a missing photo file
    return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } });
}
