export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
