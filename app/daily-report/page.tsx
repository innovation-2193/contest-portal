import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  LineChart,
  Printer,
  User,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import {
  listParticipants,
  listSubmissions,
  type SubmissionListItem,
} from "../../lib/admin-store";
import type { RegistrationRecord } from "../../lib/local-registrations";
import { getSiteStats, type SiteStats } from "../../lib/site-analytics";

export const dynamic = "force-dynamic";

type OrgSection =
  | "ส่วนบังคับบัญชา"
  | "ส่วนป้องกันและปราบปรามอาชญากรรม"
  | "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม"
  | "ส่วนการศึกษา"
  | "ส่วนบริการ"
  | "หน่วยงานอื่นๆ"
  | "อื่น ๆ";

type OrgBureau = {
  label: string;
  aliases: string[];
};

type OrgCommand = {
  label: string;
  shortLabel: string;
  section: OrgSection;
  aliases: string[];
  bureaus: OrgBureau[];
};

type BureauStat = OrgBureau & {
  registrations: number;
  submissions: number;
  percent: number;
  unmatched?: boolean;
};

type CommandStat = Omit<OrgCommand, "bureaus"> & {
  registrations: number;
  submissions: number;
  percent: number;
  bureaus: BureauStat[];
};

type OrgSectionSummary = {
  section: OrgSection;
  registrations: number;
  submissions: number;
  activeCommands: number;
  totalCommands: number;
  percent: number;
  topCommand: CommandStat | null;
};

const orgSections: OrgSection[] = [
  "ส่วนบังคับบัญชา",
  "ส่วนป้องกันและปราบปรามอาชญากรรม",
  "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม",
  "ส่วนการศึกษา",
  "ส่วนบริการ",
  "หน่วยงานอื่นๆ",
  "อื่น ๆ",
];

