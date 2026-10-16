(function () {
    const form = document.getElementById("sale-form");
    const listings = document.getElementById("sale-listings");
    const formStatus = document.getElementById("sale-form-status");
    const listingsStatus = document.getElementById("sale-listings-status");
    const imageInput = document.getElementById("device-image");
    const imagePreview = document.getElementById("image-preview");

    if (!form || !listings || !formStatus || !listingsStatus || !imageInput || !imagePreview) return;

    const config = window.BYSONIC_MARKETPLACE_CONFIG || {};
    const supabaseUrl = typeof config.supabaseUrl === "string" ? config.supabaseUrl.replace(/\/+$/, "") : "";
    const anonKey = typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey : "";
    const submitButton = form.querySelector('button[type="submit"]');
    let previewUrl = "";

    function setStatus(element, message, state) {
        element.textContent = message;
        if (state) {
            element.dataset.state = state;
        } else {
            delete element.dataset.state;
        }
    }

    function configurationIsValid() {
        if (!anonKey) return false;
        try {
            const url = new URL(supabaseUrl);
            return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
        } catch {
            return false;
        }
    }

    if (!configurationIsValid()) {
        submitButton.disabled = true;
        setStatus(formStatus, "Online submissions are not configured yet. Please contact us on WhatsApp.", "error");
        setStatus(listingsStatus, "Community listings are being set up. Please contact us on WhatsApp for current availability.");
        return;
    }

    async function responseJson(response) {
        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error("The listings service returned an invalid response.");
        }
        if (!response.ok) {
            throw new Error(typeof payload.error === "string" ? payload.error : "The listings service could not complete the request.");
        }
        return payload;
    }

    function makeListingCard(item) {
        const card = document.createElement("article");
        card.className = "sale-item";
        if (item.image_url) {
            const image = document.createElement("img");
            image.src = item.image_url;
            image.alt = item.name + " for sale";
            image.loading = "lazy";
            card.appendChild(image);
        }

        const body = document.createElement("div");
        body.className = "sale-item-body";

        const metadata = document.createElement("div");
        metadata.className = "sale-item-meta";
        const category = document.createElement("span");
        category.textContent = item.category;
        const price = document.createElement("span");
        price.textContent = item.price;
        metadata.append(category, price);

        const title = document.createElement("h4");
        title.textContent = item.name;

        const condition = document.createElement("div");
        condition.className = "sale-item-meta";
        condition.textContent = item.condition;

        const description = document.createElement("p");
        description.textContent = item.description;

        const contact = document.createElement("a");
        contact.href = "https://wa.me/27818272643?text=" + encodeURIComponent("Hi, I am interested in listing " + item.id + ".");
        contact.target = "_blank";
        contact.rel = "noopener noreferrer";
        contact.textContent = "Ask Bysonic about this item";

        body.append(metadata, title, condition, description, contact);
        card.appendChild(body);
        return card;
    }

    async function loadListings() {
        setStatus(listingsStatus, "Loading approved listings…");
        const response = await fetch(supabaseUrl + "/functions/v1/public-marketplace-listings", {
            headers: { apikey: anonKey }
        });
        const payload = await responseJson(response);
        if (!Array.isArray(payload.listings)) throw new Error("The listings service returned an invalid listing collection.");

        listings.replaceChildren();
        payload.listings.forEach(function (item) {
            listings.appendChild(makeListingCard(item));
        });
        setStatus(listingsStatus, payload.listings.length ? "" : "There are no approved listings at the moment.");
    }

    imageInput.addEventListener("change", function () {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = "";
        const file = imageInput.files && imageInput.files[0];
        if (!file) {
            imagePreview.removeAttribute("src");
            imagePreview.style.display = "none";
            return;
        }
        previewUrl = URL.createObjectURL(file);
        imagePreview.src = previewUrl;
        imagePreview.style.display = "block";
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const imageFile = imageInput.files && imageInput.files[0];
        if (imageFile && imageFile.size > 4 * 1024 * 1024) {
            setStatus(formStatus, "Images must be 4 MB or smaller.", "error");
            return;
        }
        if (imageFile && !["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
            setStatus(formStatus, "Upload a JPEG, PNG, or WebP image.", "error");
            return;
        }

        submitButton.disabled = true;
        setStatus(formStatus, "Sending your listing for review…");
        try {
            const response = await fetch(supabaseUrl + "/functions/v1/submit-marketplace-listing", {
                method: "POST",
                headers: { apikey: anonKey },
                body: new FormData(form)
            });
            const result = await responseJson(response);
            form.reset();
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = "";
            imagePreview.removeAttribute("src");
            imagePreview.style.display = "none";
            setStatus(formStatus, result.notificationSent
                ? "Thanks. Your listing was submitted and is awaiting review. We will contact you on WhatsApp if needed."
                : "Your listing was received and is awaiting review, but the owner notification could not be sent. Please also contact us on WhatsApp.");
        } catch (error) {
            setStatus(formStatus, error instanceof Error ? error.message : "Your listing could not be submitted. Please try again.", "error");
        } finally {
            submitButton.disabled = false;
        }
    });

    loadListings().catch(function (error) {
        console.error("Could not load approved marketplace listings:", error);
        setStatus(listingsStatus, error instanceof Error ? error.message : "Approved listings could not be loaded.", "error");
    });
})();
