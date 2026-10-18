import { z } from "zod";

export const KNOWN_PLACEHOLDER_PATTERNS = [
  /replace_with/i,
  /lumigift_dev_password/i,
  /your[_-]/i,
  /changeme/i,
  /change[_-]me/i,
  /dummy/i,
  /placeholder/i,
  /example/i,
  /secret[_-]?key[_-]?here/i,
  /<[^>]+>/, // e.g. <NEW_SECRET_KEY>, <INSERT_KEY>
  /TODO/i,
  /password123/i,
  /^1234567890/i,
];

export function isPlaceholderValue(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  return KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const secretField = (minLength = 32, fieldName = "Secret") =>
  z
    .string()
    .min(minLength, `${fieldName} must be at least ${minLength} characters long`)
    .refine(
      (val) => {
        // Enforce no placeholder values in production
        if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
          return !isPlaceholderValue(val);
        }
        return true;
      },
      {
        message: `${fieldName} contains an insecure placeholder or default value not permitted in production`,
      }
    );

const envSchema = z
  .object({
    // App
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().default("Lumigift"),

    // Auth
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: secretField(32, "NEXTAUTH_SECRET"),
    NEXTAUTH_SECRET_PREVIOUS: z
      .string()
      .min(32)
      .optional()
      .refine(
        (val) => {
          if (val && (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true")) {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "NEXTAUTH_SECRET_PREVIOUS contains an insecure placeholder" }
      ),
    NEXTAUTH_ROTATION_GRACE_HOURS: z.coerce.number().int().positive().default(24),
    CSRF_SECRET: secretField(32, "CSRF_SECRET"),

    // Database
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            if (isPlaceholderValue(val)) return false;
            if (val.includes("lumigift_dev_password")) return false;
          }
          return true;
        },
        { message: "DATABASE_URL contains default/placeholder credentials not permitted in production" }
      ),
    DB_POOL_MIN: z.coerce.number().int().positive().default(2),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    // Stellar
    STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
    STELLAR_HORIZON_URL: z.string().url(),
    STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
    STELLAR_ESCROW_CONTRACT_ID: z.string().min(1),
    STELLAR_SERVER_SECRET_KEY: z
      .string()
      .regex(/^S[A-Z0-9]{55}$/, "STELLAR_SERVER_SECRET_KEY must be a valid Stellar secret key (S + 55 chars)")
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "STELLAR_SERVER_SECRET_KEY contains placeholder characters" }
      ),
    STELLAR_RPC_URL: z.string().url(),
    STELLAR_SERVER_PUBLIC_KEY: z.string().regex(/^G[A-Z0-9]{55}$/, "STELLAR_SERVER_PUBLIC_KEY must be a valid Stellar public key (G + 55 chars)"),

    // USDC
    USDC_ISSUER: z.string().regex(/^G[A-Z0-9]{55}$/),
    USDC_ASSET_CODE: z.string().default("USDC"),

    // Payments
    PAYSTACK_SECRET_KEY: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            if (isPlaceholderValue(val)) return false;
            // On mainnet in production, reject test keys
            if (process.env.STELLAR_NETWORK === "mainnet" && val.startsWith("sk_test_")) {
              return false;
            }
          }
          return true;
        },
        { message: "PAYSTACK_SECRET_KEY is invalid or uses a test/placeholder key in production" }
      ),
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().min(1),
    STRIPE_SECRET_KEY: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            if (isPlaceholderValue(val)) return false;
            // On mainnet in production, reject test keys
            if (process.env.STELLAR_NETWORK === "mainnet" && val.startsWith("sk_test_")) {
              return false;
            }
          }
          return true;
        },
        { message: "STRIPE_SECRET_KEY is invalid or uses a test/placeholder key in production" }
      ),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "STRIPE_WEBHOOK_SECRET contains an insecure placeholder" }
      ),

    // SMS
    TERMII_API_KEY: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "TERMII_API_KEY contains an insecure placeholder" }
      ),
    TERMII_SENDER_ID: z.string().max(11).default("Lumigift"),

    // Cron
    CRON_SECRET: secretField(32, "CRON_SECRET"),

    // Redis
    REDIS_URL: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "REDIS_URL contains an insecure placeholder" }
      ),

    // Gift Limits
    GIFT_MIN_AMOUNT_NGN: z.coerce.number().int().positive().default(500),
    GIFT_MAX_AMOUNT_NGN: z.coerce.number().int().positive().default(500000),
    GIFT_DAILY_LIMIT_NGN: z.coerce.number().int().positive().default(1000000),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z
      .string()
      .min(1)
      .refine(
        (val) => {
          if (process.env.NODE_ENV === "production" || process.env.STRICT_SECRET_VALIDATION === "true") {
            return !isPlaceholderValue(val);
          }
          return true;
        },
        { message: "CLOUDINARY_API_SECRET contains an insecure placeholder" }
      ),

    // Stellar webhook shared secret (for HMAC-SHA256 signature verification)
    // Used by POST /api/v1/webhooks/stellar
    STELLAR_WEBHOOK_SECRET: z.string().min(32).optional(),
  });

export type Env = z.infer<typeof envSchema>;

export { envSchema };

let validatedEnv: Env | null = null;

export function validateEnv(customEnv?: Record<string, string | undefined>): Env {
  if (validatedEnv && !customEnv) {
    return validatedEnv;
  }

  const envSource = customEnv ?? process.env;
  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const missingVars: string[] = [];
    const invalidVars: string[] = [];

    result.error.issues.forEach((issue) => {
      const path = issue.path.join(".");
      if (issue.code === "invalid_type" && "received" in issue && issue.received === "undefined") {
        missingVars.push(path);
      } else {
        invalidVars.push(`${path}: ${issue.message}`);
      }
    });

    let errorMessage = "Environment variable validation failed:\n";

    if (missingVars.length > 0) {
      errorMessage += `\nMissing required variables:\n${missingVars.map((v) => `  - ${v}`).join("\n")}`;
    }

    if (invalidVars.length > 0) {
      errorMessage += `\n\nInvalid variables:\n${invalidVars.map((v) => `  - ${v}`).join("\n")}`;
    }

    errorMessage +=
      "\n\nPlease ensure all required secrets are securely provisioned from your managed secret store and contain no placeholders.";

    if (customEnv) {
      throw new Error(errorMessage);
    }

    console.error(errorMessage);

    // Never hard-crash during:
    //   1. next build  — NEXT_PHASE is set to "phase-production-build" in the
    //      main process; workers inherit it.
    //   2. Tests        — NODE_ENV === "test"
    //   3. Development  — NODE_ENV === "development"
    //
    // In all those cases return a Proxy stub so modules can be imported without
    // throwing.  At *runtime* (NODE_ENV === "production", outside of build) we
    // exit immediately to prevent the app from starting with missing secrets.
    const isBuild =
      process.env.NEXT_PHASE === "phase-production-build" ||
      // Turbopack workers may not have NEXT_PHASE; fall back to the
      // NEXT_PHASE_BUILD_ID that Next.js also sets during static generation.
      process.env.NEXT_BUILD_ID !== undefined;
    const isNonProduction = process.env.NODE_ENV !== "production";

    if (isBuild || isNonProduction) {
      // Return a stub with empty strings so destructuring doesn't throw
      return new Proxy({} as Env, { get: () => "" });
    }
    process.exit(1);
  }

  if (!customEnv) {
    validatedEnv = result.data;
  }
  return result.data;
}

export const env = validateEnv();

