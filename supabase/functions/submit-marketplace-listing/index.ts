import { jsonResponse, optionsResponse, originIsAllowed, requiredEnv, responseError, serviceFetch } from "../_shared/http.ts";
import { sendListingAlert } from "../_shared/whatsapp.ts";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const CONDITIONS = new Set(["New", "Second Hand", "Refurbished"]);
const CATEGORIES = new Set(["Laptop", "Desktop", "Tablet", "Mini PC", "Accessory"]);
const IMAGE_TYPES: Record<string, { extension: string; signature: (bytes: Uint8Array) => boolean }> = {
    "image/jpeg": { extension: "jpg", signature: (bytes) => bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 },
    "image/png": { extension: "png", signature: (bytes) => bytes.length > 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10" },
    "image/webp": { extension: "webp", signature: (bytes) => bytes.length > 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP" },
};

function cleanText(value: FormDataEntryValue | null, maxLength: number): string {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

async function hashClientIp(request: Request): Promise<string> {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const address = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
    if (!address) throw new Error("Could not determine submission address for rate limiting.");
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(requiredEnv("SUBMISSION_IP_HMAC_SECRET")),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(address)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadImage(id: string, file: File): Promise<string> {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 4 MB or smaller.");
    const imageType = IMAGE_TYPES[file.type];
    if (!imageType) throw new Error("Upload a JPEG, PNG, or WebP image.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageType.signature(bytes)) throw new Error("The uploaded file does not match its image type.");
    const path = `${id}/${crypto.randomUUID()}.${imageType.extension}`;
    const response = await serviceFetch(`/storage/v1/object/sale-listing-images/${path}`, {
        method: "POST",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: bytes,
    });
    if (!response.ok) throw new Error(`Could not store the image: ${await responseError(response)}`);
    return path;
}

async function deleteImage(path: string): Promise<void> {
    const response = await serviceFetch("/storage/v1/object/sale-listing-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok) console.error("Could not clean up an unlinked marketplace image:", await responseError(response));
}

async function consumeSubmissionSlot(request: Request): Promise<boolean> {
    const response = await serviceFetch("/rest/v1/rpc/consume_marketplace_submission_slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_ip_hash: await hashClientIp(request) }),
    });
    if (!response.ok) throw new Error(`Could not check submission limit: ${await responseError(response)}`);
    return await response.json() === true;
}

Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (!originIsAllowed(request)) return jsonResponse(request, 403, { error: "This website origin is not allowed." });
    if (request.method !== "POST") return jsonResponse(request, 405, { error: "Method not allowed." });
    if (request.headers.get("apikey") !== Deno.env.get("SUPABASE_ANON_KEY")) {
        return jsonResponse(request, 401, { error: "Marketplace request could not be authenticated." });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) return jsonResponse(request, 413, { error: "The upload is too large. Images must be 4 MB or smaller." });

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return jsonResponse(request, 400, { error: "The submitted form could not be read." });
    }

    const name = cleanText(form.get("device-name"), 100);
    const condition = cleanText(form.get("device-condition"), 32);
    const price = cleanText(form.get("device-price"), 80);
    const category = cleanText(form.get("device-category"), 32);
    const description = cleanText(form.get("device-description"), 2000);
    const sellerWhatsapp = cleanText(form.get("seller-whatsapp"), 16);
    const consent = form.get("seller-contact-consent") === "on";
    const fileValue = form.get("device-image");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (name.length < 2 || price.length < 1 || description.length < 5
        || !CONDITIONS.has(condition) || !CATEGORIES.has(category)
        || !/^\+[1-9][0-9]{7,14}$/.test(sellerWhatsapp) || !consent) {
        return jsonResponse(request, 400, { error: "Check the item details, WhatsApp number, and contact-consent box." });
    }

    const id = crypto.randomUUID();
    let imagePath: string | null = null;
    try {
        if (!await consumeSubmissionSlot(request)) {
            return jsonResponse(request, 429, { error: "Submission limit reached. Please try again later." });
        }
        if (file) imagePath = await uploadImage(id, file);

        const rpcResponse = await serviceFetch("/rest/v1/rpc/submit_marketplace_listing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                p_id: id,
                p_name: name,
                p_condition: condition,
                p_price: price,
                p_category: category,
                p_description: description,
                p_seller_whatsapp: sellerWhatsapp,
                p_image_path: imagePath,
            }),
        });

        if (!rpcResponse.ok) throw new Error(`Could not save the submission: ${await responseError(rpcResponse)}`);
        const savedId = await rpcResponse.json();
        if (savedId !== id) throw new Error("The database did not confirm the listing ID.");
    } catch (error) {
        if (imagePath) await deleteImage(imagePath);
        if (error instanceof Error && /Images must|Upload a JPEG|does not match/.test(error.message)) {
            return jsonResponse(request, 400, { error: error.message });
        }
        console.error("Marketplace submission failed:", error);
        return jsonResponse(request, 500, { error: "The listing could not be submitted. Please try again later." });
    }

    try {
        await sendListingAlert(id, name, price);
        return jsonResponse(request, 201, { id, status: "pending", notificationSent: true });
    } catch (error) {
        console.error("Listing saved but WhatsApp owner alert failed:", error);
        return jsonResponse(request, 201, { id, status: "pending", notificationSent: false });
    }
});
