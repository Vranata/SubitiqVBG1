import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FRONTEND_URL = 'https://frontend-culturo-bg.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const TEXTS = {
  success: 'Успешно',
  error: 'Грешка',
  missingParams: 'Липсват задължителни параметри.',
  notFound: 'Заявката не бе намерена.',
  alreadyProcessed: 'Тази заявка Вече е била обработена.',
  dbError: 'Възникна техническа грешка при запис в базата.',
};

function redirectResponse(type: 'success' | 'error' | 'info' | 'warning', text: string, debug?: string) {
  const url = new URL(`${FRONTEND_URL}/admin-message`);
  url.searchParams.set('type', type);
  url.searchParams.set('text', text);
  if (debug) url.searchParams.set('debug', debug);
  
  return new Response(null, {
    status: 302,
    headers: { 'Location': url.toString() },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const requestId = url.searchParams.get('request_id');
    const authUserId = url.searchParams.get('auth_user_id');

    if (!action || !requestId || !authUserId) {
      return redirectResponse('error', TEXTS.missingParams);
    }

    // 1. Fetch request details
    const { data: requestRow, error: fetchError } = await supabase
      .from('user_upgrade_requests')
      .select('*')
      .eq('id_request', requestId)
      .single();

    if (fetchError || !requestRow) {
      return redirectResponse('error', TEXTS.notFound);
    }

    if (requestRow.status !== 'pending' && action !== 'reject') {
      return redirectResponse('info', `${TEXTS.alreadyProcessed} (${requestRow.status})`, `User: ${authUserId}`);
    }

    if (action === 'approve') {
       // Agressive Upsert: Try to identify by auth_user_id and ensure role is 2
       const { error: upgradeError } = await supabase
        .from('users')
        .upsert({
          auth_user_id: authUserId,
          email: requestRow.applicant_email,
          name_user: requestRow.applicant_name,
          id_category: 2, // Special_user
          id_region: 0,
          password_hash: 'managed_by_auth',
          profile_onboarding_completed: true
        }, { onConflict: 'auth_user_id' });

      if (upgradeError) {
        return redirectResponse('error', `${TEXTS.dbError}: ${upgradeError.message}`);
      }
    }

    // Update request status
    await supabase
      .from('user_upgrade_requests')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id_request', requestId);

    const successMsg = action === 'approve' 
      ? `Потребителят ${requestRow.applicant_email} е одобрен!` 
      : 'Заявката е отхвърлена.';
      
    return redirectResponse('success', successMsg, `ID: ${authUserId} | Email: ${requestRow.applicant_email}`);

  } catch (err: any) {
    return redirectResponse('error', err.message || String(err));
  }
});
