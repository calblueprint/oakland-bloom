import { ReactNode } from "react";
import { Instrument_Sans } from "next/font/google";
import Image from "next/image";
import glow from "@/assets/images/bg-glow.png";
import logo from "@/assets/images/oakland-bloom-logo.png";
import styles from "./auth.module.css";

// 400 is for the pending approval message, 500 for everything else
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// frame shared by every auth screen: glow, logo, heading, the screen's
// content, then an optional row of links under it
export default function AuthShell({
  heading,
  children,
  footer,
}: {
  heading: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className={`${styles.page} ${instrumentSans.className}`}>
      <div className={styles.glow}>
        <Image
          src={glow}
          alt=""
          fill
          sizes="100vw"
          className={styles.glowImage}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.content}>
          <div className={styles.header}>
            <Image
              src={logo}
              alt="Oakland Bloom"
              className={styles.logo}
              priority
            />
            <h1 className={styles.heading}>{heading}</h1>
          </div>

          {children}
        </div>

        {footer && <div className={styles.links}>{footer}</div>}
      </div>
    </main>
  );
}