const orgCommands: OrgCommand[] = [
  command("สำนักงานยุทธศาสตร์ตำรวจ", "สยศ.ตร.", "ส่วนบังคับบัญชา", ["สยศ.ตร.", "สยศ"], ["ฝ่ายอำนวยการ (ฝอ.)", "กองยุทธศาสตร์ (ยศ.)", "กองแผนงานอาชญากรรม (ผอ.)", "กองแผนงานกิจการพิเศษ (ผก.)", "กองแผนงานความมั่นคง (ผค.)", "กองวิจัย (วจ.)"]),
  command("สำนักงานส่งกำลังบำรุง", "สกบ.", "ส่วนบังคับบัญชา", ["สกบ.", "สกบ"], ["กองบังคับการอำนวยการ (บก.อก.)", "กองพลาธิการ (พธ.)", "กองโยธาธิการ (ยธ.)", "กองสรรพาวุธ (สพ.)"]),
  command("สำนักงานกำลังพล", "สกพ.", "ส่วนบังคับบัญชา", ["สกพ.", "สกพ"], ["ฝ่ายอำนวยการ (ฝอ.)", "กลุ่มงานพัฒนาทรัพยากรบุคคล (พท.)", "กองอัตรากำลัง (อต.)", "กองทะเบียนพล (ทพ.)", "กองสวัสดิการ (สก.)"]),
  command("สำนักงานงบประมาณและการเงิน", "สงป.", "ส่วนบังคับบัญชา", ["สงป.", "สงป"], ["ฝ่ายอำนวยการ (ฝอ.)", "ฝ่ายเทคโนโลยีสารสนเทศด้านงบประมาณและการเงิน (ฝทง.)", "กองงบประมาณ (งป.)", "กองการเงิน (กง.)", "กองบัญชี (กช.)"]),
  command("สำนักงานกฎหมายและคดี", "กมค.", "ส่วนบังคับบัญชา", ["กมค.", "กมค"], ["ฝ่ายอำนวยการ (ฝอ.)", "กองกฎหมาย (กม.)", "กองคดีอาญา (คด.)", "กองคดีปกครองและคดีแพ่ง (คพ.)", "สถาบันส่งเสริมงานสอบสวน (สบส.)", "ส่วนตรวจสอบสำนวนคดีอุทธรณ์และฎีกา (อฎ.)"]),
  command("สำนักงานคณะกรรมการข้าราชการตำรวจ", "สง.ก.ตร.", "ส่วนบังคับบัญชา", ["สง.ก.ตร.", "ก.ตร.", "กตร"], ["ฝ่ายอำนวยการ (ฝอ.)", "กองตรวจสอบและทะเบียนประวัติ (ตป.)", "กองมาตรฐานวินัย (มน.)", "กองอุทธรณ์ (อธ.)", "กองร้องทุกข์ (รท.)"]),
  command("สำนักงานจเรตำรวจ", "จต.", "ส่วนบังคับบัญชา", ["จต.", "จเรตำรวจ"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองตรวจราชการ", "กต.", 10)]),
  command("สำนักงานตรวจสอบภายใน", "สตส.", "ส่วนบังคับบัญชา", ["สตส.", "ตรวจสอบภายใน"], ["ฝ่ายอำนวยการ (ฝอ.)", "กลุ่มงานพัฒนาการตรวจสอบภายใน (พตส.)", "กองตรวจสอบภายใน 1 (ตส.1)", "กองตรวจสอบภายใน 2 (ตส.2)", "กองตรวจสอบภายใน 3 (ตส.3)"]),
  command("สำนักงานเลขานุการตำรวจแห่งชาติ", "สลก.ตร.", "ส่วนบังคับบัญชา", ["สลก.ตร.", "สลก"], []),
  command("กองการต่างประเทศ", "ตท.", "ส่วนบังคับบัญชา", ["ตท.", "ต่างประเทศ"], []),
  command("กองสารนิเทศ", "สท.", "ส่วนบังคับบัญชา", ["สท.", "สารนิเทศ"], []),
  command("สำนักงานคณะกรรมการนโยบายตำรวจแห่งชาติ", "สง.ก.ต.ช.", "ส่วนบังคับบัญชา", ["สง.ก.ต.ช.", "ก.ต.ช.", "กตช"], []),
  command("กองบินตำรวจ", "บ.ตร.", "ส่วนบังคับบัญชา", ["บ.ตร.", "กองบินตำรวจ"], []),
  command("กองวินัย", "วน.", "ส่วนบังคับบัญชา", ["วน.", "วินัย"], []),
  command("สถาบันฝึกอบรมระหว่างประเทศ ว่าด้วยการดำเนินการให้เป็นไปตามกฎหมาย", "ILEA", "ส่วนบังคับบัญชา", ["ILEA", "สถาบันฝึกอบรมระหว่างประเทศ"], []),
  command("กองบัญชาการตำรวจนครบาล", "บช.น.", "ส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.น.", "บชน", "นครบาล"], ["กองบังคับการอำนวยการ (บก.อก.)", "กองบังคับการตำรวจจราจร (บก.จร.)", ...numbered("กองบังคับการตำรวจนครบาล", "บก.น.", 9), "กองบังคับการสืบสวนสอบสวน (บก.สส.)", "กองบังคับการสายตรวจและปฏิบัติการพิเศษ (บก.สปพ.)", "กองบังคับการอารักขาและควบคุมฝูงชน (บก.อคฝ.)", "ศูนย์ฝึกอบรม (ศฝร.)", "กองกำกับการสวัสดิภาพเด็กและสตรี (กก.ดส.)"]),
  ...provincialCommands(),
  command("กองบัญชาการตำรวจสอบสวนกลาง", "บช.ก.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["บช.ก.", "บชก", "สอบสวนกลาง"], ["กองบังคับการอำนวยการ (บก.อก.)", "กองบังคับการปราบปราม (บก.ป.)", "กองบังคับการตำรวจทางหลวง (บก.ทล.)", "กองบังคับการตำรวจรถไฟ (บก.รฟ.)", "กองบังคับการตำรวจน้ำ (บก.รน.)", "กองบังคับการปราบปรามการกระทำความผิดเกี่ยวกับทรัพยากรธรรมชาติและสิ่งแวดล้อม (บก.ปทส.)", "กองบังคับการปราบปรามการค้ามนุษย์ (บก.ปคม.)", "กองบังคับการปราบปรามการกระทำความผิดเกี่ยวกับอาชญากรรมทางเศรษฐกิจ (บก.ปอศ.)", "กองบังคับการป้องกันปราบปรามการทุจริตและประพฤติมิชอบ (บก.ปปป.)", "กองบังคับการปราบปรามการกระทำความผิดเกี่ยวกับการคุ้มครองผู้บริโภค (บก.ปคบ.)", "กองบังคับการปราบปรามการกระทำความผิดเกี่ยวกับอาชญากรรมทางเทคโนโลยี (บก.ปอท.)", "กองบังคับการปฏิบัติการพิเศษ (บก.ปพ.)", "ศูนย์ฝึกอบรม (ศฝร.)"]),
  command("กองบัญชาการตำรวจปราบปรามยาเสพติด", "บช.ปส.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["บช.ปส.", "บชปส", "ปราบปรามยาเสพติด"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตำรวจปราบปรามยาเสพติด", "บก.ปส.", 4), "กองบังคับการข่าวกรองยาเสพติด (บก.ขส.)", "กองบังคับการสกัดกั้นการลำเลียงยาเสพติด (บก.สกส.)", "กองกำกับการปฏิบัติการพิเศษ (กก.ปพ.)"]),
  command("กองบัญชาการตำรวจสันติบาล", "บช.ส.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["บช.ส.", "บชส", "สันติบาล"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตำรวจสันติบาล", "บก.ส.", 4), "ศูนย์พัฒนาด้านการข่าว (ศพข.)", "กลุ่มงานผู้เชี่ยวชาญด้านการข่าว (กชข.)"]),
  command("สำนักงานตรวจคนเข้าเมือง", "สตม.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["สตม.", "ตรวจคนเข้าเมือง"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตรวจคนเข้าเมือง", "บก.ตม.", 6), "กองบังคับการสืบสวนสอบสวน (บก.สส.)", "ศูนย์เทคโนโลยีตรวจคนเข้าเมือง (ศท.ตม.)", "ศูนย์ฝึกอบรมตรวจคนเข้าเมือง (ศฝร.ตม.)"]),
  command("กองบัญชาการตำรวจตระเวนชายแดน", "ตชด.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["ตชด.", "บช.ตชด.", "ตระเวนชายแดน"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตำรวจตระเวนชายแดนภาค", "บก.ตชด.ภาค", 4), "กองบังคับการฝึกพิเศษ (บก.กฝ.)", "กองบังคับการสนับสนุน (บก.สสน.)", "กองบังคับการสนับสนุนทางอากาศ (บก.สอ.)", "ศูนย์อำนวยการโครงการพัฒนาตามแนวพระราชดำริ (ศอพ.)"]),
  command("สำนักงานพิสูจน์หลักฐานตำรวจ", "สพฐ.ตร.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["สพฐ.ตร.", "สพฐ", "พิสูจน์หลักฐาน"], ["กองบังคับการอำนวยการ (บก.อก.)", "กองพิสูจน์หลักฐานกลาง (พฐก.)", "กองทะเบียนประวัติอาชญากร (ทว.)", ...numbered("ศูนย์พิสูจน์หลักฐาน", "ศพฐ.", 10), "สถาบันฝึกอบรมและวิจัยการพิสูจน์หลักฐานตำรวจ (สฝจ.)", "กลุ่มงานพิสูจน์เอกลักษณ์บุคคล (กพอ.)", "ศูนย์ข้อมูลวัตถุระเบิด (ศขบ.)"]),
  command("สำนักงานเทคโนโลยีสารสนเทศและการสื่อสาร", "สทส.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["สทส.", "เทคโนโลยีสารสนเทศ"], ["กองบังคับการอำนวยการ (บก.อก.)", "กองตำรวจสื่อสาร (สส.)", "กองบังคับการสนับสนุนทางเทคโนโลยี (บก.สสท.)", "ศูนย์เทคโนโลยีสารสนเทศกลาง (ศทก.)"]),
  command("กองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี", "บช.สอท.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["บช.สอท.", "บชสอท", "อาชญากรรมทางเทคโนโลยี", "ไซเบอร์"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี", "บก.สอท.", 5), "กองบังคับการตรวจสอบและวิเคราะห์อาชญากรรมทางเทคโนโลยี (บก.ตอท.)"]),
  command("กองบัญชาการตำรวจท่องเที่ยว", "บช.ทท.", "ส่วนสนับสนุนการป้องกันและปราบปรามอาชญากรรม", ["บช.ทท.", "บชทท", "ตำรวจท่องเที่ยว"], ["กองบังคับการอำนวยการ (บก.อก.)", ...numbered("กองบังคับการตำรวจท่องเที่ยว", "บก.ทท.", 3), "กองกำกับการควบคุมธุรกิจนำเที่ยวและมัคคุเทศก์ (กก.คธม.)"]),
  command("กองบัญชาการศึกษา", "บช.ศ.", "ส่วนการศึกษา", ["บช.ศ.", "บชศ", "กองบัญชาการศึกษา"], ["กองบังคับการอำนวยการ (บก.อก.)", "สำนักการศึกษาและประกันคุณภาพ (สศป.)", "วิทยาลัยการตำรวจ (วตร.)", "กองบังคับการฝึกอบรมตำรวจกลาง (บก.ฝรก.)", "กองการสอบ (กส.)", "กลุ่มงานอาจารย์ (กอจ.)", "ศูนย์ฝึกยุทธวิธีตำรวจกลาง (ศยก.)"]),
  command("โรงเรียนนายร้อยตำรวจ", "รร.นรต.", "ส่วนการศึกษา", ["รร.นรต.", "นายร้อยตำรวจ"], []),
  command("โรงพยาบาลตำรวจ", "รพ.ตร.", "ส่วนบริการ", ["รพ.ตร.", "รพตร", "โรงพยาบาลตำรวจ"], ["กองบังคับการอำนวยการ (บก.อก.)", "วิทยาลัยพยาบาลตำรวจ (วพ.)", "สถาบันนิติเวชวิทยา (นต.)", "วิทยาลัยแพทยศาสตร์ (วพศ.)", "โรงพยาบาลดารารัศมี (ดร.)", "โรงพยาบาลนวุติสมเด็จย่า (นย.)", "โรงพยาบาลยะลาสิริรัตนรักษ์ (ยส.)"]),
  command("โรงพิมพ์ตำรวจ", "โรงพิมพ์ตำรวจ", "หน่วยงานอื่นๆ", ["โรงพิมพ์ตำรวจ"], []),
  command("กองทุนเพื่อการสืบสวนและการสอบสวนคดีอาญา", "กองทุนฯ", "หน่วยงานอื่นๆ", ["กองทุนเพื่อการสืบสวน", "กองทุน"], []),
  command("ศูนย์บริการข้อมูลคนหายและศพนิรนาม", "ศูนย์คนหาย", "หน่วยงานอื่นๆ", ["ศูนย์บริการข้อมูลคนหาย", "ศพนิรนาม"], []),
  command("สายด่วนรถหาย", "สายด่วนรถหาย", "หน่วยงานอื่นๆ", ["สายด่วนรถหาย"], []),
  command("ป้องกันภัยออนไลน์", "ป้องกันภัยออนไลน์", "หน่วยงานอื่นๆ", ["ป้องกันภัยออนไลน์", "คณะทำงานสร้างเสริมภูมิคุ้มกันภัย"], []),
];

