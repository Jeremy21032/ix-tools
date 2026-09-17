async function parseToolResponse(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 2000) };
    }
  }
  if (!res.ok && data.ok !== true) {
    const httpHint = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    const err = new Error(data.error || httpHint);
    err.data = {
      ...data,
      logs: Array.isArray(data.logs) && data.logs.length ? data.logs : [data.error || httpHint],
    };
    throw err;
  }
  return data;
}

export async function apiPost(path, body, { multipart = false } = {}) {
  const opts = {
    method: "POST",
    credentials: "same-origin",
  };
  if (multipart) {
    opts.body = body;
  } else {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`/api/tools/${path}`, opts);
  return parseToolResponse(res);
}

export async function apiGet(path) {
  const res = await fetch(`/api/tools/${path}`, { credentials: "same-origin" });
  return parseToolResponse(res);
}
