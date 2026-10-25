import { PsgDocumentSchema, type PsgDocument } from "../contracts/psgDocument";

export function exportPsgDocument(document: PsgDocument): PsgDocument {
  return PsgDocumentSchema.parse(document);
}

