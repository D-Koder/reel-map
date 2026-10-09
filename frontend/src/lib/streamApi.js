// Calls a scraper endpoint that streams JSON lines:
//   {"type":"step","message":"..."}  as each step happens
//   {"type":"result","status":200,"body":{...}}  last
export async function postStream(url, payload, { onStep, timeoutMs = 60000 } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  const handleLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'step') onStep?.(event.message);
    if (event.type === 'result') result = event;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  handleLine(buffer);

  if (!result) throw new Error('The scraper stopped before it finished. Try again.');
  if (result.status >= 400) {
    const error = new Error(result.body?.error || `Request failed (HTTP ${result.status})`);
    error.body = result.body;
    throw error;
  }
  return result.body;
}
