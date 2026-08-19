import { UserDocument } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. */
      user?: UserDocument;
    }
  }
}

export {};
