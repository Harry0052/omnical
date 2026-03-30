import { CursorGlow } from "@/components/cursor-glow";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { WhyItMatters } from "@/components/why-it-matters";
import { HowItWorks } from "@/components/how-it-works";
import { Features } from "@/components/features";
import { BeforeTheMoment } from "@/components/before-the-moment";
import { FAQ } from "@/components/faq";
import { Waitlist } from "@/components/waitlist";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <CursorGlow />
      <Navbar />
      <main>
        <Hero />
        <WhyItMatters />
        <HowItWorks />
        <Features />
        <BeforeTheMoment />
        <FAQ />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
