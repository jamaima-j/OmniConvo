// helpers/safeJson.ts
export function safeJson(
  data: unknown,
  status = 200,
  headers: HeadersInit = {}
) {
  return new Response(
    JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }
  );
}
