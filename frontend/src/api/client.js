export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', fields = null, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.body = body;
  }
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function idempotencyKeyFor(reference, payload) {
  const fingerprint = JSON.stringify(payload);
  if (!reference.current || reference.current.fingerprint !== fingerprint) {
    reference.current = { fingerprint, key: createIdempotencyKey() };
  }
  return reference.current.key;
}

export async function requestApi(url, options = {}) {
  const { token, onUnauthorized, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  let body = fetchOptions.body;

  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(url, { ...fetchOptions, headers, body });
  } catch (error) {
    throw new ApiError('No pudimos conectar con el sistema. Revisa tu conexión e intenta nuevamente.', {
      code: 'NETWORK_ERROR',
      body: error,
    });
  }

  const raw = response.status === 204 ? '' : await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ApiError('El sistema devolvió una respuesta inválida.', {
        status: response.status,
        code: 'INVALID_RESPONSE',
      });
    }
  }

  if (!response.ok && response.status === 401 && onUnauthorized) onUnauthorized(data);
  if (!response.ok && !data.error) {
    data.error = data.mensaje || 'No pudimos completar la solicitud. Intenta nuevamente.';
  }
  return { ok: response.ok, status: response.status, data, headers: response.headers };
}
