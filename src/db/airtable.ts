import dns from "node:dns";
import https from "node:https";

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (process.env.DB_TYPE === "airtable" && (!apiKey || !baseId)) {
    console.error("Airtable API Key or Base ID is missing in environment variables");
}

export type FieldValue =
    | string
    | number
    | boolean
    | readonly string[]
    | undefined;

export type FieldSet = Record<string, FieldValue>;

export type AirtableRecord = {
    id: string;
    fields: FieldSet;
    createdTime?: string;
};

type SortOption = {
    field: string;
    direction: "asc" | "desc";
};

type SelectOptions = {
    fields?: string[];
    filterByFormula?: string;
    maxRecords?: number;
    pageSize?: number;
    sort?: SortOption[];
};

type CreatePayload =
    | FieldSet
    | { fields: FieldSet }[]
    | { fields: FieldSet };

function getHeaders() {
    if (!apiKey) {
        throw new Error("Missing AIRTABLE_API_KEY");
    }

    return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
}

function buildTableUrl(tableName: string, recordId?: string, options?: SelectOptions) {
    if (!baseId) {
        throw new Error("Missing AIRTABLE_BASE_ID");
    }

    const encodedTable = encodeURIComponent(tableName);
    const encodedRecordId = recordId ? `/${encodeURIComponent(recordId)}` : "";
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodedTable}${encodedRecordId}`);

    if (options) {
        if (options.filterByFormula) {
            url.searchParams.set("filterByFormula", options.filterByFormula);
        }

        if (typeof options.maxRecords === "number") {
            url.searchParams.set("maxRecords", String(options.maxRecords));
        }

        if (typeof options.pageSize === "number") {
            url.searchParams.set("pageSize", String(options.pageSize));
        }

        if (options.fields && options.fields.length > 0) {
            for (const field of options.fields) {
                url.searchParams.append("fields[]", field);
            }
        }

        if (options.sort) {
            options.sort.forEach((sort, index) => {
                url.searchParams.set(`sort[${index}][field]`, sort.field);
                url.searchParams.set(`sort[${index}][direction]`, sort.direction);
            });
        }
    }

    return url;
}

async function airtableRequest<T>(url: URL, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<T> {
    const payload = await new Promise<{ statusCode: number; statusMessage: string; body: string }>((resolve, reject) => {
        const request = https.request(url, {
            method: init?.method ?? "GET",
            family: 4,
            lookup: dns.lookup,
            headers: {
                ...getHeaders(),
                ...(init?.headers ?? {}),
            },
        }, (response) => {
            let body = "";

            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                body += chunk;
            });
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode ?? 500,
                    statusMessage: response.statusMessage ?? "Unknown Error",
                    body,
                });
            });
        });

        request.on("error", reject);

        if (init?.body) {
            request.write(init.body);
        }

        request.end();
    });

    if (payload.statusCode < 200 || payload.statusCode >= 300) {
        let errorMessage = `${payload.statusCode} ${payload.statusMessage}`;

        try {
            const data = JSON.parse(payload.body) as { error?: { message?: string; type?: string } };
            const apiMessage = data.error?.message || data.error?.type;
            if (apiMessage) {
                errorMessage = apiMessage;
            }
        } catch {
            if (payload.body) {
                errorMessage = payload.body;
            }
        }

        throw new Error(`Airtable request failed: ${errorMessage}`);
    }

    return JSON.parse(payload.body) as T;
}

async function listRecords(tableName: string, options: SelectOptions = {}): Promise<AirtableRecord[]> {
    const pageSize = options.pageSize ?? 100;
    const maxRecords = options.maxRecords;
    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
        const remaining = typeof maxRecords === "number" ? maxRecords - records.length : pageSize;
        if (typeof maxRecords === "number" && remaining <= 0) {
            break;
        }

        const url = buildTableUrl(tableName, undefined, {
            ...options,
            pageSize: Math.min(pageSize, typeof maxRecords === "number" ? remaining : pageSize),
        });

        if (offset) {
            url.searchParams.set("offset", offset);
        }

        const data = await airtableRequest<{ records: AirtableRecord[]; offset?: string }>(url);
        records.push(...data.records);
        offset = data.offset;
    } while (offset);

    return typeof maxRecords === "number" ? records.slice(0, maxRecords) : records;
}

function normalizeCreatePayload(payload: CreatePayload) {
    if (Array.isArray(payload)) {
        return { records: payload };
    }

    if ("fields" in payload) {
        return payload;
    }

    return { fields: payload };
}

function createTableClient(tableName: string) {
    return {
        select(options: SelectOptions = {}) {
            return {
                all: async () => listRecords(tableName, options),
                firstPage: async () => {
                    const pageSize = options.maxRecords ? Math.min(options.maxRecords, 100) : 100;
                    return listRecords(tableName, {
                        ...options,
                        maxRecords: pageSize,
                        pageSize,
                    });
                },
            };
        },

        async find(recordId: string) {
            const url = buildTableUrl(tableName, recordId);
            return airtableRequest<AirtableRecord>(url);
        },

        async create(payload: CreatePayload) {
            const url = buildTableUrl(tableName);
            const body = normalizeCreatePayload(payload);
            return airtableRequest<AirtableRecord | { records: AirtableRecord[] }>(url, {
                method: "POST",
                body: JSON.stringify(body),
            });
        },

        async update(recordId: string, fields: FieldSet) {
            const url = buildTableUrl(tableName, recordId);
            return airtableRequest<AirtableRecord>(url, {
                method: "PATCH",
                body: JSON.stringify({ fields }),
            });
        },

        async destroy(recordIds: string | string[]) {
            if (Array.isArray(recordIds)) {
                if (recordIds.length === 0) {
                    return { records: [] as AirtableRecord[] };
                }

                const url = buildTableUrl(tableName);
                for (const recordId of recordIds) {
                    url.searchParams.append("records[]", recordId);
                }

                return airtableRequest<{ records: AirtableRecord[] }>(url, {
                    method: "DELETE",
                });
            }

            const url = buildTableUrl(tableName, recordIds);
            return airtableRequest<AirtableRecord>(url, {
                method: "DELETE",
            });
        },
    };
}

export const airtableBase = (tableName: string) => createTableClient(tableName);

export const TABLES = {
    COMPANIES: "Companies",
    PRODUCTS: "Products",
    WARRANTIES: "Warranties",
    SERVICES: "Services",
    USERS: "Users",
    SERVICE_PARTS: "ServiceParts",
    TECHNICIANS: "Technicians",
};
