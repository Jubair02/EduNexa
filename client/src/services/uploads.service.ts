import type { ApiResponse, StoredFileInfo, UploadKind } from "@/types";
import { api, unwrap } from "./api";

export const uploadsService = {
  /** Uploads a file to the server's storage provider (Cloudinary). */
  async upload(
    file: File,
    kind: UploadKind,
    onProgress?: (percent: number) => void
  ): Promise<StoredFileInfo> {
    const form = new FormData();
    form.append("file", file);

    const res = await api.post<ApiResponse<StoredFileInfo>>(
      `/uploads?kind=${kind}`,
      form,
      {
        timeout: 120_000,
        onUploadProgress: (event) => {
          if (event.total && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      }
    );
    return unwrap(res.data);
  },
};

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const PDF_ACCEPT = "application/pdf";
export const DOCUMENT_ACCEPT =
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
