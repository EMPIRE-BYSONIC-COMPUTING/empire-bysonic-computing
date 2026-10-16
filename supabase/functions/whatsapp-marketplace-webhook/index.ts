import { jsonResponse, requiredEnv, responseError, serviceFetch } from "../_shared/http.ts";
import { sendText } from "../_shared/whatsapp.ts";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
}

async function signatureIsValid(body: string, signature: string | null): Promise<boolean> {
    if (!signature?.startsWith("sha256=")) return false;
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(requiredEnv("WHATSAPP_APP_SECRET")),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    return constantTimeEqual(signature.slice(7).toLowerCase(), bytesToHex(digest));
}

async function recordMessage(messageId: string): Promise<boolean> {
    const response = await serviceFetch("/rest/v1/marketplace_whatsapp_events", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({ message_id: messageId }),
    });
    if (!response.ok) throw new Error(`Could not record WhatsApp event: ${await responseError(response)}`);
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
}

async function notifyOwner(text: string): Promise<void> {
    await sendText(requiredEnv("WHATSAPP_OWNER_PHONE"), text);
}

async function handleOwnerCommand(text: string): Promise<string> {
    const command = text.trim();
    const reviewMatch = command.match(/^(APPROVE|REJECT)\s+([0-9a-f-]{36})$/i);
    if (reviewMatch) {
        const status = reviewMatch[1].toLowerCase() === "approve" ? "approved" : "rejected";
        const query = new URLSearchParams({ id: `eq.${reviewMatch[2]}`, status: "eq.pending", select: "id" });
        const response = await serviceFetch(`/rest/v1/marketplace_listings?${query}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error(`Could not update listing status: ${await responseError(response)}`);
        const rows = await response.json();
        return Array.isArray(rows) && rows.length
            ? `Listing ${status}: ${reviewMatch[2]}`
            : "No pending listing matched that ID. Check the ID and current status.";
    }

    const replyMatch = command.match(/^REPLY\s+([0-9a-f-]{36})\s+([\s\S]{1,1500})$/i);
    if (replyMatch) {
        const query = new URLSearchParams({
            select: "seller_whatsapp,seller_contact_consented,status",
            id: `eq.${replyMatch[1]}`,
            limit: "1",
        });
        const response = await serviceFetch(`/rest/v1/marketplace_listings?${query}`);
        if (!response.ok) throw new Error(`Could not read listing contact: ${await responseError(response)}`);
        const rows = await response.json();
        const listing = Array.isArray(rows) ? rows[0] : null;
        if (!listing || listing.status !== "approved" || listing.seller_contact_consented !== true) {
            return "Could not reply: listing is not approved or contact consent is unavailable.";
        }
        try {
            await sendText(listing.seller_whatsapp, replyMatch[2].trim());
        } catch (error) {
            console.error("WhatsApp reply to seller failed:", error);
            return "The message could not be sent. WhatsApp may require the seller to message first or an approved message template outside the 24-hour service window.";
        }
        return `Your message was sent to the seller for listing ${replyMatch[1]}.`;
    }

    return "Commands: APPROVE <listing-id>, REJECT <listing-id>, or REPLY <listing-id> <message>.";
}

Deno.serve(async (request: Request) => {
    if (request.method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.get("hub.mode") === "subscribe"
            && url.searchParams.get("hub.verify_token") === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
            return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
        }
        return new Response("Webhook verification failed.", { status: 403 });
    }

    if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 });
    const rawBody = await request.text();
    if (!await signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"))) {
        return new Response("Invalid webhook signature.", { status: 401 });
    }

    let payload: {
        entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }> } }> }>;
    };
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new Response("Invalid webhook payload.", { status: 400 });
    }

    const ownerPhone = requiredEnv("WHATSAPP_OWNER_PHONE").replace(/\D/g, "");
    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            for (const message of change.value?.messages || []) {
                if (!message.id || !message.from || message.type !== "text" || !message.text?.body) continue;
                if (message.from.replace(/\D/g, "") !== ownerPhone) continue;
                if (!await recordMessage(message.id)) continue;
                try {
                    await notifyOwner(await handleOwnerCommand(message.text.body));
                } catch (error) {
                    console.error("WhatsApp marketplace command failed:", error);
                    await notifyOwner("The command could not be completed. Check the listing ID and try again.");
                }
            }
        }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
});
