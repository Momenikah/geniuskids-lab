// Dashboard environment values can accidentally include quotes or whitespace.
export function envValue(env, key) {
  let value = typeof env[key] === 'string' ? env[key].trim() : '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.status = 503;
  }
}

export function requiredKey(env, primary, legacy) {
  const value = envValue(env, primary) || (legacy && envValue(env, legacy));
  if (!value) throw new ConfigurationError(`Konfigurasi ${primary}${legacy ? ` atau ${legacy}` : ''} belum diisi di server.`);
  return value;
}

export function configuredOrigin(env, key) {
  const value = requiredKey(env, key);
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    // Never echo environment values: a misconfigured URL may contain a secret.
    throw new ConfigurationError(`Konfigurasi ${key} tidak valid. Gunakan URL lengkap dengan http:// atau https://, tanpa path, query, atau hash.`);
  }
}
