import { requiredEnv } from "./http.ts";

function graphUrl(): string {
    const version = requiredEnv("WHATSAPP_API_VERSION");
    if (!/^v[0-9]+\.[0-9]+$/.test(version)) throw new Error("WHATSAPP_API_VERSION must look like vXX.X");
    return `https://graph.facebook.com/${version}/${requiredEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
}

export async function sendWhatsApp(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(graphUrl(), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${requiredEnv("WHATSAPP_ACCESS_TOKEN")}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const detail = await response.text();
        console.error("WhatsApp Cloud API request failed:", response.status, detail);
        throw new Error(`WhatsApp Cloud API returned HTTP ${response.status}`);
    }
}

export async function sendText(to: string, text: string): Promise<void> {
    await sendWhatsApp({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
    });
}

export async function sendListingAlert(id: string, name: string, price: string): Promise<void> {
    await sendWhatsApp({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: requiredEnv("WHATSAPP_OWNER_PHONE"),
        type: "template",
        template: {
            name: requiredEnv("WHATSAPP_ALERT_TEMPLATE"),
            language: { code: requiredEnv("WHATSAPP_ALERT_TEMPLATE_LANGUAGE") },
            components: [{
                type: "body",
                parameters: [
                    { type: "text", text: name },
                    { type: "text", text: price },
                    { type: "text", text: id },
                ],
            }],
        },
    });
}
