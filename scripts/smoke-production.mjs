const baseUrl = (process.env.QUICKFILL_APP_URL || "https://getquickfill.com").replace(/\/$/, "");
const paths = (process.env.QUICKFILL_SMOKE_PATHS || "/,/pricing")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

async function checkUrl(path) {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "QuickFill production smoke check" },
    });
    return {
      name: path,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      url,
    };
  } catch (error) {
    return {
      name: path,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
      url,
    };
  }
}

async function checkCronHealth() {
  if (!process.env.CRON_SECRET) {
    return {
      name: "/api/cron/health-check",
      ok: true,
      skipped: true,
      reason: "CRON_SECRET is not set for this smoke run.",
    };
  }

  const response = await fetch(`${baseUrl}/api/cron/health-check`, {
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "user-agent": "QuickFill production smoke check",
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    name: "/api/cron/health-check",
    ok: response.ok && body?.ok !== false,
    status: response.status,
    body,
  };
}

const results = [...(await Promise.all(paths.map(checkUrl))), await checkCronHealth()];
const failed = results.filter((result) => !result.ok);

console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      generatedAt: new Date().toISOString(),
      baseUrl,
      results,
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  process.exitCode = 1;
}
