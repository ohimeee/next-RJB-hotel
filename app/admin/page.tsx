import { redirect } from "next/navigation";

export default function AdminPage() {
  // Whenever someone visits /admin, redirect them immediately to /admin/dashboard
  redirect("/admin/dashboard");
}