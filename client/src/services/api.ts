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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    const body = error.response?.data;
    const message =
      body?.message ??
      (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK"
        ? "Can't reach the server. Check your connection and try again."
        : "Something went wrong. Please try again.");
    return Promise.reject(
      new ApiRequestError(message, error.response?.status, body?.errors)
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
