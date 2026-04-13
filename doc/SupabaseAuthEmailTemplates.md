# Supabase Auth Email Templates

Paste the values below into Supabase Dashboard -> Auth -> Email Templates.

## Reset Password

Subject
```text
Потвърждение за смяна на паролата
```

HTML body
```html
<h2>Желаете да смените паролата си?</h2>
<p>Ако не сте били вие, е добре да промените данните си за вход.</p>
<p><a href="{{ .ConfirmationURL }}">Промени паролата си</a></p>
<p>Ако не сте били вие, игнорирайте този имейл.</p>
```

Use this template with `resetPasswordForEmail()`.

## Change Email Address

Subject
```text
Потвърждение за смяна на имейла
```

HTML body
```html
<h2>Желаете да смените имейла си?</h2>
<p>Ако не сте били вие, е добре да промените данните си за вход.</p>
<p>Потвърдете промяната от текущия си имейл.</p>
<p><a href="{{ .ConfirmationURL }}">Потвърди смяната</a></p>
```

This is the template that should be sent to the current email when the user requests an email change.

If you also want a message for the new email address, use this copy in the optional notification template:

Subject
```text
Потвърждение за новия имейл
```

HTML body
```html
<h2>Получихме заявка за нов имейл</h2>
<p>Ако това сте вие, потвърдете новия имейл, за да завършите промяната.</p>
<p>Ако не сте били вие, променете данните си за вход.</p>
<p><a href="{{ .ConfirmationURL }}">Потвърди новия имейл</a></p>
```

Notes
- Keep Secure email change enabled if you want the standard confirm-current-email flow.
- When you use redirects, make sure the target URL is allowed in Supabase Auth settings.
- The app copy currently matches these templates:
	- `Изпрати потвърждение към текущия имейл`
	- `Изпрати линк за смяна на паролата`
	- `Ако не сте били вие, е добре да промените данните си за вход.`

## Upgrade Request Admin Email

This is sent by the edge function through Gmail SMTP directly to the admin inbox.

Subject
```text
Заявка за Special User: {{ applicant_name }}
```

HTML body
```html
<h2>Нова заявка за Special User</h2>
<p><strong>Име:</strong> {{ applicant_name }}</p>
<p><strong>Имейл:</strong> {{ applicant_email }}</p>
<p><strong>Категория:</strong> {{ specialty_category }}</p>
<p><strong>Тип:</strong> {{ applicant_type }}</p>
<p><strong>EIK/INDDS:</strong> {{ company_identifier }}</p>
<p><strong>Мотивация:</strong></p>
<p>{{ reason }}</p>
<hr />
<p><strong>Подал от:</strong> {{ submitted_by_email }}</p>
<p><strong>Роля:</strong> {{ submitted_by_role }}</p>
```

Notes
- Keep `SMTP_USER` and `SMTP_APP_PASSWORD` as Supabase secrets.
- The edge function sends the request straight to `culturobg@gmail.com` with Gmail SMTP, so it no longer creates a Supabase Auth user and no longer depends on invite flow collisions.
- If you want the subject or body copy changed later, update `supabase/functions/send-upgrade-request/index.ts` and keep this doc in sync.