export default async function DailyReportPage() {
  const [participants, submissions, siteStats] = await Promise.all([
    listParticipants(),
    listSubmissions(),
    getSiteStats(),
  ]);

  const activeParticipants = participants.filter((item) => item.status !== "cancelled");
  const todayKey = bangkokDayKey(new Date());
  const registeredToday = activeParticipants.filter((item) => bangkokDayKey(item.registered_at) === todayKey);
  const submittedToday = submissions.filter((item) => bangkokDayKey(item.submitted_at) === todayKey);
  const attended = activeParticipants.filter((item) => item.status === "attended");
  const teams = submissions.filter((item) => item.submission_type === "team");
  const scored = submissions.filter((item) => item.review_total_score !== null && item.review_total_score !== undefined);
  const pendingReview = Math.max(0, submissions.length - scored.length);
  const qualified = submissions.filter((item) => item.status === "qualified");
  const rejected = submissions.filter((item) => item.status === "rejected");
  const reviewPercent = submissions.length ? Math.round((scored.length / submissions.length) * 100) : 0;
  const recentSubmissions = submissions.slice(0, 10);
  const statusStats = buildStatusStats(submissions);

  return <div className="admin-page report-page">
    <div className="wide">
      <div className="report-confidential-alert">
        <AlertTriangle/>
        <div>
          <b>ใช้ภายใน ห้ามเผยแพร่</b>
          <span>ข้อมูลในหน้านี้เป็นรายงานสำหรับผู้บังคับบัญชาเท่านั้น กรุณาไม่ส่งต่อหรือเผยแพร่ภายนอกหน่วยงาน</span>
        </div>
      </div>

      <div className="admin-topline report-topline">
        <div>
          <span className="eyebrow">Daily Report</span>
          <h1>รายงานสรุปประจำวัน</h1>
          <p>{formatFullThaiDate(new Date())} • หน้าสรุปสำหรับ<wbr/>ผู้บังคับบัญชา</p>
        </div>
        <div className="admin-actions">
          <a className="primary report-action-button" href="/api/daily-report/print" target="_blank" rel="noreferrer"><Printer/>พิมพ์ / บันทึก PDF</a>
          <Link className="secondary report-action-button" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="report-hero-panel">
        <div>
          <span className="eyebrow">ภาพรวมวันนี้</span>
          <h2>ลงทะเบียนแล้ว {activeParticipants.length.toLocaleString("th-TH")} คน <wbr/>ส่งผลงานแล้ว {submissions.length.toLocaleString("th-TH")} รายการ</h2>
          <p>สรุปยอดประจำวัน <wbr/>ยอดเข้าชมเว็บไซต์ <wbr/>และสถานะผลงานจากระบบรับสมัคร</p>
        </div>
        <div className="report-pulse">
          <Eye/>
          <b>{siteStats.today.toLocaleString("th-TH")}</b>
          <span>ยอดเข้าชมวันนี้</span>
        </div>
      </section>

      <section className="report-metric-groups" aria-label="summary">
        <MetricGroup title="การเข้าชมเว็บไซต์" detail="ติดตามความสนใจของผู้เข้าชมหน้าบ้าน">
          <Metric icon={<Eye/>} value={siteStats.today} label="ยอดเข้าชมวันนี้" detail={`เมื่อวาน ${siteStats.yesterday.toLocaleString("th-TH")} ครั้ง`}/>
          <Metric icon={<LineChart/>} value={siteStats.total} label="ยอดเข้าชมสะสม" detail={`เฉลี่ย 7 วัน ${siteStats.average7Days.toLocaleString("th-TH")} ครั้ง/วัน`}/>
        </MetricGroup>
        <MetricGroup title="ผู้สมัครและเช็คอิน" detail="สรุปจำนวนผู้เข้าร่วมกิจกรรม">
          <Metric icon={<Users/>} value={activeParticipants.length} label="คนสมัคร / ลงทะเบียนทั้งหมด" detail={`วันนี้ +${registeredToday.length.toLocaleString("th-TH")} คน`}/>
          <Metric icon={<UserCheck/>} value={attended.length} label="เช็คอินแล้ว" detail={`รอเช็คอิน ${(activeParticipants.length - attended.length).toLocaleString("th-TH")} คน`}/>
        </MetricGroup>
        <MetricGroup title="ผลงานประกวด" detail="สรุปผลงานที่ส่งเข้าระบบ">
          <Metric icon={<FileText/>} value={submissions.length} label="ผลงานที่ส่งแล้ว" detail={`วันนี้ +${submittedToday.length.toLocaleString("th-TH")} รายการ`}/>
          <Metric icon={<Trophy/>} value={scored.length} label="ผลงานที่มีคะแนนแล้ว" detail={`ยังรอตรวจ ${(submissions.length - scored.length).toLocaleString("th-TH")} รายการ`}/>
          <Metric icon={<ClipboardList/>} value={teams.length} label="ส่งแบบทีม" detail="จำนวนผลงานประเภททีม"/>
          <Metric icon={<User/>} value={submissions.length - teams.length} label="ส่งแบบเดี่ยว" detail="จำนวนผลงานประเภทบุคคล"/>
        </MetricGroup>
      </section>

      <section className="report-grid">
        <article className="admin-panel report-panel">
          <header><LineChart/><div><h2>ยอดเข้าชมเว็บไซต์ 7 วันล่าสุด</h2><p>นับผู้เข้าชมหน้าบ้านแบบวันละหนึ่งครั้งต่ออุปกรณ์ ไม่รวมหน้า /admin</p></div></header>
          <VisitTrend stats={siteStats}/>
        </article>

        <article className="admin-panel report-panel">
          <header><CheckCircle2/><div><h2>สถานะผลงาน</h2><p>ดูความคืบหน้าการตรวจและงานที่ควรติดตามต่อ</p></div></header>
          <div className="report-status-dashboard">
            <div className="report-status-overview">
              <div className="report-status-dial" style={{ "--progress": `${reviewPercent}%` } as CSSProperties}>
                <b>{reviewPercent.toLocaleString("th-TH")}%</b>
                <span>ตรวจแล้ว</span>
              </div>
              <div className="report-status-insight">
                <strong>{pendingReview ? `ยังรอตรวจ ${pendingReview.toLocaleString("th-TH")} รายการ` : "ตรวจครบทุกผลงานแล้ว"}</strong>
                <p>{submittedToday.length ? `วันนี้มีผลงานใหม่ ${submittedToday.length.toLocaleString("th-TH")} รายการ ควรจัดคิวตรวจต่อ` : "วันนี้ยังไม่มีผลงานใหม่เพิ่มเติม"}</p>
              </div>
            </div>
            <div className="report-status-kpi-grid">
              <StatusKpi label="ใหม่วันนี้" value={submittedToday.length} detail="ผลงานส่งเข้าระบบวันนี้"/>
              <StatusKpi label="รอตรวจ" value={pendingReview} detail="ยังไม่มีคะแนนรวม"/>
              <StatusKpi label="ผ่านเกณฑ์" value={qualified.length} detail="สถานะล่าสุดผ่านเกณฑ์"/>
              <StatusKpi label="ไม่ผ่านเกณฑ์" value={rejected.length} detail="สถานะล่าสุดไม่ผ่านเกณฑ์"/>
            </div>
            <div className="report-status-list">
              {statusStats.map((item) => <div key={item.label}>
                <span>{item.label}<small>{item.percent.toLocaleString("th-TH")}% ของทั้งหมด</small></span>
                <b>{item.count.toLocaleString("th-TH")}</b>
                <i><span style={{ width: `${item.percent}%` }}/></i>
              </div>)}
            </div>
          </div>
        </article>
      </section>

      <section className="admin-panel report-panel">
        <header className="admin-section-head">
          <FileText/>
          <div><h2>ผลงานที่ส่งมาแล้ว</h2><p>แสดง 10 รายการล่าสุดจากระบบรับสมัคร</p></div>
          <div className="admin-actions"><Link className="secondary report-action-button" href="/daily-report/submissions"><Eye/>ดูทั้งหมด</Link></div>
        </header>
        <div className="submission-report-list">
          {recentSubmissions.length ? recentSubmissions.map((item) => <SubmissionReportItem key={item.submission_code} item={item}/>) : <p className="report-empty">ยังไม่มีผลงานที่ส่งเข้าระบบ</p>}
        </div>
      </section>
    </div>
  </div>;
}

