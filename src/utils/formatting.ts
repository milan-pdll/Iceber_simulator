export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatTimestamp(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function truncateMiddle(str: string, maxLen: number = 32): string {
  if (!str || str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(str.length - half);
}

export function getFilename(path: string): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}
