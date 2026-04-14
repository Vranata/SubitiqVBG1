import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const htmlResponse = (message: string, isError = false) => {
  const color = isError ? '#dc3545' : '#28a745';
  const html = `
    <!DOCTYPE html>
    <html lang="bg">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CULTURO BG Administration</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f8f9fa; }
        .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
        h1 { color: ${color}; margin-top: 0; }
        p { color: #555; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${isError ? 'Грешка' : 'Успешно'}</h1>
        <p>${message}</p>
        <p style="margin-top: 30px; font-size: 12px; color: #aaa;">Можете да затворите този прозорец.</p>
      </div>
    </body>
    </html>
  `;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const requestId = url.searchParams.get('request_id');
    const authUserId = url.searchParams.get('auth_user_id');

    if (!action || !requestId || !authUserId) {
      return htmlResponse('Липсват задължителни параметри (action, request_id или auth_user_id).', true);
    }

    if (action !== 'approve' && action !== 'reject') {
      return htmlResponse('Невалидно действие. Използвайте approve или reject.', true);
    }

    // Checking if the request is still pending
    const { data: requestRow, error: fetchError } = await supabase
      .from('user_upgrade_requests')
      .select('status')
      .eq('id_request', requestId)
      .single();

    if (fetchError || !requestRow) {
      return htmlResponse('Не може да бъде намерена заявката. Възможно е да е била изтрита.', true);
    }

    if (requestRow.status !== 'pending') {
      return htmlResponse(`Тази заявка вече е обработена (текущ статус: ${requestRow.status}).`, true);
    }

    if (action === 'approve') {
      // 1. Update the user role to Special User (category 2)
      const { error: upgradeError } = await supabase
        .from('users')
        .update({ id_category: 2 })
        .eq('auth_user_id', authUserId);

      if (upgradeError) {
        return htmlResponse(`Грешка при обновяване на потребителската роля: ${upgradeError.message}`, true);
      }
    }

    // 2. Update the request status
    const { error: statusError } = await supabase
      .from('user_upgrade_requests')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id_request', requestId);

    if (statusError) {
      return htmlResponse(`Грешка при промяна на статуса на заявката: ${statusError.message}`, true);
    }

    return htmlResponse(action === 'approve' 
      ? 'Потребителят е успешно повишен до Special User! Статусът на заявката е обновен.' 
      : 'Заявката е отхвърлена успешно.');

  } catch (error) {
    return htmlResponse(`Неочаквана грешка: ${error instanceof Error ? error.message : String(error)}`, true);
  }
});
