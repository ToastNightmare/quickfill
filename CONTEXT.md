# Coder Context — Active Projects

## QuickFill (PRIMARY)
- Repo: /home/kyle/projects/quickfill
- Live: https://getquickfill.com
- GitHub: ToastNightmare/quickfill (branch: master)
- Stack: Next.js App Router, Tailwind, Clerk, Stripe, Upstash Redis, Resend, pdf-lib, Konva.js, PDF.js
- Deploy: npx vercel --prod --yes
- Build: pnpm build
- QA: pnpm qa (Playwright)

### Architecture Notes
- Single global Transformer for Konva field resize (confirmed working, NEVER revert)
- AcroForm field detection for pre-existing PDF fields
- Auto-fill from Australian profile (TFN, Medicare, ABN, DOB, bank, licence)
- Two-tier pricing enforced via Clerk + Stripe
- Templates stored in /public/templates/
- Branded emails via Resend

## ODCF Church
- Repo: /home/kyle/projects/odcf-church
- Live: https://odcfchurch.com
- GitHub: ToastNightmare/odcf-church
- Stack: Next.js, Tailwind, Upstash Redis, Resend, Twilio

## Ngadju Flagship
- Repo: /home/kyle/projects/ngadju-flagship
- Live: https://ngadju-flagship.vercel.app
- GitHub: ToastNightmare/ngadju-flagship
- Stack: Next.js, Tailwind

## Carry Culture
- Repo: /home/kyle/projects/carry-culture
- Live: https://carry-culture.vercel.app
- GitHub: ToastNightmare/carry-culture
- Stack: Next.js, Tailwind, Printful API

## Mission Control
- Repo: /home/kyle/projects/mission-control
- Live: https://mission-control-beta-ivory.vercel.app
- GitHub: ToastNightmare/mission-control
- Stack: Next.js, Tailwind

## All Projects — Shared Rules
- Package manager: pnpm (never npm or yarn)
- Framework: Next.js 14+ App Router
- Styling: Tailwind CSS
- Hosting: Vercel
- NEVER use em dashes anywhere
- pnpm build must pass before deploying
- Always commit and push after deploying
- Trigger QA agent after every deploy
