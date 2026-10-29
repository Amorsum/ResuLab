import { z } from 'zod';
export const resumeDocumentMetaSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120), kind: z.enum(['base', 'job', 'unclassified']), baseId: z.string().uuid().optional(), targetJob: z.string().max(200).optional() }).strict();
export type ResumeDocumentMeta = z.infer<typeof resumeDocumentMetaSchema>;
