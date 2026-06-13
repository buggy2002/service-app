# Airtable Setup For This Project

โปรเจกต์นี้ใช้ Airtable Base 1 ชุด และต้องมี 7 tables ตามชื่อด้านล่างแบบตรงตัว:

- `Users`
- `Companies`
- `Products`
- `Warranties`
- `Services`
- `ServiceParts`
- `Technicians`

ถ้าชื่อ table หรือ field ไม่ตรงกับด้านล่าง โค้ดจะ query ไม่เจอทันที

## Users

| Field | Type | Required | Notes |
|---|---|---:|---|
| `username` | Single line text | Yes | ใช้ login |
| `password` | Single line text | Yes | เก็บ hash จาก `bcryptjs` |
| `email` | Email | No | |
| `role` | Single select | No | แนะนำ values: `Super Admin`, `Manager`, `User` |
| `createdAt` | Created time | No | ใช้แทน timestamp |

## Companies

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | Single line text | Yes | ชื่อบริษัทหลัก |
| `nameSecondary` | Single line text | No | ชื่อไทย/ชื่อรอง |
| `taxId` | Single line text | No | เลขผู้เสียภาษี |
| `contactInfo` | Long text | No | ที่อยู่/เบอร์/อีเมล |
| `createdBy` | Link to another record | No | Link ไป `Users`, allow 1 record |
| `createdAt` | Created time | No | |

## Products

| Field | Type | Required | Notes |
|---|---|---:|---|
| `companyId` | Link to another record | No | Link ไป `Companies`, allow 1 record |
| `name` | Single line text | Yes | ชื่อสินค้า/อุปกรณ์ |
| `serialNumber` | Single line text | Yes | |
| `purchaseDate` | Date | No | เปิด time ได้หรือไม่ก็ได้ |
| `contactPerson` | Single line text | No | |
| `phoneNumber` | Single line text | No | |
| `branch` | Single line text | No | |
| `createdAt` | Created time | No | |
| `latestWarrantyEndDate` | Rollup | Yes | ดูสูตรด้านล่าง |
| `warrantyStatus` | Formula | Yes | ดูสูตรด้านล่าง |
| `isNearExpiry` | Formula | Yes | ดูสูตรด้านล่าง |

### Computed fields in Products

1. สร้าง field ใน `Companies` จาก `Products` ก่อนตาม Airtable ปกติ
2. สร้าง field link ใน `Warranties.productId` ให้ link กลับมาที่ `Products`
3. ใน `Products.latestWarrantyEndDate`

- Type: `Rollup`
- Linked record field: ใช้ความสัมพันธ์จาก `Warranties`
- Field to roll up: `endDate`
- Aggregation formula:

```text
MAX(values)
```

4. ใน `Products.warrantyStatus`

- Type: `Formula`
- Formula:

```text
IF(
  {latestWarrantyEndDate},
  IF(
    IS_BEFORE({latestWarrantyEndDate}, TODAY()),
    "❌ Expired",
    "✅ Active"
  ),
  "⚠️ No Warranty"
)
```

5. ใน `Products.isNearExpiry`

- Type: `Formula`
- Formula:

```text
IF(
  AND(
    {latestWarrantyEndDate},
    DATETIME_DIFF({latestWarrantyEndDate}, TODAY(), 'days') >= 0,
    DATETIME_DIFF({latestWarrantyEndDate}, TODAY(), 'days') <= 30
  ),
  TRUE(),
  FALSE()
)
```

## Warranties

| Field | Type | Required | Notes |
|---|---|---:|---|
| `productId` | Link to another record | Yes | Link ไป `Products`, allow 1 record |
| `startDate` | Date | Yes | |
| `endDate` | Date | Yes | |
| `type` | Single select | No | แนะนำ values: `Warranty`, `MA` |
| `notes` | Long text | No | |
| `createdAt` | Created time | No | |

## Services

| Field | Type | Required | Notes |
|---|---|---:|---|
| `productId` | Link to another record | No | Link ไป `Products`, allow 1 record |
| `warrantyId` | Link to another record | No | Link ไป `Warranties`, allow 1 record |
| `type` | Single select | Yes | ดู values ด้านล่าง |
| `entryTime` | Date and time | Yes | |
| `exitTime` | Date and time | No | |
| `description` | Long text | No | อาการเสีย/รายละเอียด |
| `technician` | Single line text | No | legacy field, มีไว้ได้แม้โค้ดใหม่แทบไม่ใช้ |
| `status` | Single select | No | แนะนำ values ด้านล่าง |
| `notes` | Long text | No | |
| `techService` | Long text | No | รายละเอียดการเข้าซ่อม |
| `order_case` | Single line text | No | เลขเคส เช่น `PM_000001` |
| `technicians` | Link to another record | No | Link ไป `Technicians`, allow multiple records |
| `createdAt` | Created time | No | |

