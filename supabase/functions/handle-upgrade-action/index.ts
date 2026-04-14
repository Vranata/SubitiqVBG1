import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const TEXTS = {
  success: 'Успешно',
  error: 'Грешка',
  closeWindow: 'Можете да затворите този прозорец.',
  missingParams: 'Липсват задължителни параметри.',
  invalidAction: 'Невалидно действие.',
  notFound: 'Заявката не е намерена.',
  alreadyProcessed: 'Вече обработена.',
  approved: 'Потребителят е Special User!',
  rejected: 'Заявката е отхвърлена.',
};

function renderBody(emoji: string, title: string, msg: string) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <title>CULTURO</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f3f4f6; color: #1f2937; }
    .card { background: white; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); text-align: center; max-width: 420px; width: 90%; }
    .emoji { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.875rem; font-weight: 700; }
    p { margin-top: 1.25rem; font-size: 1.125rem; color: #4b5563; line-height: 1.625; }
    .footer { margin-top: 2.5rem; font-size: 0.875rem; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${msg}</p>
    <div class="footer">${TEXTS.closeWindow}</div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const requestId = url.searchParams.get('request_id');
    const authUserId = url.searchParams.get('auth_user_id');

    let body = '';
    let status = 200;

    if (!action || !requestId || !authUserId) {
      body = renderBody('⚠️', TEXTS.error, TEXTS.missingParams);
      status = 400;
    } else if (action !== 'approve' && action !== 'reject') {
      body = renderBody('❌', TEXTS.error, TEXTS.invalidAction);
      status = 400;
    } else {
      const { data: requestRow, error: fetchError } = await supabase
        .from('user_upgrade_requests')
        .select('status')
        .eq('id_request', requestId)
        .single();

      if (fetchError || !requestRow) {
        body = renderBody('❓', TEXTS.error, TEXTS.notFound);
        status = 404;
      } else if (requestRow.status !== 'pending') {
        body = renderBody('ℹ️', TEXTS.success, `${TEXTS.alreadyProcessed} (${requestRow.status})`);
      } else {
        if (action === 'approve') {
          const { error: upgradeError } = await supabase
            .from('users')
            .update({ id_category: 2 })
            .eq('auth_user_id', authUserId);

          if (upgradeError) {
            body = renderBody('❌', TEXTS.error, upgradeError.message);
            status = 500;
          }
        }

        if (status === 200 && !body) {
          const { error: updateError } = await supabase
            .from('user_upgrade_requests')
            .update({ status: action === 'approve' ? 'approved' : 'rejected' })
            .eq('id_request', requestId);

          if (updateError) {
            body = renderBody('❌', TEXTS.error, updateError.message);
            status = 500;
          } else {
            body = renderBody('✅', TEXTS.success, action === 'approve' ? TEXTS.approved : TEXTS.rejected);
          }
        }
      }
    }

    return new Response(body, {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      }
    });

  } catch (err: any) {
    return new Response(renderBody('💥', TEXTS.error, err.message || String(err)), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
});
