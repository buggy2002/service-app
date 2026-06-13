import "dotenv/config";
import dns from "node:dns";
import https from "node:https";

type AirtableField = {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown>;
};

type AirtableTable = {
  id: string;
  name: string;
  fields: AirtableField[];
};

type BaseSchemaResponse = {
  tables: AirtableTable[];
};

type BaseCreateResponse = {
  id: string;
  tables: AirtableTable[];
};

type CreateTableResponse = AirtableTable;

type CreateFieldResponse = AirtableField;

type ApiError = {
  error?: {
    type?: string;
    message?: string;
  };
};

type FieldConfig = Record<string, unknown>;

type TableConfig = {
  name: string;
  fields: FieldConfig[];
};

const API_HOST = "api.airtable.com";
const DATE_FORMAT = { name: "iso", format: "YYYY-MM-DD" };
const TIME_FORMAT = { name: "24hour", format: "HH:mm" };
const TIME_ZONE = "Asia/Bangkok";

const ROLE_CHOICES = ["Super Admin", "Manager", "User"];
const WARRANTY_TYPE_CHOICES = ["Warranty", "MA"];
const SERVICE_TYPE_CHOICES = ["PM", "CM", "IN_REPAIR", "OUT_REPAIR", "INSTALL", "SERVICE"];
const SERVICE_STATUS_CHOICES = ["รอดำเนินการ", "เสร็จสิ้น", "ยกเลิก"];
const TECHNICIAN_STATUS_CHOICES = ["Active", "Inactive"];

const BASE_TABLES: TableConfig[] = [
  {
    name: "Users",
    fields: [
      textField("username"),
      textField("password"),
      emailField("email"),
      singleSelectField("role", ROLE_CHOICES),
    ],
  },
  {
    name: "Companies",
    fields: [
      textField("name"),
      textField("nameSecondary"),
      textField("taxId"),
      multilineField("contactInfo"),
    ],
  },
  {
    name: "Products",
    fields: [
      textField("name"),
      textField("serialNumber"),
      dateField("purchaseDate"),
      textField("contactPerson"),
      textField("phoneNumber"),
      textField("branch"),
    ],
  },
  {
    name: "Warranties",
    fields: [
      textField("warrantyLabel"),
      singleSelectField("type", WARRANTY_TYPE_CHOICES),
      dateField("startDate"),
      dateField("endDate"),
      multilineField("notes"),
    ],
  },
  {
    name: "Services",
    fields: [
      textField("order_case"),
      singleSelectField("type", SERVICE_TYPE_CHOICES),
      dateTimeField("entryTime"),
      dateTimeField("exitTime"),
      multilineField("description"),
      textField("technician"),
      singleSelectField("status", SERVICE_STATUS_CHOICES),
      multilineField("notes"),
      multilineField("techService"),
    ],
  },
  {
    name: "ServiceParts",
    fields: [
      textField("part_no"),
      textField("order_case"),
      multilineField("details"),
      numberField("qty", 2),
    ],
  },
  {
    name: "Technicians",
    fields: [
      textField("name"),
      textField("position"),
      textField("contactNumber"),
      emailField("email"),
      multilineField("skills"),
      singleSelectField("status", TECHNICIAN_STATUS_CHOICES),
      multilineField("notes"),
    ],
  },
];

const LINK_FIELDS = [
  { table: "Companies", field: "createdBy", linkedTable: "Users" },
  { table: "Products", field: "companyId", linkedTable: "Companies" },
  { table: "Warranties", field: "productId", linkedTable: "Products" },
  { table: "Services", field: "productId", linkedTable: "Products" },
  { table: "Services", field: "warrantyId", linkedTable: "Warranties" },
  { table: "Services", field: "technicians", linkedTable: "Technicians" },
] as const;

function textField(name: string): FieldConfig {
  return { name, type: "singleLineText" };
}

function multilineField(name: string): FieldConfig {
  return { name, type: "multilineText" };
}

