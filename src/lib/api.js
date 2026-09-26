// The backend's own .env sets PORT=5100, so that is the default here — a default
// of 5000 silently points every request at a port nothing is listening on.
// Override with NEXT_PUBLIC_API_URL for any other host or port.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5100/api";

export const AUTH_ENDPOINTS = {
  register: "/auth/register",
  login: "/auth/login",
  logout: "/auth/logout",
  me: "/auth/me",
  // Same path as `me` with a different verb: only the fields that are sent change.
  updateProfile: "/auth/me",
  changePassword: "/auth/change-password",
};

// Phase 23 — a session can stop being valid while the app is open: the token
// expires, or the password is changed on another device and every existing
// session is refused. Without a signal for that, the UI keeps looking signed in
// while every request fails, which reads as a broken app rather than a signed
// out one. Same window-event shape as ThemeToggle's THEME_EVENT.
export const SESSION_EXPIRED_EVENT = "nexus:session-expired";

// Endpoints where a 401 is the answer itself rather than a dead session: they
// are how somebody becomes signed in in the first place.
const ANONYMOUS_ENDPOINTS = new Set([AUTH_ENDPOINTS.login, AUTH_ENDPOINTS.register]);

// FormData bodies must reach fetch untouched: the browser generates the
// multipart boundary itself, so setting Content-Type here would corrupt the
// request (boundary missing) or make the server hang waiting for a body.
function isFormData(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function apiRequest(path, options = {}) {
  const { body, headers, ...rest } = options;
  const multipart = isFormData(body);

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: multipart ? headers : body ? { "Content-Type": "application/json", ...headers } : headers,
    body: multipart ? body : body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    ...rest,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !ANONYMOUS_ENDPOINTS.has(path)) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    const error = new Error(data?.message || "Something went wrong");
    error.status = response.status;
    throw error;
  }

  return data;
}

export default apiRequest;
