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
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const fromEmail = Deno.env.get('UPGRADE_REQUEST_FROM_EMAIL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, { error: 'Missing Supabase environment variables.' });
  }

  if (!resendApiKey || !fromEmail) {
    return jsonResponse(500, {
      error: 'Missing mail provider configuration. Set RESEND_API_KEY and UPGRADE_REQUEST_FROM_EMAIL in Supabase secrets.',
    });
  }

  const authHeader = request.headers.get('Authorization');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

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

  const subject = `Upgrade request from ${applicantName}`;
  const html = `
    <h2>Заявка за Special User</h2>
    <p><strong>Име:</strong> ${escapeHtml(applicantName)}</p>
    <p><strong>Имейл:</strong> ${escapeHtml(applicantEmail)}</p>
    <p><strong>Категория:</strong> ${escapeHtml(specialtyCategory)}</p>
    <p><strong>Тип:</strong> ${escapeHtml(applicantType)}</p>
    <p><strong>EIK/INDDS:</strong> ${escapeHtml(companyIdentifier)}</p>
    <p><strong>Мотивация:</strong></p>
    <p>${escapeHtml(reason).replaceAll('\n', '<br />')}</p>
    <hr />
    <p><strong>Подал от:</strong> ${escapeHtml(submittedByEmail)}</p>
    <p><strong>Роля:</strong> ${escapeHtml(submittedByRole)}</p>
  `;

  const text = [
    'Заявка за Special User',
    '',
    `Име: ${applicantName}`,
    `Имейл: ${applicantEmail}`,
    `Категория: ${specialtyCategory}`,
    `Тип: ${applicantType}`,
    `EIK/INDDS: ${companyIdentifier}`,
    '',
    'Мотивация:',
    reason,
    '',
    `Подал от: ${submittedByEmail}`,
    `Роля: ${submittedByRole}`,
  ].join('\n');

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject,
      html,
      text,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse(502, {
      error: 'Failed to send upgrade request email.',
      details: errorText,
    });
  }

  return jsonResponse(200, { ok: true });
});
