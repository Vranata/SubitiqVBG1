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