function OrgSectionOverview({ summary }: { summary: OrgSectionSummary }) {
  const activeLabel = `${summary.activeCommands.toLocaleString("th-TH")}/${summary.totalCommands.toLocaleString("th-TH")} บช./สำนักงานมีผลงาน`;
  return <article className={summary.submissions > 0 ? "report-org-overview-card" : "report-org-overview-card is-quiet"}>
    <div>
      <span>{summary.section}</span>
      <b>{summary.submissions.toLocaleString("th-TH")}</b>
      <small>ผลงาน • {activeLabel}</small>
    </div>
    <i aria-hidden="true"><span style={{ width: `${summary.submissions > 0 ? Math.max(summary.percent, 6) : 0}%` }}/></i>
    <em>{summary.topCommand ? `มากสุด: ${summary.topCommand.shortLabel} (${summary.topCommand.submissions.toLocaleString("th-TH")})` : "ยังไม่มีผลงาน"}</em>
  </article>;
}

function OrgSectionBlock({ section, rows, summary }: { section: OrgSection; rows: CommandStat[]; summary?: OrgSectionSummary }) {
  const sortedRows = [...rows].sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations || a.label.localeCompare(b.label, "th"));
  return <section className="report-org-section" key={section}>
    <div className="report-org-section-head">
      <div>
        <h3>{section}</h3>
        <span>{summary?.activeCommands.toLocaleString("th-TH") ?? "0"} บช./สำนักงานมีผลงาน จาก {summary?.totalCommands.toLocaleString("th-TH") ?? rows.length.toLocaleString("th-TH")} หน่วย</span>
      </div>
      <strong>{(summary?.submissions ?? 0).toLocaleString("th-TH")}<small>ผลงาน</small></strong>
    </div>
    <div className="report-command-list">
      {sortedRows.map((item, index) => <CommandToggle key={`${section}-${item.label}`} item={item} index={index}/>)}
    </div>
  </section>;
}

