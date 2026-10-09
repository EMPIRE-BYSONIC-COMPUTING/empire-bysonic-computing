(function () {
    const repository = "EMPIRE-BYSONIC-COMPUTING/empire-bysonic-computing";
    const status = document.getElementById("downloads-status");
    const grid = document.getElementById("downloads-grid");
    const list = document.getElementById("downloads-list");
    const container = grid || list;

    if (!status || !container) return;

    const isHomePage = Boolean(grid);
    const downloadType = container.getAttribute("data-download-type") || "software";
    const operatingSystemsFolder = "Operating Systems";
    const legacyOperatingSystemFolders = ["boot", "efi", "sources", "support"];

    function isLegacyOperatingSystemFolder(entry) {
        return entry.type === "dir"
            && legacyOperatingSystemFolders.includes(entry.name.toLowerCase());
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        const units = ["KB", "MB", "GB"];
        let size = bytes / 1024;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit += 1;
        }
        return size.toFixed(1) + " " + units[unit];
    }

    function fetchDirectory(path) {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        return fetch("https://api.github.com/repos/" + repository + "/contents/" + encodedPath + "?per_page=100")
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("GitHub returned HTTP " + response.status + " for " + path);
                }
                return response.json();
            })
            .then(function (entries) {
                if (!Array.isArray(entries)) {
                    throw new Error("GitHub returned an invalid directory listing for " + path);
                }
                return entries;
            });
    }

    function collectFiles(path, category) {
        return fetchDirectory(path).then(function (entries) {
            return Promise.all(entries.map(function (entry) {
                if (entry.type === "file") {
                    if (entry.name.startsWith(".") || entry.name.toLowerCase() === "readme.md") {
                        return [];
                    }
                    return [{
                        category: category,
                        name: entry.name,
                        path: entry.path,
                        size: entry.size
                    }];
                }

                if (entry.type === "dir" && !entry.name.startsWith(".")) {
                    return collectFiles(entry.path, category);
                }

                return [];
            })).then(function (files) {
                return files.reduce(function (allFiles, group) {
                    return allFiles.concat(group);
                }, []);
            });
        });
    }

    function createDownloadCard(file) {
        const card = document.createElement("article");
        card.className = isHomePage ? "download-card" : "download-page-card";

        const title = document.createElement(isHomePage ? "h4" : "h2");
        title.textContent = file.name;

        const details = document.createElement("p");
        details.textContent = isHomePage
            ? "Available to download from Empire Bysonic Computing."
            : formatSize(file.size);

        const link = document.createElement("a");
        link.className = "download-button";
        link.href = file.path.split("/").map(encodeURIComponent).join("/");
        link.setAttribute("download", file.name);
        link.textContent = "Download";
        link.setAttribute("aria-label", "Download " + file.name);

        if (isHomePage) {
            const icon = document.createElement("div");
            icon.className = "download-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "⬇";

            const metadata = document.createElement("div");
            metadata.className = "download-meta";
            const type = document.createElement("span");
            type.textContent = file.name.includes(".")
                ? file.name.split(".").pop().toUpperCase()
                : "FILE";
            const size = document.createElement("span");
            size.textContent = formatSize(file.size);
            metadata.append(type, size);

            card.append(icon, title, details, metadata, link);
        } else {
            card.append(title, details, link);
        }

        return card;
    }

    function renderFiles(files) {
        const categories = new Map();
        files.forEach(function (file) {
            if (!categories.has(file.category)) {
                categories.set(file.category, []);
            }
            categories.get(file.category).push(file);
        });

        if (categories.size === 0) {
            status.textContent = downloadType === "operating-systems"
                ? "No operating system downloads are currently available."
                : isHomePage
                    ? "No downloads are available yet."
                    : "No software downloads are currently available.";
            return;
        }

        Array.from(categories.keys())
            .sort(function (a, b) { return a.localeCompare(b); })
            .forEach(function (category) {
                const heading = document.createElement(isHomePage ? "h4" : "h2");
                heading.className = "download-category-heading";
                heading.textContent = category;
                container.appendChild(heading);

                categories.get(category)
                    .sort(function (a, b) { return a.name.localeCompare(b.name); })
                    .forEach(function (file) {
                        container.appendChild(createDownloadCard(file));
                    });
            });

        status.textContent = "";
    }

    fetchDirectory("downloads")
        .then(function (entries) {
            if (downloadType === "operating-systems") {
                const operatingSystemsEntry = entries.find(function (entry) {
                    return entry.type === "dir"
                        && entry.name.toLowerCase() === operatingSystemsFolder.toLowerCase();
                });
                const mediaFolders = entries.filter(isLegacyOperatingSystemFolder);
                const folderPromises = mediaFolders.map(function (entry) {
                    return collectFiles(entry.path, entry.name);
                });

                if (operatingSystemsEntry) {
                    folderPromises.push(collectFiles(operatingSystemsEntry.path, operatingSystemsFolder));
                }

                return Promise.all(folderPromises).then(function (groups) {
                    return groups.reduce(function (allFiles, group) {
                        return allFiles.concat(group);
                    }, []);
                });
            }

            return Promise.all(entries.map(function (entry) {
                if (entry.type === "file") {
                    if (entry.name.startsWith(".") || entry.name.toLowerCase() === "readme.md") {
                        return [];
                    }
                    return [{
                        category: "Other Downloads",
                        name: entry.name,
                        path: entry.path,
                        size: entry.size
                    }];
                }

                if (entry.type === "dir"
                    && !entry.name.startsWith(".")
                    && entry.name.toLowerCase() !== operatingSystemsFolder.toLowerCase()
                    && !isLegacyOperatingSystemFolder(entry)) {
                    return collectFiles(entry.path, entry.name);
                }

                return [];
            }));
        })
        .then(function (filesOrGroups) {
            const files = downloadType === "operating-systems"
                ? filesOrGroups
                : filesOrGroups.reduce(function (allFiles, group) {
                    return allFiles.concat(group);
                }, []);
            renderFiles(files);
        })
        .catch(function (error) {
            console.error("Could not load the downloads folder:", error);
            status.textContent = "Downloads could not be loaded right now. Please try again later.";
        });
})();
