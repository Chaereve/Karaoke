/**
 * Formats seconds into mm:ss.xx (standard LRC / display format)
 */
export function formatTimeDisplay(seconds: number | null | undefined, includeMs = true): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return includeMs ? '--:--.--' : '--:--';
  }
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped - Math.floor(clamped)) * 100);

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (!includeMs) {
    return `${mm}:${ss}`;
  }
  const xx = String(centis).padStart(2, '0');
  return `${mm}:${ss}.${xx}`;
}

/**
 * Formats seconds into SRT timestamp hh:mm:ss,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(mins).padStart(2, '0') +
    ':' +
    String(secs).padStart(2, '0') +
    ',' +
    String(Math.min(999, millis)).padStart(3, '0')
  );
}

/**
 * Formats file size in bytes into human-readable KB / MB
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
