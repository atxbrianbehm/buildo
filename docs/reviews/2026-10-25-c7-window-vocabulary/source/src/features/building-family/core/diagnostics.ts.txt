import { z } from "zod";

export const DiagnosticSeveritySchema = z.enum(["info", "warning", "error"]);

export const DiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: DiagnosticSeveritySchema,
  path: z.string().optional(),
  received: z.unknown().optional(),
  allowedValues: z.array(z.unknown()).optional()
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export function diagnostic(input: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(input);
}

