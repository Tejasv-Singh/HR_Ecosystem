import { z } from "zod";
import { optionalCuid, requiredText } from "@/lib/validation/common";

export const departmentWriteSchema = z.object({
  name: requiredText(120),
  parentId: optionalCuid,
  leadId: optionalCuid,
});

export const departmentUpdateSchema = departmentWriteSchema.partial();

export type DepartmentWriteInput = z.infer<typeof departmentWriteSchema>;
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