### Recommended values for `Services.type`

- `PM`
- `CM`
- `IN_REPAIR`
- `OUT_REPAIR`
- `INSTALL`
- `SERVICE`

### Recommended values for `Services.status`

- `รอดำเนินการ`
- `เสร็จสิ้น`
- `ยกเลิก`

## ServiceParts

| Field | Type | Required | Notes |
|---|---|---:|---|
| `order_case` | Single line text | No | ใช้ผูกกับ `Services.order_case` |
| `part_no` | Single line text | No | |
| `details` | Long text | No | |
| `qty` | Number | No | decimal ได้ |
| `createdAt` | Created time | No | |

## Technicians

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | Single line text | Yes | |
| `position` | Single line text | No | |
| `contactNumber` | Single line text | No | |
| `email` | Email | No | |
| `skills` | Long text | No | โค้ดตอนนี้ยังไม่ค่อยใช้ |
| `status` | Single select | No | แนะนำ values: `Active`, `Inactive` |
| `notes` | Long text | No | |
| `createdAt` | Created time | No | |

## Important Notes

- field link ทั้งหมดใน Airtable จะถูกอ่านเป็น array ของ record ids ในโค้ด
- `Products.companyId`, `Warranties.productId`, `Services.productId`, `Services.warrantyId`, `Companies.createdBy` ควร allow แค่ 1 record
- `Services.technicians` ต้อง allow multiple records
- `Services.order_case` และ `ServiceParts.order_case` ต้องสะกดแบบมี underscore
- `Services.techService` ต้องเป็น camelCase นี้ตรง ๆ
- Airtable จะสร้าง reverse link fields ให้อัตโนมัติ เช่น `Products`, `Services`, `Companies` ในอีกฝั่งของ relation
- `createdAt` เป็น field ที่มีประโยชน์ แต่ Airtable metadata API ตอนนี้ยังไม่รองรับการสร้าง `createdTime` field อัตโนมัติจาก script นี้
- ถ้าอยากทดสอบ connection หลังสร้างเสร็จ ให้รัน `npx tsx test-connection.ts`

## API Token Permissions

token ของ Airtable ต้องมีสิทธิ์อย่างน้อย:

- `data.records:read`
- `data.records:write`
- `schema.bases:read`
- `schema.bases:write`
- access ถึง base ที่ใส่ใน `AIRTABLE_BASE_ID`

ถ้า token ไม่มีสิทธิ์หรือยังไม่ได้ share base ให้ token จะเจอ error:

```text
Invalid permissions, or the requested model was not found.
```

## Auto Setup Script

มี script สำหรับสร้าง schema ผ่าน Airtable Web API แล้ว:

```bash
pnpm airtable:setup
```

กรณีสร้าง base ใหม่:

```bash
pnpm airtable:setup --create-base --workspace-id wspxxxxxxxxxxxxxx --base-name "Service App"
```

โหมดจำลองก่อนยิงจริง:

```bash
pnpm airtable:setup --dry-run
```

หมายเหตุ:

- script จะสร้าง core tables/fields และ link fields ให้อัตโนมัติ
- script จะสร้าง reverse link fields ทางอ้อมผ่าน Airtable อัตโนมัติด้วย
- field คำนวณ `Products.latestWarrantyEndDate` จะพยายามสร้างผ่าน API แบบ best-effort
- ถ้า Airtable API ไม่ยอมรับ rollup payload ตัวนี้ script จะบอกให้สร้าง field นี้เองใน UI ต่อ
- `createdAt` ไม่ได้ถูกสร้างโดย script เพราะ Airtable API ยังไม่รองรับการสร้าง `createdTime` field ใน endpoint นี้

## Seed Data

มี script สำหรับ seed ข้อมูลตัวอย่างจาก [test/new-data.json](/home/alpha/project-me/service-app/test/new-data.json:1):

```bash
pnpm airtable:seed
```

options ที่ใช้บ่อย:

```bash
pnpm airtable:seed --limit 25
pnpm airtable:seed --dry-run
pnpm airtable:seed --no-services
pnpm airtable:seed --file test/new-data.json --limit 200
```

สิ่งที่ script ทำ:

- สร้าง user seed ชื่อ `seed-admin` ถ้ายังไม่มี
- สร้าง technicians ตัวอย่าง 3 คนถ้ายังไม่มี
- import `Companies`, `Products`, `Warranties` จากไฟล์ JSON
- สร้าง `Services` demo บางส่วนเพื่อให้หน้าจอไม่โล่ง
- กันข้อมูลซ้ำระดับพื้นฐานสำหรับ company/product/warranty/service
