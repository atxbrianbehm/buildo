import { PsgDocumentSchema, type PsgDocument } from "../contracts/psgDocument";

export function parsePsgDocument(input: unknown): PsgDocument {
  return PsgDocumentSchema.parse(input);
}

