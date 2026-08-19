import axios, { AxiosError } from "axios";
import type { ApiResponse, FieldError } from "@/types";
import { getToken } from "@/utils/token";

/** Normalized error thrown by every API call. */
export class ApiRequestError extends Error {
  readonly status?: number;
  readonly fieldErrors?: FieldError[];

  constructor(message: string, status?: number, fieldErrors?: FieldError[]) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the browser set the multipart boundary for file uploads.
  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  return config;
});

/** True when the payload is this API's `{ success, message }` envelope. */
const isApiEnvelope = (body: unknown): body is ApiResponse =>
  typeof body === "object" &&
  body !== null &&
  typeof (body as { message?: unknown }).message === "string";

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    const response = error.response;
    const body = response?.data;

    if (isApiEnvelope(body)) {
      return Promise.reject(
        new ApiRequestError(body.message, response?.status, body.errors)
      );
    }

    // No response at all — the request never completed (offline, DNS failure,
    // CORS block, or the 15s timeout elapsed).
    if (!response) {
      return Promise.reject(
        new ApiRequestError(
          "Can't reach the server. Check your connection and try again."
        )
      );
    }

    // A response arrived, but it is not this API's envelope — so something
    // other than the API answered (a host's 404/502 page, a proxy, a redirect
    // to an SPA fallback). Almost always a misconfigured API base URL, so log
    // the full target to make that visible.
    // baseURL may be relative ("/api"), so resolve against the page origin.
    const base = (error.config?.baseURL ?? "").replace(/\/+$/, "");
    const path = error.config?.url ?? "";
    const url = new URL(
      `${base}${path.startsWith("/") ? "" : "/"}${path}`,
      window.location.origin
    );

    const raw: unknown = response.data;
    console.error(
      `[api] ${error.config?.method?.toUpperCase() ?? "GET"} ${url.href} ` +
        `returned ${response.status} with a non-API body:`,
      typeof raw === "string" ? raw.slice(0, 300) : raw
    );

    return Promise.reject(
      new ApiRequestError(
        `The server at ${url.origin} did not return a valid API response ` +
          `(HTTP ${response.status}). The API URL may be misconfigured.`,
        response.status
      )
    );
  }
);

/** Unwraps the `data` payload of a successful API envelope. */
export const unwrap = <T>(response: ApiResponse<T>): T => {
  if (response.data === undefined) {
    throw new ApiRequestError("The server returned an unexpected response.");
  }
  return response.data;
};
