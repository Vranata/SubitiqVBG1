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
  missingParams: 'Липсват задължителни параметри (action, requestId или userId).',
  invalidAction: 'Невалидно действие. Използвайте approve или reject.',
  notFound: 'Заявката не бе намерена в базата данни.',
  alreadyProcessed: 'Тази заявка вече е била обработена.',
  approved: 'Потребителят бе успешно повишен в Special User!',
  rejected: 'Заявката бе успешно отхвърлена.',
  dbError: 'Възникна техническа грешка при обновяване на базата данни.',
};

function redirectResponse(type: 'success' | 'error' | 'info' | 'warning', text: string) {
  const url = new URL(`${FRONTEND_URL}/admin-message`);
  url.searchParams.set('type', type);
  url.searchParams.set('text', text);
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': url.toString(),
    },
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

    if (action !== 'approve' && action !== 'reject') {
      return redirectResponse('error', TEXTS.invalidAction);
    }

    // 1. Fetch request details
    const { data: requestRow, error: fetchError } = await supabase
      .from('user_upgrade_requests')
      .select('*')
      .eq('id_request', requestId)
      .single();

    if (fetchError || !requestRow) {
      console.error('Fetch request error:', fetchError);
      return redirectResponse('error', TEXTS.notFound);
    }

    if (requestRow.status !== 'pending') {
      return redirectResponse('info', `${TEXTS.alreadyProcessed} (${requestRow.status})`);
    }

    // 2. Perform action
    if (action === 'approve') {
      console.log(`Approving user ${authUserId}...`);
      
      // We use UPSERT to handle cases where the user record might be missing in public.users
      // but exists in auth.users. This ensures the user row is present and correct.
      const { error: upgradeError } = await supabase
        .from('users')
        .upsert({
          auth_user_id: authUserId,
          email: requestRow.applicant_email,
          name_user: requestRow.applicant_name,
          id_category: 2, // Special User
          id_region: 0,   // Default region if missing
          password_hash: 'supabase_auth_managed_placeholder',
          profile_onboarding_completed: true
        }, { onConflict: 'auth_user_id' });

      if (upgradeError) {
        console.error('Upgrade error:', upgradeError);
        return redirectResponse('error', `${TEXTS.dbError} (${upgradeError.message})`);
      }
    }

    // 3. Update request status
    const { error: updateError } = await supabase
      .from('user_upgrade_requests')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id_request', requestId);

    if (updateError) {
      console.error('Update request status error:', updateError);
      return redirectResponse('error', `${TEXTS.dbError} (${updateError.message})`);
    }

    return redirectResponse('success', action === 'approve' ? TEXTS.approved : TEXTS.rejected);

  } catch (err: any) {
    console.error('Unexpected error:', err);
    return redirectResponse('error', err.message || String(err));
  }
});
