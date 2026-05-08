const baseUrl = process.env.QUICKFILL_SMOKE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";
const paths = ["/", "/pricing", "/api/usage"];

for (const path of paths) {
  const res = await fetch(new URL(path, baseUrl));
  console.log(`${path} ${res.status}`);
  if (res.status >= 500) process.exitCode = 1;
}
