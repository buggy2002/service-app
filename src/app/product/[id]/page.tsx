import { dataProvider } from "@/db/provider";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Package,
  ShieldCheck,
  ClipboardList,
  Calendar,
  ArrowLeft,
  Clock,
  History,
  CheckCircle2,
  User,
  Printer,
} from "lucide-react";
import Link from "next/link";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { AddWarrantyDialog } from "@/components/AddWarrantyDialog";
import AddServiceDialog from "@/components/AddServiceDialog";
import { EditServiceDialog } from "@/components/EditServiceDialog";
import { EditProductDialog } from "@/components/EditProductDialog";
import { PrintWarrantyButton } from "@/components/PrintWarrantyButton";
import { EditWarrantyDialog } from "@/components/EditWarrantyDialog";
import {
  TProduct,
  TCompany,
  TWarranty,
  IServiceWithWarranty,
} from "@/types/database";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id: productId } = await params;
  const canCreateWarranty = hasPermission(session.role, "warranty", "create");
  const product = (await dataProvider.getProductById(productId)) as TProduct;
  if (!product) notFound();

  const company = (await dataProvider.getCompanyById(
    String(product.companyId),
  )) as TCompany;

  const productWarranties = (await dataProvider.getWarrantiesByProduct(
    productId,
  )) as TWarranty[];

  // Check for active warranty
  const now = new Date();

  const activeWarranty = productWarranties.find(
    (w) => new Date(w.startDate) <= now && new Date(w.endDate) >= now,
  );

  const productServicesRaw = await dataProvider.getServicesByProduct(productId);
  const allTechnicians = await dataProvider.getTechnicians();

  // Normalize data structure for UI and sort by date ascending
  const productServices = productServicesRaw
    .map((item: IServiceWithWarranty) => ({
      service: item.service,
      warranty: item.warranty || {},
    }))
    .sort(
      (a, b) =>
        new Date(a.service.entryTime).getTime() -
        new Date(b.service.entryTime).getTime(),
    );

  return (
    <div className="container mx-auto py-10 space-y-8 px-4">
      <div>
        <Link
          href={`/company/${product.companyId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับไปที่ {company?.name}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold">
                  {product.name}
                </CardTitle>
                <p className="text-muted-foreground">
                  Serial: {product.serialNumber}
                </p>
              </div>
            </div>
            <EditProductDialog product={product} />
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-slate-50 border">
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
                วันที่ซื้อ
              </p>
              <p className="font-medium">{formatDate(product.purchaseDate)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border">
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
                สาขา / สถานที่ติดตั้ง
              </p>
              <p className="font-medium">{product.branch || "ไม่ได้ระบุ"}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border">
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
                ผู้ติดต่อ
              </p>
              <p className="font-medium">
                {product.contactPerson || "ไม่ได้ระบุ"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 shadow-xl shadow-slate-200/50 border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3 text-primary">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl">สถานะการรับประกัน / MA</CardTitle>
            </div>
            {canCreateWarranty ? <AddWarrantyDialog productId={productId} /> : null}
          </CardHeader>
          <CardContent className="p-0">
            {productWarranties.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-muted-foreground">
                  ยังไม่มีข้อมูลความคุ้มครอง
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 text-left">ประเภท</th>
                      <th className="px-6 py-3 text-left">วันที่เริ่มต้น</th>
                      <th className="px-6 py-3 text-left">วันที่สิ้นสุด</th>
                      <th className="px-6 py-3 text-center">สถานะ</th>
                      <th className="px-6 py-3 text-right">เอกสาร</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...productWarranties]
                      .sort(
                        (a, b) =>
                          new Date(b.endDate).getTime() -
                          new Date(a.endDate).getTime(),
                      )
                      .map((w) => {
                        const wStart = new Date(w.startDate);
                        const wEnd = new Date(w.endDate);
                        const isActive = wStart <= now && wEnd >= now;
                        const isExpired = wEnd < now;

                        return (
                          <EditWarrantyDialog
                            key={w.id}
                            warranty={w}
                            productId={productId}
                            trigger={
                              <tr
                                className={cn(
                                  "transition-colors cursor-pointer group",
                                  isActive
                                    ? "bg-primary/5 font-medium"
                                    : "hover:bg-slate-50/50",
                                )}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        isActive
                                          ? "bg-primary animate-pulse"
                                          : isExpired
                                            ? "bg-slate-300"
                                            : "bg-blue-400",
                                      )}
                                    />
                                    {w.type}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600">
                                  {formatDate(wStart)}
                                </td>
                                <td className="px-6 py-4 text-slate-600">
                                  {formatDate(wEnd)}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span
                                    className={cn(
                                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                      isActive
                                        ? "bg-green-100 text-green-700"
                                        : isExpired
                                          ? "bg-red-50 text-red-600"
                                          : "bg-blue-50 text-blue-600",
                                    )}
                                  >
                                    {isActive
                                      ? "ใช้งานอยู่"
                                      : isExpired
                                        ? "หมดอายุ"
                                        : "รอเริ่ม"}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <PrintWarrantyButton
                                    warranty={w}
                                    product={product}
                                    company={company}
                                  />
                                </td>
                              </tr>
                            }
                          />
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ClipboardList className="w-6 h-6" />
            </div>
            ประวัติการซ่อมและบริการ
          </h2>
          <AddServiceDialog
            productId={productId}
            warrantyId={activeWarranty ? String(activeWarranty.id) : undefined}
          />
        </div>

        <div className="space-y-4">
          {productServices.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 border border-dashed rounded-2xl">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                ไม่พบประวัติการรับบริการ
              </p>
            </div>
          ) : (
            productServices.map(({ service, warranty }) => {
              const isFuture =
                new Date(service.entryTime) > now &&
                service.status !== "เสร็จสิ้น";
              const isCompleted = service.status === "เสร็จสิ้น";

              let displayTechnician = service.technician;
              if (service.technicians && service.technicians.length > 0) {
                const names = allTechnicians
                  .filter((t) => service.technicians?.includes(String(t.id)))
                  .map((t) => t.name);
                if (names.length > 0) displayTechnician = names.join(", ");
              }

              return ( 
                <EditServiceDialog
                  key={service.id}
                  service={service}
                  warrantyId={warranty.id ? String(warranty.id) : undefined}
                  trigger={
                    <Card
                      className={cn(
                        "overflow-hidden border-slate-100 hover:shadow-md transition-all cursor-pointer hover:border-primary/30",
                        isFuture && "bg-slate-50/40 border-dashed border-2",
                        isCompleted && "bg-white border-solid",
                      )}
                    >
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div
                            className={cn(
                              "w-2 md:w-3",
                              isCompleted
                                ? "bg-green-500"
                                : isFuture
                                  ? "bg-amber-400"
                                  : service.type === "PM"
                                    ? "bg-blue-500"
                                    : service.type === "CM"
                                      ? "bg-red-500"
                                      : "bg-slate-400",
                            )}
                          />
                          <div className="flex-1 p-6 flex flex-col md:flex-row justify-between gap-6">
                            <div className="flex gap-4">
                              <div
                                className={cn(
                                  "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                                  isCompleted
                                    ? "bg-green-50 text-green-600"
                                    : isFuture
                                      ? "bg-amber-50 text-amber-600"
                                      : service.type === "PM"
                                        ? "bg-blue-50 text-blue-600"
                                        : service.type === "CM"
                                          ? "bg-red-50 text-red-600"
                                          : "bg-slate-50 text-slate-600",
                                )}
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-6 h-6" />
                                ) : isFuture ? (
                                  <Calendar className="w-6 h-6" />
                                ) : (
                                  <History className="w-6 h-6" />
                                )}
                              </div>
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
                                      isCompleted
                                        ? "bg-green-100 text-green-700"
                                        : isFuture
                                          ? "bg-amber-100 text-amber-700"
                                          : service.type === "PM"
                                            ? "bg-blue-100 text-blue-700"
                                            : service.type === "CM"
                                              ? "bg-red-100 text-red-700"
                                              : "bg-slate-100 text-slate-700",
                                    )}
                                  >
                                    {service.status ||
                                      (isFuture
                                        ? `Scheduled ${service.type}`
                                        : service.type)}
                                  </span>
                                  <p className="font-bold text-lg flex items-center gap-2 flex-wrap">
                                    {isFuture
                                      ? `แผนการรับบริการ ${service.type}`
                                      : `บันทึกการรับบริการ (${service.type})`}
                                    {service.orderCase && (
                                      <span className="text-sm font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 shrink-0">
                                        #{service.orderCase}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <p className="text-slate-600 break-all leading-relaxed">
                                  {(service.description?.length || 0) > 70
                                    ? `${service.description?.substring(0, 70)}...`
                                    : service.description ||
                                      "ไม่มีรายละเอียดระบุไว้"}
                                </p>
                                {displayTechnician && (
                                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mt-1">
                                    <User className="w-4 h-4 text-primary/60" />{" "}
                                    ผู้ดำเนินงาน: {displayTechnician}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>
                                    ภายใต้ความคุ้มครอง: {warranty.type}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col justify-center gap-2 bg-slate-50/80 p-4 rounded-xl border border-slate-100 min-w-[240px]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-blue-500" />{" "}
                                  {isFuture ? "วันนัดหมาย:" : "เวลาเข้า:"}
                                </span>
                                <span className="font-semibold">
                                  {formatDateTime(service.entryTime)}
                                </span>
                              </div>
                              {service.exitTime && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-red-400" />{" "}
                                    เวลาออก:
                                  </span>
                                  <span className="font-semibold">
                                    {formatDateTime(service.exitTime)}
                                  </span>
                                </div>
                              )}
                              <div className="mt-1 flex gap-2">
                                {isFuture ? (
                                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">
                                    รอรับบริการ
                                  </span>
                                ) : isCompleted ? (
                                  <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 text-[10px] font-bold uppercase">
                                    ดำเนินการเสร็จสิ้น
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                                    บันทึกประวัติ
                                  </span>
                                )}
                                <Link
                                  href={`/service/print/${service.id}`}
                                  target="_blank"
                                  className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] font-bold uppercase hover:bg-slate-50 transition-colors"
                                >
                                  <Printer className="w-3 h-3" /> พิมพ์ใบงาน
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
