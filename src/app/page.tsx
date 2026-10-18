import { ProfilePicker } from "@/components/layout/ProfilePicker";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <header className="space-y-2">
        {/* Decorative: the h1 below names the product. A plain img, as with the donor photo, so no image proxy is involved. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/annona-logo-512.png" alt="" width={256} height={170} className="h-auto w-64 max-w-full" />
        <h1 className="text-3xl font-bold text-slate-900">Annona</h1>
        <p className="text-slate-800">Surplus-food coordination: AI describes, humans verify, the backend enforces.</p>
        <p className="rounded border border-slate-500 bg-slate-50 p-3 text-sm text-slate-900">
          <strong>Synthetic demo.</strong> All donors, recipients and couriers are fake. This prototype is not
          certified or reviewed for food-safety compliance, and a photo or AI output never establishes food safety
          or allergen status.
        </p>
      </header>
      <ProfilePicker />
    </main>
  );
}
