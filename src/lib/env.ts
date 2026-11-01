import { z } from "zod";

/**
 * Server-only environment. Parsed lazily so `next build` works without secrets present.
 * Never import this module from a client component.
 */
const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
    NEXTAUTH_URL: z.string().url().optional(),
    ALLOWED_EMAILS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    COGNITO_CLIENT_ID: z.string().optional().default(""),
    COGNITO_CLIENT_SECRET: z.string().optional().default(""),
    COGNITO_ISSUER: z.string().optional().default(""),
    AUTH_DEV_LOGIN: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    AUTH_DEV_PASSWORD: z.string().optional().default(""),
    AWS_REGION: z.string().default("us-east-1"),
    S3_ATTACHMENTS_BUCKET: z.string().optional().default(""),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().max(200).default(25),
  })
  .superRefine((env, ctx) => {
    const cognito = Boolean(env.COGNITO_CLIENT_ID && env.COGNITO_ISSUER);
    if (!cognito && !env.AUTH_DEV_LOGIN) {
      ctx.addIssue({ code: "custom", message: "Configure Cognito (COGNITO_*) or set AUTH_DEV_LOGIN=true for local use." });
    }
    if (cognito && env.AUTH_DEV_LOGIN) {
      ctx.addIssue({ code: "custom", message: "AUTH_DEV_LOGIN must be off when Cognito is configured." });
    }
    if (env.AUTH_DEV_LOGIN && env.AUTH_DEV_PASSWORD.length < 8) {
      ctx.addIssue({ code: "custom", message: "AUTH_DEV_PASSWORD must be at least 8 characters." });
    }
    if (env.ALLOWED_EMAILS.length === 0) {
      ctx.addIssue({ code: "custom", message: "ALLOWED_EMAILS must list at least one email." });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function cognitoEnabled(): boolean {
  const e = env();
  return Boolean(e.COGNITO_CLIENT_ID && e.COGNITO_ISSUER);
}