function emailField(name: string): FieldConfig {
  return { name, type: "email" };
}

function numberField(name: string, precision: number): FieldConfig {
  return {
    name,
    type: "number",
    options: { precision },
  };
}

function singleSelectField(name: string, choices: string[]): FieldConfig {
  return {
    name,
    type: "singleSelect",
    options: {
      choices: choices.map((choice) => ({ name: choice })),
    },
  };
}

function dateField(name: string): FieldConfig {
  return {
    name,
    type: "date",
    options: {
      dateFormat: DATE_FORMAT,
    },
  };
}

function dateTimeField(name: string): FieldConfig {
  return {
    name,
    type: "dateTime",
    options: {
      dateFormat: DATE_FORMAT,
      timeFormat: TIME_FORMAT,
      timeZone: TIME_ZONE,
    },
  };
}

function linkField(name: string, linkedTableId: string): FieldConfig {
  return {
    name,
    type: "multipleRecordLinks",
    options: {
      linkedTableId,
    },
  };
}

function formulaField(name: string, formula: string): FieldConfig {
  return {
    name,
    type: "formula",
    options: {
      formula,
    },
  };
}

function rollupField(
  name: string,
  recordLinkFieldId: string,
  fieldIdInLinkedTable: string,
  aggregationFormula: string,
): FieldConfig {
  return {
    name,
    type: "rollup",
    options: {
      recordLinkFieldId,
      fieldIdInLinkedTable,
      aggregationFormula,
    },
  };
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.split("=", 2);
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }

  return {
    dryRun: flags.has("--dry-run"),
    createBase: flags.has("--create-base"),
    strict: flags.has("--strict"),
    baseName: values.get("--base-name") ?? "Service App",
    workspaceId: values.get("--workspace-id") ?? process.env.AIRTABLE_WORKSPACE_ID,
    baseId: values.get("--base-id") ?? process.env.AIRTABLE_BASE_ID,
  };
}

function getToken() {
  const token = process.env.AIRTABLE_API_KEY;
  if (!token) {
    throw new Error("Missing AIRTABLE_API_KEY");
  }
  return token;
}

async function apiRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const body = init?.body ? JSON.stringify(init.body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname: API_HOST,
        path,
        method: init?.method ?? "GET",
        family: 4,
        lookup: dns.lookup,
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          const statusCode = response.statusCode ?? 500;
          const statusMessage = response.statusMessage ?? "Unknown Error";

          if (statusCode < 200 || statusCode >= 300) {
            let errorMessage = `${statusCode} ${statusMessage}`;
            try {
              const parsed = JSON.parse(responseBody) as ApiError;
              errorMessage = parsed.error?.message || parsed.error?.type || errorMessage;
            } catch {
              if (responseBody) errorMessage = responseBody;
            }

            reject(new Error(`Airtable API ${init?.method ?? "GET"} ${path} failed: ${errorMessage}`));
            return;
          }

          if (!responseBody) {
            resolve({} as T);
            return;
          }

          resolve(JSON.parse(responseBody) as T);
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

async function getBaseSchema(baseId: string) {
  return apiRequest<BaseSchemaResponse>(`/v0/meta/bases/${baseId}/tables`);
}

async function createBase(workspaceId: string, name: string) {
  return apiRequest<BaseCreateResponse>("/v0/meta/bases", {
    method: "POST",
    body: {
      workspaceId,
      name,
      tables: BASE_TABLES,
    },
  });
}

async function createTable(baseId: string, table: TableConfig) {
  return apiRequest<CreateTableResponse>(`/v0/meta/bases/${baseId}/tables`, {
    method: "POST",
    body: table,
  });
}

async function createField(baseId: string, tableId: string, field: FieldConfig) {
  return apiRequest<CreateFieldResponse>(`/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
    method: "POST",
    body: field,
  });
}

async function updateField(baseId: string, tableId: string, fieldId: string, body: Record<string, unknown>) {
  return apiRequest<CreateFieldResponse>(`/v0/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
    method: "PATCH",
    body,
  });
}

