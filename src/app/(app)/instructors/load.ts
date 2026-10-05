import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import type { InstructorFormValue } from "./instructor-form";

/** เจ้าหน้าที่ที่เลือกเป็นวิทยากรภายในได้ */
export function staffOptions(db: DB) {
  return db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName, p: schema.users.prefix, position: schema.users.position })
    .from(schema.users).where(and(eq(schema.users.status, "active"), isNull(schema.users.deletedAt))).orderBy(asc(schema.users.sortOrder)).all()
    .map((u) => ({ id: u.id, name: `${u.p ?? ""}${u.f} ${u.l}`, position: u.position }));
}

export const emptyInstructor = (kind: "internal" | "external" = "external"): InstructorFormValue => ({
  kind, userId: null, externalType: kind === "external" ? "gov" : null, prefix: "", firstName: "", lastName: "", position: "", organization: "", phone: "", email: "", nationalId: "",
  addrHouseNo: "", addrMoo: "", addrSoi: "", addrRoad: "", addrSubdistrictId: null, addrSubdistrict: "", addrDistrict: "", addrProvince: "", addrPostcode: "",
  payeeType: "person", companyName: "", bank: "", bankBranch: "", accountType: "", accountName: "", accountNo: "", notifyChannel: "", bankBookReceived: false, bankBookReceivedDate: "",
  expertise: "", note: "",
});
