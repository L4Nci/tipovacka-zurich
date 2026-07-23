# Supabase Auth and OAuth Setup

Supabase Auth is the only identity provider used by Tipovačka. Application
identity always remains `auth.users.id`; OAuth provider IDs and e-mail
addresses are not application primary keys.

## Supported sign-in methods

- E-mail and password are available when enabled in Supabase Auth.
- Google is shown only when `VITE_AUTH_GOOGLE_ENABLED=true`.
- Apple is shown only when `VITE_AUTH_APPLE_ENABLED=true`.
- Username-to-e-mail lookup is intentionally not exposed. Login uses the real
  e-mail address.

The frontend flags control visibility only. A provider must also be configured
and enabled in the verified Supabase project before its flag is enabled in a
deployment.

## Redirects

The frontend passes the exact current origin with a trailing slash as
`redirectTo`. Add only trusted origins to the Supabase Auth redirect allowlist:

- `http://localhost:3000/`
- `https://tipovacka-fotbal.netlify.app/`
- the canonical custom domain after it is selected

Do not add wildcard redirects that permit an attacker-controlled host. The
Supabase browser client handles the OAuth callback and session. The app does not
store or log OAuth provider access tokens.

## Google checklist

1. Create a Google OAuth web client.
2. Add the Supabase callback URL shown in the Supabase Google provider setup to
   Google authorized redirect URIs.
3. Store the Google client ID and secret only in Supabase provider
   configuration.
4. Add localhost and production app URLs to the Supabase redirect allowlist.
5. Verify first sign-in, profile creation, repeat sign-in, logout, and account
   identity before setting `VITE_AUTH_GOOGLE_ENABLED=true`.

## Apple checklist

1. Configure an Apple Services ID, Sign in with Apple key, team ID, and the
   Supabase callback URL.
2. Store the Apple private key and provider configuration only in Supabase.
3. Test relay e-mail accounts and the case where Apple does not return a name
   on later sign-ins.
4. Plan Apple web OAuth secret rotation at least every six months.
5. Verify first sign-in, profile creation, repeat sign-in, logout, and account
   identity before setting `VITE_AUTH_APPLE_ENABLED=true`.

The Apple button remains hidden while this external configuration is
incomplete.

## E-mail confirmation and recovery

Verify these production Supabase Auth settings before enabling Phase 009:

- Site URL is the canonical production origin.
- localhost, Netlify production, and the chosen custom domain are explicitly
  allowlisted.
- e-mail confirmation behavior is intentional.
- production SMTP delivery, sender identity, rate limits, and expired-link UX
  have been tested.

Registration supports either an immediate session or a confirmation-pending
user with no session. Password recovery uses `resetPasswordForEmail()` and
returns to the same trusted app origin.

## Migration rollout

`009_auth_profile_foundation.sql` was deployed separately to the production
project on 2026-07-23. It replaces only the new-user profile trigger and
inserted the one profile that was missing at deployment time. It did not update
any existing profile and always assigns the platform role `player` to a newly
created profile.

Recommended rollout:

1. Verify the target project and confirm migrations 007 and 008 are present.
2. Run `supabase/tests/009_auth_profile_foundation.sql` in a rollback-only
   transaction.
3. Apply only migration 009.
4. Verify profile counts, trigger definition, fixed `search_path`, and grants.
5. Configure and test e-mail redirects and providers.
6. Deploy the frontend with both OAuth flags disabled.
7. Enable one provider flag only after its end-to-end production smoke test.

If profile creation fails after rollout, disable new sign-ups/provider flags,
inspect the Auth trigger logs, and restore the last reviewed trigger definition.
Do not remove or rewrite existing profile rows as a rollback.

No OAuth client secret, Apple key, service-role key, or Supabase access token
belongs in the frontend bundle.

## Production configuration status

As verified on 2026-07-23:

- migration 009: deployed and rollback contract verified,
- e-mail/password provider: enabled,
- e-mail confirmation: enabled,
- Google provider: disabled and not acceptance-tested,
- Apple provider: disabled and not acceptance-tested,
- Google frontend flag: disabled,
- Apple frontend flag: disabled,
- Site URL and redirect allowlist: require owner verification in the Supabase
  dashboard,
- SMTP provider and delivery: not verifiable through the connected tooling,
- leaked-password protection: disabled,
- CAPTCHA: not enabled by this phase.

This distinguishes implemented code from externally configured and
acceptance-tested authentication methods.
