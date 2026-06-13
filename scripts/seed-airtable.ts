import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";

import { dataProvider } from "@/db/provider";
import type {
  TCompany,
  TProduct,
  TServicePart,
  TTechnician,
  TUser,
  TWarranty,
} from "@/types/database";

type ImportRow = {
  row_number?: number;
  id?: string;
  "ชื่อลูกค้า"?: string;
  "สินค้า"?: string;
  "เลขที่ซีเรียลสินค้า"?: string;
  "วันที่ซื้อ"?: string | number;
  "ผู้ติดต่อ"?: string;
  "สถานะการรับประกัน"?: string;
  "วันที่สิ้นสุดการรับประกัน"?: string | number;
  "สถานะ PM"?: string;
  "PM จนถึงวันที่"?: string | number;
  "สาขา"?: string;
};

type Args = {
  file: string;
  limit: number;
  dryRun: boolean;
  withServices: boolean;
};

const DEFAULT_FILE = "test/new-data.json";
const DEFAULT_LIMIT = 50;
const SEED_USERNAME = "seed-admin";
const SEED_PASSWORD = "admin1234";
const SEED_EMAIL = "seed-admin@example.com";
const SEED_ROLE = "Super Admin";

const SAMPLE_TECHNICIANS = [
  {
    name: "Somchai Tech",
    position: "Lead Technician",
    email: "somchai.tech@example.com",
    contactNumber: "081-000-0001",
    status: "Active",
    notes: "Seed data",
  },
  {
    name: "Nida Support",
    position: "Support Engineer",
    email: "nida.support@example.com",
    contactNumber: "081-000-0002",
    status: "Active",
    notes: "Seed data",
  },
  {
    name: "Anan Field",
    position: "Field Service",
    email: "anan.field@example.com",
    contactNumber: "081-000-0003",
    status: "Active",
    notes: "Seed data",
  },
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    file: DEFAULT_FILE,
    limit: DEFAULT_LIMIT,
    dryRun: false,
    withServices: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--no-services") {
      args.withServices = false;
      continue;
    }

    if (arg === "--file" && argv[index + 1]) {
      args.file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      const limit = Number(argv[index + 1]);
      if (!Number.isNaN(limit) && limit > 0) {
        args.limit = limit;
      }
      index += 1;
    }
  }

  return args;
}

function parseThaiDate(dateVal: unknown): Date | null {
  if (dateVal === null || dateVal === undefined || dateVal === "") return null;

  if (typeof dateVal === "number") {
    return new Date((dateVal - 25569) * 86400 * 1000);
  }

  const dateStr = String(dateVal).trim();
  if (!dateStr || dateStr === "-") return null;

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const rawYear = parseInt(parts[2], 10);
    if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(rawYear)) {
      const year = rawYear > 2400 ? rawYear - 543 : rawYear;
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

async function loadRows(filePath: string): Promise<ImportRow[]> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(content) as ImportRow[];
}

async function ensureSeedUser(dryRun: boolean): Promise<TUser | { id: string; username: string; role: string }> {
  const existing = await dataProvider.findUserByUsername(SEED_USERNAME);
  if (existing) {
    return existing as TUser;
  }

  if (dryRun) {
    console.log(`Would create seed user ${SEED_USERNAME}`);
    return { id: "dry-run-user", username: SEED_USERNAME, role: SEED_ROLE };
  }

  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);
  const created = await dataProvider.createUser({
    username: SEED_USERNAME,
    password: hashedPassword,
    email: SEED_EMAIL,
    role: SEED_ROLE,
  });

  if (!created) {
    throw new Error("Failed to create seed user");
  }

  console.log(`Created seed user ${SEED_USERNAME} / ${SEED_PASSWORD}`);
  return created as TUser;
}

