/// <reference path="./types.d.ts" />

import nodemailer from 'npm:nodemailer';
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
  requestId?: number;
  applicantAuthId?: string;
};

const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'culturobg@gmail.com';
const smtpUser = Deno.env.get('SMTP_USER');
const smtpAppPassword = Deno.env.get('SMTP_APP_PASSWORD');
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://pojinfknlfocjttxirpb.supabase.co';

const smtpTransport = smtpUser && smtpAppPassword
  ? nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpAppPassword,
    },
  })
  : null;

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

const buildEmailHtml = (payload: {
  applicantName: string;
  applicantEmail: string;
  specialtyCategory: string;
  applicantType: string;
  companyIdentifier: string;
  reason: string;
  submittedByEmail: string;
  submittedByRole: string;
  requestId: number;
  applicantAuthId: string;
}) => {
  const approveUrl = `${supabaseUrl}/functions/v1/handle-upgrade-action?action=approve&request_id=${payload.requestId}&auth_user_id=${payload.applicantAuthId}`;
  const rejectUrl = `${supabaseUrl}/functions/v1/handle-upgrade-action?action=reject&request_id=${payload.requestId}&auth_user_id=${payload.applicantAuthId}`;

  return `
  <h2>Нова заявка за Special User</h2>
  <p><strong>Име:</strong> ${escapeHtml(payload.applicantName)}</p>
  <p><strong>Имейл:</strong> ${escapeHtml(payload.applicantEmail)}</p>
  <p><strong>Категория:</strong> ${escapeHtml(payload.specialtyCategory)}</p>
  <p><strong>Тип:</strong> ${escapeHtml(payload.applicantType)}</p>
  <p><strong>EIK/INDDS:</strong> ${escapeHtml(payload.companyIdentifier)}</p>
  <p><strong>Мотивация:</strong></p>
  <p>${escapeHtml(payload.reason).replaceAll('\n', '<br />')}</p>
  <hr />
  <p><strong>Подал от:</strong> ${escapeHtml(payload.submittedByEmail)}</p>
  <p><strong>Роля:</strong> ${escapeHtml(payload.submittedByRole)}</p>
  <br />
  <div style="display: flex; gap: 10px; margin-top: 20px;">
    <a href="${approveUrl}" style="background-color: #28a745; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Одобри</a>
    &nbsp;&nbsp;&nbsp;
    <a href="${rejectUrl}" style="background-color: #dc3545; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Отхвърли</a>
  </div>
`;
};

const buildEmailText = (payload: {
  applicantName: string;
  applicantEmail: string;
  specialtyCategory: string;
  applicantType: string;
  companyIdentifier: string;
  reason: string;
  submittedByEmail: string;
  submittedByRole: string;
}) => [
  'Нова заявка за Special User',
  `Име: ${payload.applicantName}`,
  `Имейл: ${payload.applicantEmail}`,
  `Категория: ${payload.specialtyCategory}`,
  `Тип: ${payload.applicantType}`,
  `EIK/INDDS: ${payload.companyIdentifier}`,
  'Мотивация:',
  payload.reason,
  '---',
  `Подал от: ${payload.submittedByEmail}`,
  `Роля: ${payload.submittedByRole}`,
].join('\n');

Deno.serve(async (request: Request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!smtpTransport) {
      return jsonResponse(500, {
        error: 'Missing SMTP configuration. Set SMTP_USER and SMTP_APP_PASSWORD in Supabase secrets.',
      });
    }

    const payload = (await request.json()) as UpgradeRequestBody;
    const applicantName = payload.applicantName?.trim() || 'Потребител';
    const applicantEmail = payload.applicantEmail?.trim() || '';
    const specialtyCategory = payload.specialtyCategory?.trim() || 'Неизбрана категория';
    const applicantType = payload.applicantType === 'company' ? 'Фирма' : 'Лице';
    const companyIdentifier = payload.applicantType === 'company' ? payload.companyIdentifier?.trim() || '-' : '-';
    const reason = payload.reason?.trim() || '-';
    const submittedByEmail = payload.submittedByEmail?.trim() || '-';
    const submittedByRole = payload.submittedByRole?.trim() || '-';
    const requestId = payload.requestId || 0;
    const applicantAuthId = payload.applicantAuthId || '';

    await smtpTransport.sendMail({
      from: `CULTURO BG <${smtpUser}>`,
      to: adminEmail,
      replyTo: applicantEmail || undefined,
      subject: `Заявка за Special User: ${applicantName}`,
      text: buildEmailText({
        applicantName,
        applicantEmail,
        specialtyCategory,
        applicantType,
        companyIdentifier,
        reason,
        submittedByEmail,
        submittedByRole,
      }),
      html: buildEmailHtml({
        applicantName,
        applicantEmail,
        specialtyCategory,
        applicantType,
        companyIdentifier,
        reason,
        submittedByEmail,
        submittedByRole,
        requestId,
        applicantAuthId,
      }),
    });

    return jsonResponse(200, { ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, {
      error: 'Unexpected error while sending upgrade request email.',
      details,
    });
  }
});
