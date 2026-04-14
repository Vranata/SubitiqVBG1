import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// HTML entity encoded Bulgarian strings (encoding-safe for any runtime)
const TEXTS = {
  // Успешно
  success: '&#1059;&#1089;&#1087;&#1077;&#1096;&#1085;&#1086;',
  // Грешка
  error: '&#1043;&#1088;&#1077;&#1096;&#1082;&#1072;',
  // Можете да затворите този прозорец.
  closeWindow: '&#1052;&#1086;&#1078;&#1077;&#1090;&#1077; &#1076;&#1072; &#1079;&#1072;&#1090;&#1074;&#1086;&#1088;&#1080;&#1090;&#1077; &#1090;&#1086;&#1079;&#1080; &#1087;&#1088;&#1086;&#1079;&#1086;&#1088;&#1077;&#1094;.',
  // Липсват задължителни параметри (action, request_id или auth_user_id).
  missingParams: '&#1051;&#1080;&#1087;&#1089;&#1074;&#1072;&#1090; &#1079;&#1072;&#1076;&#1098;&#1083;&#1078;&#1080;&#1090;&#1077;&#1083;&#1085;&#1080; &#1087;&#1072;&#1088;&#1072;&#1084;&#1077;&#1090;&#1088;&#1080; (action, request_id &#1080;&#1083;&#1080; auth_user_id).',
  // Невалидно действие. Използвайте approve или reject.
  invalidAction: '&#1053;&#1077;&#1074;&#1072;&#1083;&#1080;&#1076;&#1085;&#1086; &#1076;&#1077;&#1081;&#1089;&#1090;&#1074;&#1080;&#1077;. &#1048;&#1079;&#1087;&#1086;&#1083;&#1079;&#1074;&#1072;&#1081;&#1090;&#1077; approve &#1080;&#1083;&#1080; reject.',
  // Не може да бъде намерена заявката. Възможно е да е била изтрита.
  notFound: '&#1053;&#1077; &#1084;&#1086;&#1078;&#1077; &#1076;&#1072; &#1073;&#1098;&#1076;&#1077; &#1085;&#1072;&#1084;&#1077;&#1088;&#1077;&#1085;&#1072; &#1079;&#1072;&#1103;&#1074;&#1082;&#1072;&#1090;&#1072;. &#1042;&#1098;&#1079;&#1084;&#1086;&#1078;&#1085;&#1086; &#1077; &#1076;&#1072; &#1077; &#1073;&#1080;&#1083;&#1072; &#1080;&#1079;&#1090;&#1088;&#1080;&#1090;&#1072;.',
  // Тази заявка вече е обработена
  alreadyProcessed: '&#1058;&#1072;&#1079;&#1080; &#1079;&#1072;&#1103;&#1074;&#1082;&#1072; &#1074;&#1077;&#1095;&#1077; &#1077; &#1086;&#1073;&#1088;&#1072;&#1073;&#1086;&#1090;&#1077;&#1085;&#1072;',
  // текущ статус
  currentStatus: '&#1090;&#1077;&#1082;&#1091;&#1097; &#1089;&#1090;&#1072;&#1090;&#1091;&#1089;',
  // Грешка при обновяване на ролята
  upgradeError: '&#1043;&#1088;&#1077;&#1096;&#1082;&#1072; &#1087;&#1088;&#1080; &#1086;&#1073;&#1085;&#1086;&#1074;&#1103;&#1074;&#1072;&#1085;&#1077; &#1085;&#1072; &#1088;&#1086;&#1083;&#1103;&#1090;&#1072;',
  // Грешка при промяна на статуса
  statusError: '&#1043;&#1088;&#1077;&#1096;&#1082;&#1072; &#1087;&#1088;&#1080; &#1087;&#1088;&#1086;&#1084;&#1103;&#1085;&#1072; &#1085;&#1072; &#1089;&#1090;&#1072;&#1090;&#1091;&#1089;&#1072;',
  // Потребителят е успешно повишен до Special User! Статусът на заявката е обновен.
  approved: '&#1055;&#1086;&#1090;&#1088;&#1077;&#1073;&#1080;&#1090;&#1077;&#1083;&#1103;&#1090; &#1077; &#1091;&#1089;&#1087;&#1077;&#1096;&#1085;&#1086; &#1087;&#1086;&#1074;&#1080;&#1096;&#1077;&#1085; &#1076;&#1086; Special User! &#1057;&#1090;&#1072;&#1090;&#1091;&#1089;&#1098;&#1090; &#1085;&#1072; &#1079;&#1072;&#1103;&#1074;&#1082;&#1072;&#1090;&#1072; &#1077; &#1086;&#1073;&#1085;&#1086;&#1074;&#1077;&#1085;.',
  // Заявката е отхвърлена успешно.
  rejected: '&#1047;&#1072;&#1103;&#1074;&#1082;&#1072;&#1090;&#1072; &#1077; &#1086;&#1090;&#1093;&#1074;&#1098;&#1088;&#1083;&#1077;&#1085;&#1072; &#1091;&#1089;&#1087;&#1077;&#1096;&#1085;&#1086;.',
  // Неочаквана грешка
  unexpected: '&#1053;&#1077;&#1086;&#1095;&#1072;&#1082;&#1074;&#1072;&#1085;&#1072; &#1075;&#1088;&#1077;&#1096;&#1082;&#1072;',
};

const htmlResponse = (msg: string, isError = false) => {
  const color = isError ? '#dc3545' : '#28a745';
  const title = isError ? TEXTS.error : TEXTS.success;
  const html = `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CULTURO BG Administration</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background-color:#f8f9fa}
.card{background:#fff;padding:30px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,.1);text-align:center;max-width:500px}
h1{color:${color};margin-top:0}
p{color:#555}
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
<p>${msg}</p>
<p style="margin-top:30px;font-size:12px;color:#aaa">${TEXTS.closeWindow}</p>
</div>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const requestId = url.searchParams.get('request_id');
    const authUserId = url.searchParams.get('auth_user_id');

    if (!action || !requestId || !authUserId) {
      return htmlResponse(TEXTS.missingParams, true);
    }

    if (action !== 'approve' && action !== 'reject') {
      return htmlResponse(TEXTS.invalidAction, true);
    }

    const { data: requestRow, error: fetchError } = await supabase
      .from('user_upgrade_requests')
      .select('status')
      .eq('id_request', requestId)
      .single();

    if (fetchError || !requestRow) {
      return htmlResponse(TEXTS.notFound, true);
    }

    if (requestRow.status !== 'pending') {
      return htmlResponse(`${TEXTS.alreadyProcessed} (${TEXTS.currentStatus}: ${requestRow.status}).`, true);
    }

    if (action === 'approve') {
      const { error: upgradeError } = await supabase
        .from('users')
        .update({ id_category: 2 })
        .eq('auth_user_id', authUserId);

      if (upgradeError) {
        return htmlResponse(`${TEXTS.upgradeError}: ${upgradeError.message}`, true);
      }
    }

    const { error: statusError } = await supabase
      .from('user_upgrade_requests')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id_request', requestId);

    if (statusError) {
      return htmlResponse(`${TEXTS.statusError}: ${statusError.message}`, true);
    }

    return htmlResponse(action === 'approve' ? TEXTS.approved : TEXTS.rejected);

  } catch (error) {
    return htmlResponse(`${TEXTS.unexpected}: ${error instanceof Error ? error.message : String(error)}`, true);
  }
});
