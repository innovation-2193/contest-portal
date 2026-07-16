import { PageHero } from "../../components/SiteChrome";
import { privacyConsent } from "../../components/consentContent";

export default function Pdpa(){return <><PageHero eyebrow="PDPA CONSENT" title={privacyConsent.title} description="รายละเอียดความยินยอมสำหรับการเข้าร่วมงานและการประกวดนวัตกรรม"/><section className="wide page-body policy consent-policy"><h2>{privacyConsent.title}</h2>{privacyConsent.body.map((paragraph)=><p key={paragraph}>{paragraph}</p>)}</section></>}
