"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionReveal } from "@/components/section-reveal";

const faqs = [
  { question: "Is this just another calendar app?", answer: "No. Omni Cal is an AI personal assistant that uses your calendar as its foundation. While you can manage your schedule manually, the real power is in the AI layer that actively prepares you for upcoming events — study guides, meeting prep, social briefings, and more." },
  { question: "Does it require me to chat with it or write prompts?", answer: "Not at all. Omni Cal is designed to be prompt-less. It works quietly in the background, analyzing your upcoming events and delivering preparation automatically. You never need to ask it anything — though you can if you want to." },
  { question: "What does it connect to?", answer: "Omni Cal integrates with Google Calendar, Apple Calendar, Gmail, Outlook, Slack, and other platforms. We are continuously adding integrations. The more tools you connect, the smarter the preparation becomes." },
  { question: "Is my data private and secure?", answer: "Absolutely. Your data is encrypted at rest and in transit. We do not sell your data or share it with third parties. AI processing happens in secure, isolated environments, and you have full control over what Omni Cal can access." },
  { question: "Can I still use my own calendar manually?", answer: "Yes. Omni Cal enhances your existing calendar — it does not replace it. You can continue using Google Calendar, Apple Calendar, or any other tool. Omni Cal layers intelligence on top without disrupting your current workflow." },
  { question: "When will Omni Cal be available?", answer: "We are currently in private development. Join the waitlist to get early access. We will be rolling out invites in waves, starting with our earliest sign-ups." },
];

export function FAQ() {
  return (
    <SectionReveal id="faq" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center mb-12 space-y-4">
          <p className="text-xs font-mono text-[#9c9e9b] tracking-widest uppercase">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1a1a1a]">Common questions</h2>
        </div>
        <Accordion className="space-y-2.5">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} className="rounded-xl border border-black/[0.06] bg-white/70 px-5 data-open:border-black/[0.08] data-open:bg-white transition-colors duration-300">
              <AccordionTrigger className="text-sm font-medium text-left text-[#2a2a2a] hover:no-underline py-4 cursor-pointer">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-[#818380] leading-relaxed pb-4">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionReveal>
  );
}