async function ensureTechnicians(dryRun: boolean): Promise<Array<TTechnician | { id: string; name: string }>> {
  const existing = await dataProvider.getTechnicians();
  const result: Array<TTechnician | { id: string; name: string }> = [];

  for (const sample of SAMPLE_TECHNICIANS) {
    const found = existing.find((tech) => tech.name === sample.name);
    if (found) {
      result.push(found);
      continue;
    }

    if (dryRun) {
      console.log(`Would create technician ${sample.name}`);
      result.push({ id: `dry-run-${sample.name}`, name: sample.name });
      continue;
    }

    const created = await dataProvider.createTechnician(sample);
    console.log(`Created technician ${sample.name}`);
    result.push(created as TTechnician);
  }

  return result;
}

async function findExistingProduct(companyId: string | number, name: string, serialNumber: string) {
  const products = await dataProvider.getProductsByCompany(companyId);
  return products.find((product) => {
    const typedProduct = product as TProduct;
    const sameName = String(typedProduct.name || "").trim() === name.trim();
    const sameSerial = String(typedProduct.serialNumber || "").trim() === serialNumber.trim();
    return sameName && sameSerial;
  }) as TProduct | undefined;
}

async function ensureCompany(
  companyName: string,
  createdBy: string | number,
  dryRun: boolean,
): Promise<TCompany | { id: string; name: string }> {
  const existing = await dataProvider.findCompanyByName(companyName);
  if (existing) {
    return existing as TCompany;
  }

  if (dryRun) {
    console.log(`Would create company ${companyName}`);
    return { id: `dry-${companyName}`, name: companyName };
  }

  const created = await dataProvider.createCompany({
    name: companyName,
    createdBy,
  });

  console.log(`Created company ${companyName}`);
  return created as TCompany;
}

async function ensureProduct(row: ImportRow, companyId: string | number, dryRun: boolean) {
  const productName = (row["สินค้า"] || "-").trim();
  const serialNumber = String(row["เลขที่ซีเรียลสินค้า"] || "-").trim() || "-";
  const branch = (row["สาขา"] || "-").trim() || "-";
  const contactPerson = (row["ผู้ติดต่อ"] || "-").trim() || "-";
  const purchaseDate = parseThaiDate(row["วันที่ซื้อ"]);

  const existing = await findExistingProduct(companyId, productName, serialNumber);
  if (existing) {
    return { product: existing as TProduct, created: false };
  }

  if (dryRun) {
    console.log(`Would create product ${productName} / ${serialNumber}`);
    return {
      product: {
        id: `dry-${serialNumber}`,
        name: productName,
        serialNumber,
        companyId,
      } as unknown as TProduct,
      created: true,
    };
  }

  const created = await dataProvider.createProduct({
    companyId,
    name: productName,
    serialNumber,
    contactPerson,
    purchaseDate: formatDateOnly(purchaseDate),
    branch,
  });

  return { product: created as TProduct, created: true };
}

async function ensureWarranty(row: ImportRow, productId: string | number, dryRun: boolean) {
  const warrantyStatus = String(row["สถานะการรับประกัน"] || "").trim();
  const warrantyEndDate = parseThaiDate(row["วันที่สิ้นสุดการรับประกัน"]);
  const purchaseDate = parseThaiDate(row["วันที่ซื้อ"]);
  const pmStatus = String(row["สถานะ PM"] || "").trim();

  if (!warrantyStatus || !warrantyEndDate) {
    return { warranty: null as TWarranty | null, created: false };
  }

  const existing = await dataProvider.getWarrantiesByProduct(productId);
  const isoEndDate = warrantyEndDate.toISOString().slice(0, 10);
  const found = existing.find((warranty) => {
    const typedWarranty = warranty as TWarranty;
    const sameType = String(typedWarranty.type || "") === "Warranty";
    const sameEndDate = new Date(typedWarranty.endDate).toISOString().slice(0, 10) === isoEndDate;
    return sameType && sameEndDate;
  });

  if (found) {
    return { warranty: found as TWarranty, created: false };
  }

  if (dryRun) {
    console.log(`Would create warranty ending ${isoEndDate}`);
    return { warranty: null as TWarranty | null, created: true };
  }

  const created = await dataProvider.createWarranty({
    productId,
    startDate: formatDateOnly(purchaseDate) || formatDateOnly(new Date())!,
    endDate: formatDateOnly(warrantyEndDate)!,
    type: "Warranty",
    notes: `seed import${pmStatus ? ` | PM Status: ${pmStatus}` : ""}`,
  });

  return { warranty: created as TWarranty, created: true };
}

