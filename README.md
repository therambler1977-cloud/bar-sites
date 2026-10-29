# Bar Sites

Websites for local bars that owners can keep up to date in seconds. One codebase serves every bar, and each bar is picked by its domain.

## What owners get

- **A fast, phone-first website.** It shows today's specials and events up top, an upcoming events calendar, weekly specials, the menu with sold-out items marked, hours with "open now", and buttons to call, get directions, or order online.
- **Text-to-update.** The owner texts the bar's update number, for example "Fri 9pm The Rusty Nails, $5 cover", "every Tuesday $2 tacos 4-9", "out of wings", or "closed Thanksgiving". Claude turns the text into a preview, and nothing posts until the owner replies YES.
- **A simple admin** at `/admin`, built for phones. It has tabs for Today (with one tap to mark an item sold out), Events, Specials (weekly or one day only, can be paused), Menu, and Hours (regular hours plus holiday and one-off changes).
- **Google sync.** New events and specials are posted to the bar's Google Business Profile, and holiday hours update Google's special hours. The site also includes schema.org markup for hours and events.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the demo bar (The Rusty Anchor) and http://localhost:3000/admin for its admin. The demo password is `demo1234`.

Without Supabase settings, the app keeps its data in `.data/db.json`, which is created from sample data the first time it runs. Delete that file to reset the demo.

```bash
npm test          # unit tests: schedules, text-to-update flow, Google payloads, auth
npm run typecheck
npm run build
```

## Going live

1. **Database:** create a Supabase project, run `supabase/migrations/0001_init.sql`, and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Add a row to `bars` for each client, with the bar's domain(s) in `domains`. To make the `admin_password_hash` value, run `hashPassword()` from `src/lib/auth.ts`.
2. **Hosting:** deploy to Vercel (or any Node host), set `SESSION_SECRET`, and point each bar's domain at the deployment.
3. **Texting:** buy a Twilio number for each bar. Set its "A message comes in" webhook to `https://<bar domain>/api/sms` (HTTP POST), put that number in `bars.sms_number`, and list the owner's cell numbers in `owner_phones` in E.164 format (`+15551234567`). Set `TWILIO_AUTH_TOKEN` and `ANTHROPIC_API_KEY`. US numbers also need A2P 10DLC registration before texts are delivered reliably.
4. **Google:** create a Google Cloud OAuth app with Business Profile API access and the `business.manage` scope, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For each bar, store `{ "accountId", "locationId", "refreshToken" }` in `bars.google`. The in-app "Connect Google" button isn't built yet, so for now the refresh token has to be obtained by hand.

All settings are listed in `.env.example`.

## How it's built

| Piece | Where |
| --- | --- |
| Public site | `src/app/page.tsx` |
| Admin pages and form actions | `src/app/admin/` |
| Text-message webhook | `src/app/api/sms/route.ts`, `src/lib/sms.ts` |
| Reading owner texts with Claude | `src/lib/parse-text.ts` |
| Publishing changes (site and Google) | `src/lib/publish.ts`, `src/lib/google.ts` |
| Hours, specials, and event timing | `src/lib/schedule.ts` |
| Data (Supabase or local file) | `src/lib/store.ts`, `supabase/migrations/` |

Every date and time is stored in the bar's local time. Hours that run past midnight (for example 11am to 2am) are handled.

## Next up

- Native online ordering through the bar's POS (Square first)
- Facebook and Instagram auto-posting
- An in-app "Connect Google" button and owner self-signup
- AI phone ordering
