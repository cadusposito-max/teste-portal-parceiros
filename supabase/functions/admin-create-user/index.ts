// Edge Function: admin-create-user
// Creates a new Auth user with app metadata after strict admin + aal2 checks.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ROLES = ['admin', 'gestor', 'vendedor'];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function logDenied(reason: string, context: Record<string, unknown>) {
  console.error(JSON.stringify({
    event: 'admin_action_denied',
    function: 'admin-create-user',
    reason,
    timestamp: new Date().toISOString(),
    ...context,
  }));
}

function logSuccess(context: Record<string, unknown>) {
  console.info(JSON.stringify({
    event: 'admin_action_success',
    function: 'admin-create-user',
    timestamp: new Date().toISOString(),
    ...context,
  }));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Metodo nao permitido.' }, 405);
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      logDenied('missing_token', {});
      return jsonResponse({ error: 'Nao autorizado.' }, 401);
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      logDenied('invalid_token', { error: userError?.message });
      return jsonResponse({ error: 'Token invalido ou expirado.' }, 401);
    }

    const role = (user.app_metadata as Record<string, string>)?.role;
    if (role !== 'admin') {
      logDenied('insufficient_role', { user_id: user.id, role });
      return jsonResponse({ error: 'Acesso negado: requer role admin.' }, 403);
    }

    const jwtPayload = decodeJwtPayload(token);
    const aal = jwtPayload?.aal as string | undefined;
    if (aal !== 'aal2') {
      logDenied('mfa_not_verified', { user_id: user.id, aal });
      return jsonResponse({ error: 'Acesso negado: autenticacao MFA (aal2) obrigatoria para esta acao.' }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Body invalido: JSON malformado.' }, 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const nome = body.nome != null ? String(body.nome).trim() || null : null;
    const targetRole = String(body.role || 'vendedor').toLowerCase();
    const franquiaId = body.franquia_id ? String(body.franquia_id).trim() || null : null;
    const ativo = body.ativo !== false;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'E-mail invalido.' }, 400);
    }
    if (!password || password.length < 6) {
      return jsonResponse({ error: 'Senha temporaria deve ter no minimo 6 caracteres.' }, 400);
    }
    if (!ALLOWED_ROLES.includes(targetRole)) {
      return jsonResponse({ error: `Role invalida: use ${ALLOWED_ROLES.join(', ')}.` }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: targetRole,
        franquia_id: franquiaId,
      },
    });

    if (createError) {
      console.error('[admin-create-user] createUser error:', createError);
      const msg = createError.message?.toLowerCase() || '';
      const clientMsg = msg.includes('already') || msg.includes('exists')
        ? 'Ja existe um usuario com este e-mail.'
        : 'Falha ao criar usuario no backend.';
      return jsonResponse({ error: clientMsg }, 422);
    }

    if (!newUser?.user?.id) {
      return jsonResponse({ error: 'Falha ao criar usuario: ID nao retornado.' }, 500);
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        nome,
        franquia_id: franquiaId,
        ativo,
      }, { onConflict: 'id' });

    if (profileError) {
      console.warn('[admin-create-user] profile sync warning:', profileError.message);
    }

    logSuccess({ created_user_id: newUser.user.id, created_by: user.id, target_role: targetRole });
    return jsonResponse({ user_id: newUser.user.id }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDenied('unhandled_error', { error: message });
    return jsonResponse({ error: 'Falha interna ao processar a operacao.' }, 500);
  }
});
