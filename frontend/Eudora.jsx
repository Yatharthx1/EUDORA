import { useState } from "react";
import Hero from "./components/Hero";
import Features from "./components/Features";
import IndoreSection from "./components/IndoreSection";
import HowItWorks from "./components/HowItWorks";
import Testimonials from "./components/Testimonials";
import CTA from "./components/CTA";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CursorTrail from "./components/CursorTrail";
import GlobalStyles from "./components/GlobalStyles";

export default function Eudora() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  const handleJoin = () => {
    if (email.includes("@")) setJoined(true);
  };

  return (
    <div className="eu-body">

      <GlobalStyles />

      {/* cursor animation */}
      <CursorTrail />

      {/* navigation */}
      <Navbar />

      {/* hero */}
      <Hero />

      {/* features */}
      <Features />

      {/* indore */}
      <IndoreSection />

      {/* how it works */}
      <HowItWorks />

      {/* testimonials */}
      <Testimonials />

      {/* CTA */}
      <CTA
        email={email}
        setEmail={setEmail}
        joined={joined}
        handleJoin={handleJoin}
      />

      {/* footer */}
      <Footer />

    </div>
  );
}