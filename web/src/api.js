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
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.ok !== true) {
    const err = new Error(data.error || res.statusText || "Error");
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiGet(path) {
  const res = await fetch(`/api/tools/${path}`, { credentials: "same-origin" });
  return res.json();
}
