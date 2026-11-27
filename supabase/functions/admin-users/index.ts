// WADI ERP - admin user management (Super Admin / users.manage only)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

    // identify caller
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthenticated" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: me } = await admin.from("profiles").select("role, permissions, is_active").eq("id", user.id).is("deleted_at", null).single();
    if (!me || !me.is_active) return json({ error: "forbidden" }, 403);
    let allowed = me.role === "super_admin" || me.permissions?.["users.manage"] === true;
    if (!allowed) {
      const { data: rp } = await admin.from("role_permissions").select("perms").eq("role", me.role).single();
      allowed = rp?.perms?.["users.manage"] === true;
    }
    if (!allowed) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const action = body.action;

    if (action === "create_user") {
      const { email, password, full_name, role, permissions, phone } = body;
      if (!email || !password || !full_name || !role) return json({ error: "missing fields" }, 400);
      if (role === "super_admin" && me.role !== "super_admin") return json({ error: "only super_admin can create super_admin" }, 403);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      });
      if (error) return json({ error: error.message }, 400);
      const { error: pErr } = await admin.from("profiles").insert({
        id: created.user.id, full_name, role, permissions: permissions ?? {}, phone: phone ?? null, created_by: user.id,
      });
      if (pErr) return json({ error: pErr.message }, 400);
      await admin.from("audit_log").insert({ user_id: user.id, action: "create_user", table_name: "profiles", record_id: created.user.id, new_data: { email, full_name, role } });
      return json({ ok: true, id: created.user.id });
    }

    if (action === "list_users") {
      const { data, error } = await admin.from("profiles").select("id, full_name, phone, role, permissions, is_active, created_at").is("deleted_at", null).order("created_at");
      if (error) return json({ error: error.message }, 400);
      const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const emails = Object.fromEntries((authUsers?.users ?? []).map((u: any) => [u.id, u.email]));
      return json({ users: (data ?? []).map((p: any) => ({ ...p, email: emails[p.id] ?? null })) });
    }

    if (action === "update_user") {
      const { id, role, permissions, is_active, full_name, phone } = body;
      if (!id) return json({ error: "missing id" }, 400);
      if (role === "super_admin" && me.role !== "super_admin") return json({ error: "only super_admin can grant super_admin" }, 403);
      const patch: any = {};
      if (role !== undefined) patch.role = role;
      if (permissions !== undefined) patch.permissions = permissions;
      if (is_active !== undefined) patch.is_active = is_active;
      if (full_name !== undefined) patch.full_name = full_name;
      if (phone !== undefined) patch.phone = phone;
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      await admin.from("audit_log").insert({ user_id: user.id, action: "update_user", table_name: "profiles", record_id: id, new_data: patch });
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const { id, password } = body;
      if (!id || !password) return json({ error: "missing fields" }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("audit_log").insert({ user_id: user.id, action: "reset_password", table_name: "profiles", record_id: id });
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
