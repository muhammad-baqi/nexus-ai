import { z } from "zod";

export const recordRecentSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export type RecordRecentSearchInput = z.infer<typeof recordRecentSearchSchema>;
