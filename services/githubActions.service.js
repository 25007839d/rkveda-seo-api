const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_WORKFLOW =
    process.env.GITHUB_WORKFLOW || "seo-audit-worker.yml";
const GITHUB_REF =
    process.env.GITHUB_REF || "main";

const dispatchAuditWorker = async (auditId) => {

    if (!GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN is not configured");
    }

    if (!GITHUB_OWNER) {
        throw new Error("GITHUB_OWNER is not configured");
    }

    if (!GITHUB_REPO) {
        throw new Error("GITHUB_REPO is not configured");
    }

    const url =
        `https://api.github.com/repos/` +
        `${GITHUB_OWNER}/` +
        `${GITHUB_REPO}/actions/workflows/` +
        `${GITHUB_WORKFLOW}/dispatches`;

    console.log(
        `Dispatching GitHub Actions worker for audit ${auditId}`
    );

    const response = await fetch(url, {
        method: "POST",

        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            ref: GITHUB_REF,
            inputs: {
                audit_id: String(auditId)
            }
        })
    });

    if (!response.ok) {

        const text = await response.text();

        throw new Error(
            `GitHub Actions dispatch failed: ` +
            `${response.status} ${text}`
        );
    }

    return {
        success: true,
        audit_id: auditId
    };
};

module.exports = {
    dispatchAuditWorker
};