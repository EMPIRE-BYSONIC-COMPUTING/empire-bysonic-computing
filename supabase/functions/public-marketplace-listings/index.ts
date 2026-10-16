import { jsonResponse, optionsResponse, originIsAllowed, responseError, serviceFetch, supabaseConfig } from "../_shared/http.ts";

interface Listing {
    id: string;
    name: string;
    condition: string;
    price: string;
    category: string;
    description: string;
    image_path: string | null;
}

Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (!originIsAllowed(request)) return jsonResponse(request, 403, { error: "This website origin is not allowed." });
    if (request.method !== "GET") return jsonResponse(request, 405, { error: "Method not allowed." });
    if (request.headers.get("apikey") !== Deno.env.get("SUPABASE_ANON_KEY")) {
        return jsonResponse(request, 401, { error: "Marketplace request could not be authenticated." });
    }

    const query = new URLSearchParams({
        select: "id,name,condition,price,category,description,image_path",
        status: "eq.approved",
        order: "created_at.desc",
        limit: "60",
    });
    const response = await serviceFetch(`/rest/v1/marketplace_listings?${query}`);
    if (!response.ok) {
        console.error("Could not read approved listings:", await responseError(response));
        return jsonResponse(request, 502, { error: "Approved listings could not be loaded." });
    }

    const rows = await response.json() as Listing[];
    const { url } = supabaseConfig();
    const listings = await Promise.all(rows.map(async (row) => {
        let imageUrl: string | null = null;
        if (row.image_path) {
            const signResponse = await serviceFetch(`/storage/v1/object/sign/sale-listing-images/${row.image_path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expiresIn: 3600 }),
            });
            if (!signResponse.ok) {
                console.error("Could not create a listing image URL:", await responseError(signResponse));
                throw new Error("Could not load an approved listing image.");
            }
            const signed = await signResponse.json() as { signedURL?: string };
            if (typeof signed.signedURL !== "string") throw new Error("Storage returned an invalid signed image URL.");
            imageUrl = new URL(signed.signedURL, `${url}/storage/v1/`).toString();
        }

        return {
            id: row.id,
            name: row.name,
            condition: row.condition,
            price: row.price,
            category: row.category,
            description: row.description,
            image_url: imageUrl,
        };
    }));

    return jsonResponse(request, 200, { listings });
});
