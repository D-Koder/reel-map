// Live progress for the scraper endpoints.
//
// Called by the app directly: the response is a stream of JSON lines.
//   {"type":"step","message":"..."}          one line per step, as it happens
//   {"type":"result","status":200,"body":{}}  last line, with the real result
//
// Called by another endpoint (enrich-reel): steps go to req.emit, and the
// result is returned on the response object the caller passed in.

function progressFor(req, res, tag) {
  const forward = typeof req.emit === 'function' ? req.emit : null;
  let finished = false;

  if (!forward) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  const step = (message) => {
    console.log(`[${tag}] ${message}`);
    if (forward) forward({ type: 'step', message });
    else if (!finished) res.write(`${JSON.stringify({ type: 'step', message })}\n`);
  };

  const respond = (status, body) => {
    if (forward) return res.status(status).json(body);
    if (!finished) {
      finished = true;
      res.write(`${JSON.stringify({ type: 'result', status, body })}\n`);
      res.end();
    }
    return undefined;
  };

  return { step, respond };
}

module.exports = { progressFor };
