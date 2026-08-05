const UNITS = ["B", "KB", "MB", "GB"] as const;

// File_Uploads.md's file metadata display ("filename, size, type") — human-readable file size.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unitIndex]}`;
}
