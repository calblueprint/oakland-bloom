import { ReactNode } from "react";
import { Instrument_Sans } from "next/font/google";
import glow from "@/assets/images/bg-glow.png";
import logo from "@/assets/images/oakland-bloom-logo.png";
import {
  Card,
  Content,
  Glow,
  GlowImage,
  Header,
  Heading,
  Links,
  Logo,
  Page,
} from "./styles";

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
    <Page className={instrumentSans.className}>
      <Glow>
        <GlowImage src={glow} alt="" fill sizes="100vw" />
      </Glow>

      <Card>
        <Content>
          <Header>
            <Logo src={logo} alt="Oakland Bloom" priority />
            <Heading>{heading}</Heading>
          </Header>

          {children}
        </Content>

        {footer && <Links>{footer}</Links>}
      </Card>
    </Page>
  );
}
