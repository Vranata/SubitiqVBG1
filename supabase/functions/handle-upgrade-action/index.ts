import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HTML entities for Bulgarian text to avoid any encoding issues
const TEXTS = {
  success: '&#1059;&#1089;&#1087;&#1077;&#1096;&#1085;&#1086;', // Успешно
  error: '&#1043;&#1088;&#1077;&#1096;&#1082;&#1072;', // Грешка
  closeWindow: '&#1052;&#1086;&#1078;&#1077;&#1090;&#1077; &#1076;&#1072; &#1079;&#1072;&#1090;&#1074;&#1086;&#1088;&#1080;&#1090;&#1077; &#1090;&#1086;&#1079;&#1080; &#1087;&#1088;&#1086;&#1079;&#1086;&#1088;&#1077;&#1094;.', // Можете да затворите този прозорец.
  missingParams: '&#1051;&#1080;&#1087;&#1089;&#1074;&#1072;&#1090; &#1079;&#1072;&#1076;&#1098;&#1083;&#1078;&#1080;&#1090;&#1077;&#1083;&#1085;&#1080; &#1087;&#1072;&#1088;&#1072;&#1084;&#1077;&#1090;&#1088;&#1080;.', // Липсват задължителни параметри.
  invalidAction: '&#1053;&#1077;&#1074;&#1072;&#1083;&#1080;&#1076;&#1085;&#1086; &#1076;&#1077;&#1081;&#1089;&#1090;&#1074;&#1080;&#1077;.', // Невалидно действие.
  notFound: '&#1047;&#1072;&#1103;&#1074;&#1082;&#1072;&#1090;&#1072; &#1085;&#1077; &#1077; &#1085;&#1072;&#1084;&#1077;&#1088;&#1077;&#1085;&#1072;.', // Заявката не е намерена.
  alreadyProcessed: '&#1042;&#1077;&#1095;&#1077; &#1086;&#1073;&#1088;&#1072;&#1073;&#1086;&#1090;&#1077;&#1085;&#1072;.', // Вече обработена.
  approved: '&#1055;&#1086;&#1090;&#1088;&#1077;&#1073;&#1080;&#1090;&#1077;&#1083;&#1103;&#1090; &#1077; Special User!', // Потребителят е Special User!
  rejected: '&#1047;&#1072;&#1103;&#1074;&#1082;&#1072;&#1090;&#1072; &#1077; &#1086;&#1090;&#1093;&#1074;&#1098;&#1088;&#1083;&#1077;&#1085;&#1072;.' // Заявката е отхвърлена.
};

function buildHtml(titleEmoji: string, title: string, message: string) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>CULTURO Administration</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f0f2f5; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); text-align: center; max-width: 400px; width: 90%; }
    .emoji { font-size: 3rem; margin-bottom: 1rem; }
    h1 { margin: 0; color: #1a1a1a; font-size: 1.5rem; }
    p { color: #4b5563; margin-top: 1rem; line-height: 1.5; }
    .footer { font-size: 0.8rem; color: #9ca3af; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${titleEmoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="footer">${TEXTS.closeWindow}</div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  // CORS check for pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const requestId = url.searchParams.get('request_id');
    const authUserId = url.searchParams.get('auth_user_id');

    if (!action || !requestId || !authUserId) {
      const html = buildHtml('⚠️', TEXTS.error, TEXTS.missingParams);
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    if (action !== 'approve' && action !== 'reject') {
      const html = buildHtml('❌', TEXTS.error, TEXTS.invalidAction);
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    // Check request
    const { data: requestRow, error: fetchError } = await supabase
      .from('user_upgrade_requests')
      .select('status')
      .eq('id_request', requestId)
      .single();

    if (fetchError || !requestRow) {
      const html = buildHtml('❓', TEXTS.error, TEXTS.notFound);
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    if (requestRow.status !== 'pending') {
      const html = buildHtml('ℹ️', TEXTS.success, `${TEXTS.alreadyProcessed} (${requestRow.status})`);
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    if (action === 'approve') {
      const { error: upgradeError } = await supabase
        .from('users')
        .update({ id_category: 2 })
        .eq('auth_user_id', authUserId);

      if (upgradeError) {
        const html = buildHtml('❌', TEXTS.error, upgradeError.message);
        return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
      }
    }

    // Update status
    await supabase
      .from('user_upgrade_requests')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id_request', requestId);

    const html = buildHtml('✅', TEXTS.success, action === 'approve' ? TEXTS.approved : TEXTS.rejected);
    return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });

  } catch (err: any) {
    const html = buildHtml('💥', TEXTS.error, err.message || String(err));
    return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' } });
  }
});
