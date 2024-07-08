import * as z from "zod";

export const MessageValidation = z.object({
  message: z.string().min(3, { message: "Minimum 3 characters." }),
  accountId: z.string(),
});

export const CommentValidation = z.object({
  message: z.string().min(3, { message: "Minimum 3 characters." }),
});
