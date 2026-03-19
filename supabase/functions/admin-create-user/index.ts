import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_BASE_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const ALLOWED_ORIGINS = (() => {
  // Ordem de fallback para compatibilidade entre ambientes.
  const envValue =
    Deno.env.get("CORS_ALLOWED_ORIGINS")
    ?? Deno.env.get("CORS_ALLOWLIST")
    ?? Deno.env.get("ALLOWED_ORIGINS")
    ?? "";

  const configured = envValue
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  const source = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
  return new Set(source);
})();

function normalizeOrigin(origin: string | null | undefined): string | null {
  const raw = String(origin ?? "").trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...CORS_BASE_HEADERS,
    "Vary": "Origin",
  };

  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // chamadas sem Origin (server-to-server)
  return ALLOWED_ORIGINS.has(origin);
}

function json(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function mapCreateUserErrorMessage(error: unknown): string {
  const raw = String((error as { message?: unknown })?.message ?? "");
  const message = raw.toLowerCase();

  if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
    return "Ja existe usuario com este email";
  }

  if (message.includes("password")) {
    return "Senha invalida para criacao de usuario";
  }

  return "Falha ao criar usuario";
}

Deno.serve(async (req) => {
  const requestOrigin = normalizeOrigin(req.headers.get("Origin"));
  const originAllowed = isOriginAllowed(requestOrigin);
  const corsHeaders = buildCorsHeaders(originAllowed ? requestOrigin : null);

  if (!originAllowed) {
    if (req.method === "OPTIONS") {
      return new Response("Origem nao permitida", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Vary": "Origin" },
      });
    }
    return json(403, { error: "Origem nao permitida" }, { "Vary": "Origin" });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Metodo nao permitido" }, corsHeaders);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, { error: "Configuracao ausente no ambiente" }, corsHeaders);
  }

  const token = getBearerToken(req);
  if (!token) return json(401, { error: "Token ausente" }, corsHeaders);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return json(401, { error: "Token invalido ou expirado" }, corsHeaders);
  }

  const callerRole = normalizeRole(callerData.user.app_metadata?.role);
  if (callerRole !== "admin") {
    return json(403, { error: "Apenas administradores podem criar usuarios" }, corsHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Payload invalido" }, corsHeaders);
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const nome = body?.nome ? String(body.nome).trim() || null : null;
  const role = normalizeRole(body?.role ?? "vendedor");
  const franquia_id = body?.franquia_id ? String(body.franquia_id).trim() : "";
  const ativo = body?.ativo !== false;

  if (!email.includes("@")) return json(400, { error: "Email invalido" }, corsHeaders);
  if (password.length < 6) return json(400, { error: "Senha deve ter no minimo 6 caracteres" }, corsHeaders);
  if (!["admin", "gestor", "vendedor"].includes(role)) return json(400, { error: "Role invalido" }, corsHeaders);
  if (!franquia_id) return json(400, { error: "Franquia obrigatoria" }, corsHeaders);

  const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, franquia_id },
    user_metadata: { nome },
  });

  if (createError || !createdData?.user) {
    return json(400, { error: mapCreateUserErrorMessage(createError) }, corsHeaders);
  }

  const createdUser = createdData.user;

  return json(200, {
    user_id: createdUser.id,
    email: createdUser.email,
    email_confirmed_at: createdUser.email_confirmed_at,
    role,
    franquia_id,
    nome,
    ativo,
  }, corsHeaders);
});