function findTable(schema: BaseSchemaResponse, tableName: string) {
  return schema.tables.find((table) => table.name === tableName) ?? null;
}

function findField(table: AirtableTable | null, fieldName: string) {
  return table?.fields.find((field) => field.name === fieldName) ?? null;
}

async function ensureBaseTables(baseId: string, dryRun: boolean) {
  let schema = await getBaseSchema(baseId);

  for (const tableConfig of BASE_TABLES) {
    if (findTable(schema, tableConfig.name)) {
      console.log(`Table exists: ${tableConfig.name}`);
      continue;
    }

    console.log(`Creating table: ${tableConfig.name}`);
    if (!dryRun) {
      await createTable(baseId, tableConfig);
      schema = await getBaseSchema(baseId);
    }
  }

  return schema;
}

async function ensureMissingCoreFields(baseId: string, schema: BaseSchemaResponse, dryRun: boolean) {
  for (const tableConfig of BASE_TABLES) {
    const table = findTable(schema, tableConfig.name);
    if (!table) continue;

    for (const fieldConfig of tableConfig.fields) {
      const fieldName = String(fieldConfig.name);
      if (findField(table, fieldName)) {
        continue;
      }

      console.log(`Creating field ${table.name}.${fieldName}`);
      if (!dryRun) {
        await createField(baseId, table.id, fieldConfig);
      }
    }
  }

  return dryRun ? schema : getBaseSchema(baseId);
}

async function ensureLinkFields(baseId: string, schema: BaseSchemaResponse, dryRun: boolean) {
  for (const link of LINK_FIELDS) {
    const table = findTable(schema, link.table);
    const linkedTable = findTable(schema, link.linkedTable);

    if (!table || !linkedTable) {
      console.warn(`Skipping link ${link.table}.${link.field}: table not found`);
      continue;
    }

    if (findField(table, link.field)) {
      console.log(`Link exists: ${link.table}.${link.field}`);
      continue;
    }

    console.log(`Creating link ${link.table}.${link.field} -> ${link.linkedTable}`);
    if (!dryRun) {
      await createField(baseId, table.id, linkField(link.field, linkedTable.id));
      schema = await getBaseSchema(baseId);
    }
  }

  return schema;
}

