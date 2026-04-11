/// <reference path="./types.d.ts" />

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

type UpgradeRequestBody = {
  applicantName?: string;
  applicantEmail?: string;
  specialtyCategory?: string;
  specialtyCategoryId?: number;
  applicantType?: 'person' | 'company';
  companyIdentifier?: string | null;
  reason?: string;
  submittedByEmail?: string;
  submittedByRole?: string;
};

const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'culturobg@gmail.com';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, { error: 'Missing Supabase environment variables.' });
  }

  if (!serviceRoleKey) {
    return jsonResponse(500, {
      error: 'Missing service role key. Set SERVICE_ROLE_KEY in Supabase secrets.',
    });
  }

  const authHeader = request.headers.get('Authorization');
  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await userSupabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const payload = (await request.json()) as UpgradeRequestBody;
  const applicantName = payload.applicantName?.trim() || user.user_metadata?.full_name || user.email || 'Потребител';
  const applicantEmail = payload.applicantEmail?.trim() || user.email || '';
  const specialtyCategory = payload.specialtyCategory?.trim() || 'Неизбрана категория';
  const applicantType = payload.applicantType === 'company' ? 'Фирма' : 'Лице';
  const companyIdentifier = payload.applicantType === 'company' ? payload.companyIdentifier?.trim() || '-' : '-';
  const reason = payload.reason?.trim() || '-';
  const submittedByEmail = payload.submittedByEmail?.trim() || user.email || '-';
  const submittedByRole = payload.submittedByRole?.trim() || '-';

  const inviteMetadata = {
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    specialty_category: specialtyCategory,
    specialty_category_id: String(payload.specialtyCategoryId ?? ''),
    applicant_type: applicantType,
    company_identifier: companyIdentifier,
    reason,
    submitted_by_email: submittedByEmail,
    submitted_by_role: submittedByRole,
  };

  const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(adminEmail, {
    data: inviteMetadata,
    redirectTo: request.headers.get('origin') ? `${request.headers.get('origin')}/login` : undefined,
  });

  if (inviteError) {
    return jsonResponse(502, {
      error: 'Failed to send upgrade request email.',
      details: inviteError.message,
    });
  }

  return jsonResponse(200, { ok: true });
});
