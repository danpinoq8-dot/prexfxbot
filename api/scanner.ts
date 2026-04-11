export const config = { runtime: "edge" };
export default async function handler(req: Request) {
  const AW_ENDPOINT = process.env.APPWRITE_FUNCTION_URL;
  const AW_PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
  const AW_KEY = process.env.VITE_APPWRITE_API_KEY;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
    });
  }

  if (!AW_ENDPOINT || !AW_PROJECT || !AW_KEY) {
    return new Response(JSON.stringify({ error: "Appwrite env vars not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const res = await fetch(AW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": AW_PROJECT, "X-Appwrite-Key": AW_KEY },
    body: JSON.stringify({ async: false }),
  });

  const data = await res.json();
  const body = data.responseBody || JSON.stringify(data);
  return new Response(body, {
    status: data.responseStatusCode || res.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
