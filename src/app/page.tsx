import { ListChecks, Sparkles, UserCheck } from "lucide-react";
import { ProfilePicker } from "@/components/layout/ProfilePicker";
import { HeroTitle, SignInPanel } from "@/components/layout/Welcome";

const PRINCIPLES = [
  {
    icon: Sparkles,
    title: "AI describes",
    body: "A food photo becomes an editable draft. It is a guess to help the donor, never a fact.",
  },
  {
    icon: UserCheck,
    title: "Humans verify",
    body: "The donor confirms every detail, including each of the nine major allergens and how the food was held.",
  },
  {
    icon: ListChecks,
    title: "The backend enforces",
    body: "Deterministic prototype rules decide eligibility; one courier claim wins a time-limited offer.",
  },
];

export default function Home() {
  return (
    <main className="relative isolate flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[32rem] bg-[radial-gradient(60%_50%_at_20%_30%,color-mix(in_oklab,var(--leaf)_18%,transparent),transparent_70%),radial-gradient(40%_40%_at_85%_10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]"
      />
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:py-12">
        <section className="flex min-w-0 flex-col gap-8">
          <div className="space-y-5">
            {/* Decorative: the h1 below names the product. A plain img, as with the donor photo, so no image proxy is involved. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/annona-logo-512.png" alt="" width={192} height={128} className="h-auto w-32 max-w-full rounded-2xl bg-white p-2 shadow-sm ring-1 ring-border sm:w-40" />
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                Surplus-food coordination · DubHacks prototype
              </p>
              <HeroTitle />
              <p className="max-w-xl font-heading text-xl leading-snug text-foreground/85 sm:text-2xl">
                AI describes, humans verify, the backend enforces.
              </p>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                Surplus-food coordination: a licensed kitchen shares a photo, confirms the facts, and a nearby courier gets a
                time-limited pickup offer by message.
              </p>
            </div>
          </div>

          <ol className="grid gap-3 sm:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <li
                key={p.title}
                className="animate-rise rounded-xl border border-border bg-card/80 p-4 shadow-xs backdrop-blur"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <p.icon aria-hidden className="size-4.5" />
                </span>
                <p className="font-heading text-sm font-semibold">
                  <span className="text-muted-foreground tabular">{i + 1}. </span>
                  {p.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ol>

          <p className="flex gap-3 rounded-xl border border-offer-border bg-offer-subtle px-4 py-3 text-sm leading-relaxed text-offer">
            <span>
              <strong>Synthetic demo.</strong> All donors, recipients and couriers are fake. This prototype is not certified
              or reviewed for food-safety compliance, and a photo or AI output never establishes food safety or allergen
              status.
            </span>
          </p>
        </section>

        <section className="min-w-0 lg:pt-6" aria-label="Sign in">
          <SignInPanel>
            <ProfilePicker />
          </SignInPanel>
        </section>
      </div>
    </main>
  );
}
