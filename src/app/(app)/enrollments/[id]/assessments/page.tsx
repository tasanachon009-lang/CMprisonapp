import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/enrollments/[id]/assessments">) {
  const { id } = await params;
  redirect(`/enrollments/${id}`);
}
