export function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.URL.revokeObjectURL(url);
}