function Metric({ icon, value, label, detail }: { icon: ReactNode; value: number; label: string; detail: string }) {
  return <article className="report-metric">
    {icon}
    <div>
      <b>{value.toLocaleString("th-TH")}</b>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  </article>;
}

function MetricGroup({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className="report-metric-group">
    <header>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </header>
    <div className="report-metric-grid">{children}</div>
  </section>;
}

function StatusKpi({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div>
    <b>{value.toLocaleString("th-TH")}</b>
    <span>{label}</span>
    <small>{detail}</small>
  </div>;
}

function VisitTrend({ stats }: { stats: SiteStats }) {
  const max = Math.max(1, ...stats.last7Days.map((item) => item.count));
  const width = 720;
  const height = 230;
  const padX = 34;
  const padTop = 22;
  const padBottom = 42;
  const chartHeight = height - padTop - padBottom;
  const points = stats.last7Days.map((item, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(1, stats.last7Days.length - 1));
    const y = padTop + chartHeight - (item.count / max) * chartHeight;
    return { ...item, x, y };
  });
  const linePath = points.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`).join(" ");
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height - padBottom} L ${points[0].x.toFixed(2)} ${height - padBottom} Z` : "";
  return <div className="report-visit-trend">
    <div className="report-visit-summary">
      <span><b>{stats.today.toLocaleString("th-TH")}</b><small>วันนี้</small></span>
      <span><b>{stats.yesterday.toLocaleString("th-TH")}</b><small>เมื่อวาน</small></span>
      <span><b>{stats.peakDay.count.toLocaleString("th-TH")}</b><small>สูงสุด {stats.peakDay.label}</small></span>
    </div>
    <div className="report-line-chart" aria-label="ยอดเข้าชมเว็บไซต์ 7 วันล่าสุด">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="visitLineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#76d6ca"/>
            <stop offset="100%" stopColor="#dfba33"/>
          </linearGradient>
          <linearGradient id="visitAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#76d6ca" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#76d6ca" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartHeight * ratio;
          return <line key={ratio} className="report-line-grid" x1={padX} x2={width - padX} y1={y} y2={y}/>;
        })}
        {areaPath && <path className="report-line-area" d={areaPath}/>}
        {linePath && <path className="report-line-path" d={linePath}/>}
        {points.map((item) => <g key={item.date}>
          <circle className="report-line-dot" cx={item.x} cy={item.y} r="5"/>
          <text className="report-line-value" x={item.x} y={Math.max(14, item.y - 12)}>{item.count.toLocaleString("th-TH")}</text>
          <text className="report-line-label" x={item.x} y={height - 14}>{item.label}</text>
        </g>)}
      </svg>
    </div>
  </div>;
}

