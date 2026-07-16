import { PageHero, SideNotes, StepRail } from "../../components/SiteChrome";
import { SubmissionForm } from "../../components/SubmissionForm";
export default function Submit(){return <><PageHero eyebrow="INNOVATION CONTEST SUBMISSION" title="ลงทะเบียนประกวดนวัตกรรมตำรวจ" description="กรอกข้อมูลผู้สมัคร ข้อมูลผลงานนวัตกรรม และแนบเอกสารประกอบตามแบบฟอร์มให้ครบถ้วนก่อนส่งใบสมัคร"/><section className="wide page-body"><StepRail submission/><div className="form-layout"><SubmissionForm/><SideNotes submission/></div></section></>}