async function ensureDemoServices(
  products: TProduct[],
  technicians: Array<TTechnician | { id: string; name: string }>,
  dryRun: boolean,
) {
  const targets = products.slice(0, 5);
  let createdServices = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const product = targets[index];
    const existing = await dataProvider.getServicesByProduct(product.id);
    const alreadySeeded = existing.some((item) =>
      String(item.service.description || "").includes("Seed demo service"),
    );

    if (alreadySeeded) {
      continue;
    }

    const start = new Date();
    start.setDate(start.getDate() - index);
    start.setHours(9, 0, 0, 0);

    const end = new Date(start);
    end.setHours(11, 30, 0, 0);

    const selectedTechnicians = technicians
      .slice(0, Math.min(2, technicians.length))
      .map((tech) => String(tech.id));

    const parts: Partial<TServicePart>[] = [
      {
        partNo: `SEED-PART-${index + 1}`,
        details: "Seed replacement part",
        qty: 1,
      } as unknown as TServicePart,
    ];

    if (dryRun) {
      console.log(`Would create demo service for product ${product.id}`);
      createdServices += 1;
      continue;
    }

    await dataProvider.createService({
      productId: String(product.id),
      warrantyId: null,
      type: index % 2 === 0 ? "CM" : "SERVICE",
      entryTime: start.toISOString(),
      exitTime: end.toISOString(),
      description: `Seed demo service #${index + 1}`,
      techService: "Initial seeded service visit",
      status: "เสร็จสิ้น",
      technicians: selectedTechnicians,
      parts,
    });

    createdServices += 1;
  }

  return createdServices;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.env.DB_TYPE !== "airtable") {
    throw new Error("This seed script is intended for DB_TYPE=airtable");
  }

  const rows = (await loadRows(args.file)).slice(0, args.limit);
  console.log(`Loaded ${rows.length} rows from ${args.file}`);

  const seedUser = await ensureSeedUser(args.dryRun);
  const technicians = await ensureTechnicians(args.dryRun);

  let companiesCreated = 0;
  let productsCreated = 0;
  let warrantiesCreated = 0;
  const seededProducts: TProduct[] = [];

  for (const row of rows) {
    const companyName = String(row["ชื่อลูกค้า"] || "-").trim() || "-";
    const companyBefore = await dataProvider.findCompanyByName(companyName);
    const company = await ensureCompany(companyName, seedUser.id, args.dryRun);
    if (!companyBefore) companiesCreated += 1;

    const productResult = await ensureProduct(row, company.id, args.dryRun);
    if (productResult.created) productsCreated += 1;
    seededProducts.push(productResult.product);

    const warrantyResult = await ensureWarranty(row, productResult.product.id, args.dryRun);
    if (warrantyResult.created) warrantiesCreated += 1;
  }

  let servicesCreated = 0;
  if (args.withServices) {
    servicesCreated = await ensureDemoServices(seededProducts, technicians, args.dryRun);
  }

  console.log("");
  console.log("Seed summary");
  console.log(`- rows processed: ${rows.length}`);
  console.log(`- companies created: ${companiesCreated}`);
  console.log(`- products created: ${productsCreated}`);
  console.log(`- warranties created: ${warrantiesCreated}`);
  console.log(`- demo services created: ${servicesCreated}`);
  console.log(`- seed user: ${SEED_USERNAME}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
