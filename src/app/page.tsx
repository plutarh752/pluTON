import { redirect } from "next/navigation";

// Главная → Deal Finder (основной экран).
export default function Home() {
  redirect("/deals");
}