function CommandToggle({ item, index }: { item: CommandStat; index: number }) {
  const width = item.submissions > 0 ? Math.max(item.percent, 3) : 0;
  const activeBureaus = item.bureaus.filter((bureau) => bureau.submissions > 0).length;
  return <details className={`report-command-toggle${item.submissions === 0 ? " is-zero" : ""}`} open={index < 3 && item.submissions > 0}>
    <summary>
      <span className="report-command-rank">{(index + 1).toLocaleString("th-TH")}</span>
      <div className="report-command-title">
        <b>{item.shortLabel}</b>
        <span>{item.label}</span>
        <small>{activeBureaus.toLocaleString("th-TH")} บก./หน่วยย่อยมีผลงาน จาก {item.bureaus.length.toLocaleString("th-TH")} หน่วย</small>
      </div>
      <div className="report-command-meter" aria-hidden="true"><span style={{ width: `${width}%` }}/></div>
      <strong><b>{item.submissions.toLocaleString("th-TH")}</b><small>ผลงาน</small></strong>
    </summary>
    <div className="report-bureau-list">
      {item.bureaus.map((bureau) => <BureauRow key={`${item.label}-${bureau.label}`} item={bureau}/>)}
    </div>
  </details>;
}

function BureauRow({ item }: { item: BureauStat }) {
  const width = item.submissions > 0 ? Math.max(item.percent, 4) : 0;
  return <div className={`report-bureau-row${item.submissions === 0 ? " is-zero" : ""}${item.unmatched ? " is-unmatched" : ""}`}>
    <div>
      <span>{item.label}</span>
      <small>{item.unmatched ? "ข้อมูลที่กรอกไม่ตรงกับ บก./หน่วยย่อยในโครงสร้าง" : "บก./หน่วยย่อย"}</small>
    </div>
    <i aria-hidden="true"><span style={{ width: `${width}%` }}/></i>
    <strong><b>{item.submissions.toLocaleString("th-TH")}</b><small>/ {item.registrations.toLocaleString("th-TH")}</small></strong>
  </div>;
}

