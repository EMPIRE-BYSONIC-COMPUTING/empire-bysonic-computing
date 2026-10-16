const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export function originIsAllowed(request: Request): boolean {
    const origin = request.headers.get("origin");
    return !origin || ALLOWED_ORIGINS.includes(origin);
}

export function corsHeaders(request: Request): HeadersInit {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-hub-signature-256",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
    if (origin && ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    return headers;
}

export function jsonResponse(request: Request, status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
}

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required server setting: ${name}`);
    return value;
}

export function supabaseConfig(): { url: string; serviceKey: string } {
    return {
        url: requiredEnv("SUPABASE_URL").replace(/\/+$/, ""),
        serviceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };
}

export function serviceHeaders(extra: HeadersInit = {}): Headers {
    const { serviceKey } = supabaseConfig();
    const headers = new Headers(extra);
    headers.set("apikey", serviceKey);
    headers.set("Authorization", `Bearer ${serviceKey}`);
    return headers;
}

export async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const { url } = supabaseConfig();
    return fetch(`${url}${path}`, {
        ...init,
        headers: serviceHeaders(init.headers),
    });
}

export async function responseError(response: Response): Promise<string> {
    const text = await response.text();
    try {
        const body = JSON.parse(text);
        return typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    } catch {
        return `HTTP ${response.status}`;
    }
}

export function optionsResponse(request: Request): Response {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
}
