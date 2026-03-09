"use client";

import Intro from "@/components/Intro";
import Navbar from "@/components/Navbar";
import SceneOne from "@/components/SceneOne";
import ProblemSection from "@/components/ProblemSection";
import SolutionSection from "@/components/SolutionSection";
import SignalsSection from "@/components/SignalsSection";
import PollutionSection from "@/components/PollutionSection";
import RoutesSection from "@/components/RoutesSection";
import StatsSection from "@/components/StatsSection";
import CtaSection from "@/components/CtaSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Intro />
      <Navbar />
      <main>
        <SceneOne />
        <ProblemSection />
        <SolutionSection />
        <SignalsSection />
        <PollutionSection />
        <RoutesSection />
        <StatsSection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