async function ensureProductComputedFields(
  baseId: string,
  schema: BaseSchemaResponse,
  dryRun: boolean,
  strict: boolean,
) {
  const productsTable = findTable(schema, "Products");
  const warrantiesTable = findTable(schema, "Warranties");

  if (!productsTable || !warrantiesTable) {
    console.warn("Skipping computed product fields: Products or Warranties table missing");
    return schema;
  }

  const endDateField = findField(warrantiesTable, "endDate");
  const reverseWarrantyLink = productsTable.fields.find(
    (field) =>
      field.type === "multipleRecordLinks" &&
      field.options &&
      String((field.options as { linkedTableId?: string }).linkedTableId || "") === warrantiesTable.id,
  );

  if (!endDateField || !reverseWarrantyLink) {
    console.warn("Skipping rollup latestWarrantyEndDate: reverse warranty link or Warranties.endDate not found");
  } else if (!findField(productsTable, "latestWarrantyEndDate")) {
    const field = rollupField("latestWarrantyEndDate", reverseWarrantyLink.id, endDateField.id, "MAX(values)");
    console.log("Creating field Products.latestWarrantyEndDate");

    if (!dryRun) {
      try {
        await createField(baseId, productsTable.id, field);
        schema = await getBaseSchema(baseId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (strict) throw error;
        console.warn(`Could not create Products.latestWarrantyEndDate automatically: ${message}`);
      }
    }
  }

  const formulas = [
    formulaField(
      "warrantyStatus",
      "IF({latestWarrantyEndDate}, IF(IS_BEFORE({latestWarrantyEndDate}, TODAY()), '❌ Expired', '✅ Active'), '⚠️ No Warranty')",
    ),
    formulaField(
      "isNearExpiry",
      "IF(AND({latestWarrantyEndDate}, DATETIME_DIFF({latestWarrantyEndDate}, TODAY(), 'days') >= 0, DATETIME_DIFF({latestWarrantyEndDate}, TODAY(), 'days') <= 30), TRUE(), FALSE())",
    ),
  ];

  for (const formula of formulas) {
    const currentTable = findTable(schema, "Products");
    if (!currentTable) break;

    const existing = findField(currentTable, String(formula.name));
    if (!existing) {
      console.log(`Creating field Products.${String(formula.name)}`);
      if (!dryRun) {
        try {
          await createField(baseId, currentTable.id, formula);
          schema = await getBaseSchema(baseId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (strict) throw error;
          console.warn(`Could not create Products.${String(formula.name)} automatically: ${message}`);
        }
      }
      continue;
    }

    const currentFormula = (existing.options as { formula?: string } | undefined)?.formula;
    const targetFormula = (formula.options as { formula: string }).formula;
    if (currentFormula === targetFormula) {
      continue;
    }

    console.log(`Updating formula Products.${String(formula.name)}`);
    if (!dryRun) {
      try {
        await updateField(baseId, currentTable.id, existing.id, {
          options: { formula: targetFormula },
        });
        schema = await getBaseSchema(baseId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (strict) throw error;
        console.warn(`Could not update Products.${String(formula.name)} automatically: ${message}`);
      }
    }
  }

  return schema;
}

function printSummary(baseId: string, schema: BaseSchemaResponse) {
  console.log("");
  console.log(`Airtable base ready: ${baseId}`);
  console.log("Tables:");
  for (const table of schema.tables) {
    console.log(`- ${table.name}: ${table.fields.length} fields`);
  }
}

function printUsageHint() {
  console.log("Usage:");
  console.log("- Existing base: pnpm airtable:setup");
  console.log("- New base: pnpm airtable:setup --create-base --workspace-id wspXXXXXXXXXXXXXX --base-name \"Service App\"");
  console.log("- Dry run: pnpm airtable:setup --dry-run");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.createBase && !args.workspaceId) {
    throw new Error("Missing workspace id. Pass --workspace-id or set AIRTABLE_WORKSPACE_ID.");
  }

  let baseId = args.baseId;

  if (args.createBase) {
    console.log(`Creating base "${args.baseName}" in workspace ${args.workspaceId}`);
    if (!args.dryRun) {
      const created = await createBase(args.workspaceId!, args.baseName);
      baseId = created.id;
      console.log(`Created base: ${baseId}`);
    } else {
      baseId = baseId || "appDryRunPlaceholder";
    }
  }

  if (!baseId) {
    throw new Error("Missing base id. Set AIRTABLE_BASE_ID or pass --base-id, or use --create-base.");
  }

  if (args.dryRun) {
    console.log("Dry run enabled. No changes will be sent to Airtable.");
  }

  let schema = args.dryRun && args.createBase
    ? { tables: BASE_TABLES.map((table, index) => ({ id: `tblDryRun${index}`, name: table.name, fields: [] })) }
    : await ensureBaseTables(baseId, args.dryRun);

  schema = await ensureMissingCoreFields(baseId, schema, args.dryRun);
  schema = await ensureLinkFields(baseId, schema, args.dryRun);
  schema = await ensureProductComputedFields(baseId, schema, args.dryRun, args.strict);

  if (!args.dryRun) {
    schema = await getBaseSchema(baseId);
  }

  printSummary(baseId, schema);
  console.log("");
  console.log("If Products.latestWarrantyEndDate could not be created automatically, add it manually as a rollup field:");
  console.log("- name: latestWarrantyEndDate");
  console.log("- source: reverse link from Products to Warranties");
  console.log("- rolled field: Warranties.endDate");
  console.log("- formula: MAX(values)");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    printUsageHint();
    process.exit(1);
  });