function SubmissionReportItem({ item }: { item: SubmissionListItem }) {
  return <article className="submission-report-item">
    <div>
      <b>{item.title_th}</b>
      <small>{item.submission_code} • {formatShortThaiDate(item.submitted_at)}</small>
    </div>
    <span>{item.submission_type === "team" ? `ทีม ${item.team_name || "-"}` : "ส่งเดี่ยว"}</span>
    <p>{item.first_name} {item.last_name}<small>{item.division || "-"} / {item.bureau || "-"}</small></p>
    <em>{statusLabel(item.status)}</em>
  </article>;
}

function buildCommandStats(participants: RegistrationRecord[], submissions: SubmissionListItem[]) {
  const stats = new Map<string, CommandStat>();

  for (const item of orgCommands) {
    const bureaus = item.bureaus.length
      ? item.bureaus.map((bureau) => ({ ...bureau, registrations: 0, submissions: 0, percent: 0 }))
      : [{ label: "ไม่ระบุ บก./หน่วยย่อย", aliases: ["ไม่ระบุ"], registrations: 0, submissions: 0, percent: 0 }];
    stats.set(item.label, { ...item, registrations: 0, submissions: 0, percent: 0, bureaus });
  }

  for (const item of participants) {
    incrementCommandStat(stats, item.division, item.bureau, "registrations");
  }
  for (const item of submissions) {
    incrementCommandStat(stats, item.division, item.bureau, "submissions");
  }

  const rows = [...stats.values()].map((commandStat) => {
    const maxBureau = Math.max(1, ...commandStat.bureaus.map((bureau) => bureau.submissions));
    return {
      ...commandStat,
      bureaus: commandStat.bureaus
        .map((bureau) => ({ ...bureau, percent: Math.round((bureau.submissions / maxBureau) * 100) }))
        .sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations || a.label.localeCompare(b.label, "th")),
    };
  });
  const max = Math.max(1, ...rows.map((item) => item.submissions));
  return rows.map((item) => ({ ...item, percent: Math.round((item.submissions / max) * 100) }));
}

function buildOrgSectionSummaries(stats: CommandStat[]): OrgSectionSummary[] {
  const summaries = orgSections.map((section) => {
    const rows = stats.filter((item) => item.section === section);
    const submissions = rows.reduce((sum, item) => sum + item.submissions, 0);
    const registrations = rows.reduce((sum, item) => sum + item.registrations, 0);
    const activeCommands = rows.filter((item) => item.submissions > 0).length;
    const topCommand = [...rows].sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations)[0] ?? null;
    return {
      section,
      registrations,
      submissions,
      activeCommands,
      totalCommands: rows.length,
      percent: 0,
      topCommand: topCommand && topCommand.submissions > 0 ? topCommand : null,
    };
  });
  const max = Math.max(1, ...summaries.map((item) => item.submissions));
  return summaries.map((item) => ({ ...item, percent: Math.round((item.submissions / max) * 100) }));
}

function incrementCommandStat(
  stats: Map<string, CommandStat>,
  division: string,
  bureau: string,
  key: "registrations" | "submissions",
) {
  const match = matchCommandAndBureau(division, bureau);
  let commandStat = stats.get(match.command.label);
  if (!commandStat) {
    commandStat = { ...match.command, registrations: 0, submissions: 0, percent: 0, bureaus: [] };
    stats.set(match.command.label, commandStat);
  }
  commandStat[key] += 1;

  const bureauLabel = match.bureau?.label ?? "ไม่ระบุ บก./หน่วยย่อย";
  let bureauStat = commandStat.bureaus.find((item) => item.label === bureauLabel);
  if (!bureauStat) {
    bureauStat = { label: bureauLabel, aliases: match.bureau?.aliases ?? [], registrations: 0, submissions: 0, percent: 0, unmatched: !match.bureau };
    commandStat.bureaus.push(bureauStat);
  }
  bureauStat[key] += 1;
}

function matchCommandAndBureau(division: string, bureau: string) {
  const command =
    matchCommandText(bureau) ??
    matchCommandText(`${bureau} ${division}`) ??
    matchCommandByBureauText(division);
  if (command) {
    return {
      command,
      bureau: matchBureauText(command, division) ?? matchBureauText(command, bureau),
    };
  }

  const other = statsFallbackCommand();
  return {
    command: other,
    bureau: {
      label: [division, bureau].map((item) => item.trim()).filter(Boolean).join(" / ") || "ไม่ระบุสังกัด",
      aliases: [],
    },
  };
}

function matchCommandText(value: string) {
  const text = normalizeText(value);
  if (!text) return null;
  return orgCommands.find((item) => aliasesMatch(text, item.aliases)) ?? null;
}

function matchCommandByBureauText(value: string) {
  const text = normalizeText(value);
  if (!text) return null;
  return orgCommands.find((commandItem) => commandItem.bureaus.some((bureau) => aliasesMatch(text, bureau.aliases))) ?? null;
}

function matchBureauText(commandItem: OrgCommand, value: string) {
  const text = normalizeText(value);
  if (!text) return null;
  return commandItem.bureaus.find((item) => aliasesMatch(text, item.aliases)) ?? null;
}

function aliasesMatch(text: string, aliases: string[]) {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return text === normalizedAlias || text.includes(normalizedAlias);
  });
}

