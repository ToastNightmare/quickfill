import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (normalize(current) !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing account-device guard anchor (${label}): ${search.slice(0, 120)}`);
  return text.replace(search, replacement);
}

function ensureImport(text, after, addition, label) {
  if (text.includes(addition.trim())) return text;
  const anchor = after.replace(/\r?\n$/, "");
  const index = text.indexOf(anchor);
  if (index === -1) throw new Error(`Missing import anchor (${label}): ${after.trim()}`);
  const lineEndStart = index + anchor.length;
  const lineEnd = text.startsWith("\r\n", lineEndStart) ? "\r\n" : "\n";
  return text.slice(0, lineEndStart + lineEnd.length) + addition.replace(/\r?\n/g, lineEnd) + text.slice(lineEndStart + lineEnd.length);
}

function insertBeforeIfMissing(text, marker, snippet, needle, label) {
  if (text.includes(needle)) return text;
  if (!text.includes(marker)) throw new Error(`Missing insertion marker (${label}): ${marker.slice(0, 120)}`);
  return text.replace(marker, `${snippet}${marker}`);
}

function insertAfterIfMissing(text, marker, snippet, needle, label) {
  if (text.includes(needle)) return text;
  if (!text.includes(marker)) throw new Error(`Missing insertion marker (${label}): ${marker.slice(0, 120)}`);
  return text.replace(marker, `${marker}${snippet}`);
}

function patchDb() {
  const path = "src/lib/db.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = insertBeforeIfMissing(
    text,
    '  "alter table app_users add column if not exists id uuid default gen_random_uuid()",\n',
    '  `create table if not exists account_devices (\n    id uuid primary key default gen_random_uuid(),\n    user_id text not null,\n    device_id_hash text not null,\n    label text,\n    user_agent text,\n    last_ip_hash text,\n    first_seen_at timestamptz not null default now(),\n    last_seen_at timestamptz not null default now()\n  )`,\n',
    'create table if not exists account_devices',
    'db create account_devices',
  );

  text = insertBeforeIfMissing(
    text,
    '  "alter table subscriptions alter column tier set default \'free\'",\n',
    '  "alter table account_devices add column if not exists id uuid default gen_random_uuid()",\n  "alter table account_devices add column if not exists user_id text",\n  "alter table account_devices add column if not exists device_id_hash text",\n  "alter table account_devices add column if not exists label text",\n  "alter table account_devices add column if not exists user_agent text",\n  "alter table account_devices add column if not exists last_ip_hash text",\n  "alter table account_devices add column if not exists first_seen_at timestamptz default now()",\n  "alter table account_devices add column if not exists last_seen_at timestamptz default now()",\n',
    'alter table account_devices add column if not exists device_id_hash',
    'db alter account_devices',
  );

  text = insertBeforeIfMissing(
    text,
    '  "create unique index if not exists app_users_clerk_user_id_unique_idx on app_users(clerk_user_id)",\n',
    '  "create unique index if not exists account_devices_user_device_unique_idx on account_devices(user_id, device_id_hash)",\n  "create index if not exists account_devices_user_seen_idx on account_devices(user_id, last_seen_at desc)",\n',
    'account_devices_user_device_unique_idx',
    'db index account_devices',
  );

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = ensureImport(
    text,
    'import { getRequestEntitlement } from "@/lib/entitlements";\n',
    'import { enforceAccountDeviceLimit } from "@/lib/device-guard";\n',
    'fill-pdf device guard import',
  );

  text = replaceOnce(
    text,
    `type DownloadAccess = {\n  isPro: boolean;`,
    `type DownloadAccess = {\n  tier: "guest" | "free" | "pro" | "business" | "qa";\n  isPro: boolean;`,
    'DownloadAccess tier',
  );

  text = replaceOnce(
    text,
    `return { isPro: true, used: 0, limit: FREE_FILL_LIMIT, key: null, userId: null, guest: false, isQaBypass: true };`,
    `return { tier: "qa", isPro: true, used: 0, limit: FREE_FILL_LIMIT, key: null, userId: null, guest: false, isQaBypass: true };`,
    'qa access tier',
  );

  text = replaceOnce(
    text,
    `return { isPro: false, used: used ?? 0, limit: entitlement.limit, key, userId: null, guest: true };`,
    `return { tier: "guest", isPro: false, used: used ?? 0, limit: entitlement.limit, key, userId: null, guest: true };`,
    'guest access tier',
  );

  text = replaceOnce(
    text,
    `  return {\n    isPro,\n    used: used ?? 0,`,
    `  return {\n    tier: entitlement.tier,\n    isPro,\n    used: used ?? 0,`,
    'signed-in access tier',
  );

  text = insertAfterIfMissing(
    text,
    `    accessForLog = access;\n`,
    `    const deviceGuard = await enforceAccountDeviceLimit({\n      request,\n      userId: access.userId,\n      tier: access.tier,\n      deviceId: (formData.get("deviceId") as string | null) ?? request.headers.get("x-quickfill-device-id"),\n      qaBypass: access.isQaBypass === true,\n    });\n    if (!deviceGuard.allowed) {\n      await recordDownloadLog({\n        status: "blocked",\n        userId: access.userId,\n        guest: access.guest,\n        reason: "device_limit",\n        message: deviceGuard.message,\n      });\n      return NextResponse.json(\n        { error: deviceGuard.message, code: "device_limit", limit: deviceGuard.limit, activeDevices: deviceGuard.activeDeviceCount },\n        { status: 403 },\n      );\n    }\n\n`,
    'const deviceGuard = await enforceAccountDeviceLimit',
    'fill-pdf device guard check',
  );

  writeIfChanged(path, text);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = ensureImport(
    text,
    'import { trackEvent } from "@/lib/analytics";\n',
    'import { getQuickFillDeviceId } from "@/lib/client-device";\n',
    'editor device id import',
  );

  text = replaceOnce(
    text,
    `      fd.append("viewportDims", JSON.stringify(Array.from(pageViewportDims.entries())));\n      fd.append("hasAcroForm", String(hasAcroForm));\n      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });`,
    `      fd.append("viewportDims", JSON.stringify(Array.from(pageViewportDims.entries())));\n      fd.append("hasAcroForm", String(hasAcroForm));\n      const quickFillDeviceId = getQuickFillDeviceId();\n      if (quickFillDeviceId) fd.append("deviceId", quickFillDeviceId);\n      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });`,
    'editor device id form data',
  );

  writeIfChanged(path, text);
}

function patchMobileFiller() {
  const path = "src/components/MobileFiller.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = ensureImport(
    text,
    'import type { EditorField } from "@/lib/types";\n',
    'import { getQuickFillDeviceId } from "@/lib/client-device";\n',
    'mobile filler device id import',
  );

  text = replaceOnce(
    text,
    `      fd.append("hasAcroForm", String(hasAcroForm));\n      fd.append("addWatermark", String(!isPro));\n\n      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });`,
    `      fd.append("hasAcroForm", String(hasAcroForm));\n      fd.append("addWatermark", String(!isPro));\n      const quickFillDeviceId = getQuickFillDeviceId();\n      if (quickFillDeviceId) fd.append("deviceId", quickFillDeviceId);\n\n      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });`,
    'mobile filler device id form data',
  );

  writeIfChanged(path, text);
}

patchDb();
patchFillPdfRoute();
patchEditorPage();
patchMobileFiller();
