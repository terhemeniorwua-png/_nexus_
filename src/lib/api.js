const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export async function apiRequest(path, options = {}) {
  const { body, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    ...rest,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || "Something went wrong");
    error.status = response.status;
    throw error;
  }

  return data;
}

export const AUTH_ENDPOINTS = {
  register: "/auth/register",
  login: "/auth/login",
  logout: "/auth/logout",
  me: "/auth/me",
};

export default apiRequest;