function buildStatusStats(submissions: SubmissionListItem[]) {
  const counts = new Map<string, number>();
  for (const item of submissions) counts.set(statusLabel(item.status), (counts.get(statusLabel(item.status)) ?? 0) + 1);
  if (!counts.size) counts.set("ยังไม่มีข้อมูล", 0);
  const total = Math.max(1, submissions.length);
  return [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    percent: Math.round((count / total) * 100),
  }));
}

function command(label: string, shortLabel: string, section: OrgSection, aliases: string[], bureaus: string[]): OrgCommand {
  return {
    label,
    shortLabel,
    section,
    aliases: [label, shortLabel, ...aliases],
    bureaus: bureaus.map((item) => bureauUnit(item)),
  };
}

function bureauUnit(label: string): OrgBureau {
  const abbreviation = label.match(/\(([^)]+)\)/)?.[1] ?? "";
  return {
    label,
    aliases: [label, abbreviation, abbreviation.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))].filter(Boolean),
  };
}

function numbered(prefix: string, abbreviationPrefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `${prefix} ${n} (${abbreviationPrefix}${n})`;
  });
}

function provincialCommands(): OrgCommand[] {
  const provinces = [
    ["ตำรวจภูธร ภาค 1", "ภ.1", ["สมุทรปราการ", "นนทบุรี", "ปทุมธานี", "พระนครศรีอยุธยา", "อ่างทอง", "สิงห์บุรี", "ชัยนาท", "ลพบุรี", "สระบุรี"]],
    ["ตำรวจภูธร ภาค 2", "ภ.2", ["จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ตราด", "นครนายก", "ปราจีนบุรี", "ระยอง", "สระแก้ว"]],
    ["ตำรวจภูธร ภาค 3", "ภ.3", ["ชัยภูมิ", "นครราชสีมา", "บุรีรัมย์", "ยโสธร", "ศรีสะเกษ", "สุรินทร์", "อำนาจเจริญ", "อุบลราชธานี"]],
    ["ตำรวจภูธร ภาค 4", "ภ.4", ["กาฬสินธุ์", "ขอนแก่น", "นครพนม", "บึงกาฬ", "มหาสารคาม", "มุกดาหาร", "ร้อยเอ็ด", "เลย", "สกลนคร", "หนองคาย", "หนองบัวลำภู", "อุดรธานี"]],
    ["ตำรวจภูธร ภาค 5", "ภ.5", ["เชียงใหม่", "เชียงราย", "ลำพูน", "ลำปาง", "แพร่", "พะเยา", "น่าน", "แม่ฮ่องสอน"]],
    ["ตำรวจภูธร ภาค 6", "ภ.6", ["กำแพงเพชร", "ตาก", "นครสวรรค์", "พิจิตร", "พิษณุโลก", "เพชรบูรณ์", "สุโขทัย", "อุตรดิตถ์", "อุทัยธานี"]],
    ["ตำรวจภูธร ภาค 7", "ภ.7", ["กาญจนบุรี", "นครปฐม", "ประจวบคีรีขันธ์", "เพชรบุรี", "ราชบุรี", "สมุทรสงคราม", "สมุทรสาคร", "สุพรรณบุรี"]],
    ["ตำรวจภูธร ภาค 8", "ภ.8", ["สุราษฎร์ธานี", "นครศรีธรรมราช", "ภูเก็ต", "กระบี่", "ชุมพร", "พังงา", "ระนอง"]],
    ["ตำรวจภูธร ภาค 9", "ภ.9", ["สงขลา", "พัทลุง", "สตูล", "ตรัง", "นราธิวาส", "ยะลา", "ปัตตานี"]],
  ] as const;
  return provinces.map(([label, shortLabel, provinceList]) => command(
    label,
    shortLabel,
    "ส่วนป้องกันและปราบปรามอาชญากรรม",
    [shortLabel.replace(".", ""), `ตำรวจภูธรภาค ${shortLabel.replace("ภ.", "")}`, `ภาค ${shortLabel.replace("ภ.", "")}`],
    ["กองบังคับการอำนวยการ (บก.อก.)", "กองบังคับการกฎหมายและคดี (บก.กค.)", "กองบังคับการสืบสวนสอบสวน (บก.สส.)", ...provinceList.map((province) => `ตำรวจภูธรจังหวัด${province} (ภ.จว.${province})`), "ศูนย์ฝึกอบรม (ศฝร.)", "กองกำกับการปฏิบัติการพิเศษ (กก.ปพ.)"],
  ));
}

function statsFallbackCommand(): OrgCommand {
  return command("ไม่พบในโครงสร้างหน่วยงาน", "อื่น ๆ", "อื่น ๆ", ["ไม่พบ", "อื่น ๆ"], []);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/[.\s\-_/()]/g, "")
    .replace(/สำนักงานตำรวจแห่งชาติ/g, "ตร");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "ฉบับร่าง",
    submitted: "ส่งแล้ว",
    screening: "กำลังตรวจ",
    qualified: "ผ่านเกณฑ์",
    rejected: "ไม่ผ่านเกณฑ์",
  };
  return labels[status] ?? (status || "-");
}

function bangkokDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatFullThaiDate(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatShortThaiDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
