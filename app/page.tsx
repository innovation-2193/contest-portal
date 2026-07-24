import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, CalendarDays, CheckCircle2, Download, FileText, Handshake, Lightbulb, Mail, MapPin, Megaphone, Newspaper, Phone, Scale, ShieldCheck, Trophy, Users } from "lucide-react";
import { CriteriaToggle, type CriteriaRound } from "../components/CriteriaToggle";
import { PrelanderCountdown } from "../components/PrelanderCountdown";
import { cookieName, verifyAdminToken } from "../lib/admin-auth";
import { getAdminSettings, isContestSubmissionOpen, isEventRegistrationOpen, isPrelanderActive, listNews, listWinners } from "../lib/admin-store";

const criteriaRounds: CriteriaRound[]=[
  {
    title:"รอบที่ 1: การประเมินเอกสาร (Paper Screening)",
    total:"100 คะแนน",
    note:"พิจารณาจากเอกสาร หลักฐานประกอบ และข้อมูลที่ผู้ส่งผลงานยื่นผ่านระบบเว็บไซต์เท่านั้น",
    items:[
      ["ความเป็นผลงานของตำรวจ",20],
      ["ปัญหาและความจำเป็น",15],
      ["แนวคิดหรือรูปแบบนวัตกรรม",25],
      ["หลักฐานผลลัพธ์เบื้องต้น",20],
      ["ความคุ้มค่าและการขยายผล",20],
    ],
  },
  {
    title:"รอบที่ 2: การคัดเลือกรอบนำเสนอ (Presentation)",
    total:"100 คะแนน",
    note:"ประเมินจากการนำเสนอผลงานต่อคณะกรรมการฯ ในวันที่ 24 สิงหาคม 2569 ณ สโมสรตำรวจ",
    items:[
      ["ความเป็นไปได้ในการใช้งานจริง",25],
      ["ผลลัพธ์หรือตัวชี้วัดที่พิสูจน์ได้",25],
      ["ศักยภาพในการขยายผล",15],
      ["ความชัดเจนของการนำเสนอ",15],
      ["การตอบคำถามคณะกรรมการ",20],
    ],
  },
];
const faq=[
  {
    question:"ผู้ที่ไม่ใช่ข้าราชการตำรวจสามารถสมัครเข้าร่วมประกวดได้หรือไม่?",
    answer:["ไม่ได้ครับ โครงการประกวดนวัตกรรมนี้เปิดโอกาสให้เฉพาะข้าราชการตำรวจทุกระดับหรือหน่วยงานตำรวจได้นำเสนอแนวคิดและผลงาน โดยมุ่งเน้นให้เป็นผลงานที่ \"คิดจากตำรวจ ทำโดยตำรวจ\" เพื่อนำมาตอบโจทย์ปัญหาการปฏิบัติงานจริงของเจ้าหน้าที่เท่านั้น"]
  },
  {
    question:"สามารถส่งผลงานเข้าร่วมประกวดมากกว่า 1 ผลงานได้หรือไม่?",
    answer:["1 ผู้เข้าแข่งขันสามารถส่งผลงานได้เพียง 1 ผลงานเท่านั้น โดยไม่สามารถเข้าร่วมเป็นสมาชิกทีมอื่นได้อีก โดยนับการส่งผลงานแรกสุดเป็นผลงานส่งประกวดเท่านั้น"]
  },
  {
    question:"ระยะเวลาการส่งประกวดคือช่วงใด",
    answer:["วันที่ 20 - 30 ก.ค. 2569 (ปิดรับเวลา 16.30 น.)"]
  },
  {
    question:"ผลงานที่เคยส่งประกวดเวทีอื่นมาแล้ว มีสิทธิ์ได้รับรางวัลในเวทีนี้หรือไม่?",
    answer:["ได้โดยผลงานที่ส่งเข้าประกวดจะต้องเป็นผลงานที่ผู้เข้าประกวดเป็น \"เจ้าของผลงานแต่เพียงผู้เดียว\" นอกจากนี้ ผู้เข้าประกวดจะต้องไม่คัดลอก ดัดแปลง หรือกระทำการใด ๆ อันเป็นการละเมิดลิขสิทธิ์และทรัพย์สินทางปัญญาของผู้อื่นโดยเด็ดขาด"]
  },
  {
    question:"นวัตกรรมที่ส่งประกวด จำเป็นต้องเป็นเทคโนโลยีขั้นสูงระดับสูง (High-tech) หรือไม่?",
    answer:["ไม่จำเป็นต้องเป็นเทคโนโลยีขั้นสูงเสมอไป โดยนวัตกรรมในที่นี้อาจหมายรวมถึงการปรับปรุงวิธีคิด วิธีทำงาน หรือกระบวนการปฏิบัติงานเดิมให้ได้ผลลัพธ์ที่ดีกว่าเดิม","สิ่งสำคัญคือต้องสามารถใช้งานได้จริง มีเหตุผลรองรับ และสามารถตรวจสอบผลลัพธ์ได้อย่างเป็นรูปธรรม"]
  },
  {
    question:"นวัตกรรมที่ส่งประกวด จำเป็นต้องเสร็จสมบูรณ์แล้ว หรือไม่?",
    answer:["ไม่จำเป็น โครงการประกวดนวัตกรรมนี้ไม่ได้จำกัดแค่ผลงานที่สร้างเสร็จสมบูรณ์แล้วเพียงอย่างเดียว ซึ่งอาจเป็นเพียง แนวคิด วิธีการ กระบวนงาน เครื่องมือ ระบบ ผลิตภัณฑ์ บริการ หรือรูปแบบการดำเนินงานที่เกิดจากการคิดค้น พัฒนา ปรับปรุง หรือประยุกต์ใช้สิ่งที่มีอยู่เดิมให้เกิดคุณค่าใหม่ โดยสามารถนำไปใช้แก้ไขปัญหา เพิ่มประสิทธิภาพ ลดขั้นตอน ลดภาระงาน ลดค่าใช้จ่าย ยกระดับคุณภาพการให้บริการ หรือสร้างประโยชน์ที่ชัดเจนต่อหน่วยงาน ผู้ปฏิบัติงาน ประชาชน หรือสังคมได้อย่างเป็นรูปธรรม"]
  },
  {
    question:"หากต้องการสมัคร ต้องส่งเอกสารหรือหลักฐานอะไรบ้าง?",
    answer:["ข้าราชการตำรวจนายใด หรือทีมใด สนใจสมัคร ต้องดำเนินการ ดังนี้","1. บันทึกข้อมูลในระบบ Innovation Police ผ่าน URL: https://innocontest.police.go.th","2. บันทึกข้อมูลรายละเอียดลงในไฟล์แบบฟอร์ม 01-04 โดยสามารถดาวน์โหลดได้ที่ “เมนูสมัครประกวดนวัตกรรม”"]
  }
];
const schedule=[
  {phase:"เปิดรับสมัคร",date:"20 กรกฎาคม 2569",title:"เปิดรับสมัครผลงานนวัตกรรม",detail:"กรอกข้อมูลผู้สมัคร รายละเอียดผลงาน และแนบเอกสารประกอบผ่านระบบออนไลน์"},
  {phase:"คัดเลือกรอบแรก",date:"13 สิงหาคม 2569",title:"ประกาศรายชื่อผลงานผ่านรอบคัดเลือก",detail:"ตรวจความครบถ้วนของเอกสารและแจ้งรายชื่อผลงานที่ผ่านเข้าสู่รอบนำเสนอ"},
  {phase:"รอบนำเสนอ",date:"24 สิงหาคม 2569",title:"นำเสนอผลงานและประกาศผล",detail:"นำเสนอผลงานต่อคณะกรรมการ พร้อมประกาศรางวัลภายในงาน Police Innovation Contest 2026"}
];
const awardLabels: Record<string,string> = {finalist:"ผ่านเข้ารอบที่ 2","1":"รางวัลที่ 1","2":"รางวัลที่ 2","3":"รางวัลที่ 3",honorable:"รางวัลชมเชย"};
const mapUrl="https://maps.app.goo.gl/SzRz39JWD5HTXZXQ7";
export const dynamic="force-dynamic";
export default async function Home(){const cookieStore=await cookies();const isAdmin=verifyAdminToken(cookieStore.get(cookieName)?.value);const settings=await getAdminSettings();if(!isAdmin&&isPrelanderActive(settings))return <Prelander title={settings.prelanderTitle} message={settings.prelanderMessage} openAt={settings.openAt}/>;const registrationOpen=isEventRegistrationOpen(settings);const submissionOpen=isContestSubmissionOpen(settings);const [winners,news]=await Promise.all([listWinners(),listNews({publicOnly:true})]);const publishedWinners=winners.filter(w=>w.published);const finalistWinners=publishedWinners.filter(w=>w.rank==="finalist");const awardWinners=publishedWinners.filter(w=>w.rank!=="finalist");const featuredNews=news[0];const moreNews=news.slice(1,4);return <>
  <section className="home-hero banner-hero"><div className="hero-media"/><div className="hero-effects" aria-hidden="true"><span className="spark spark-1"/><span className="spark spark-2"/><span className="spark spark-3"/><span className="spark spark-4"/><span className="spark spark-5"/><span className="spark spark-6"/><span className="spark spark-7"/><span className="spark spark-8"/><span className="spark spark-9"/><span className="spark spark-10"/><span className="spark spark-11"/><span className="spark spark-12"/><span className="spark spark-13"/><span className="spark spark-14"/><span className="signal signal-1"/><span className="signal signal-2"/><span className="signal signal-3"/></div><div className="wide hero-content banner-content"><div className="hero-values left"><span><ShieldCheck/>SECURITY<small>ความปลอดภัย</small></span><span><Scale/>JUSTICE<small>ความยุติธรรม</small></span><span><Users/>SERVICE<small>บริการประชาชน</small></span></div><div className="hero-center"><span className="crest hero-logo"><img src="/logo-3d.png" alt="ประกวดนวัตกรรมสำนักงานตำรวจแห่งชาติ"/></span><span className="hero-kicker">Police Innovation Contest 2026</span><h1>ประกวดนวัตกรรม<br/>สำนักงานตำรวจแห่งชาติ</h1><p>เวทีนำเสนอแนวคิดและผลงานนวัตกรรมตำรวจ ประจำปี พ.ศ. 2569</p><div className="banner-actions"><SignupAction className="primary" href="/register" label="ลงทะเบียนเข้าร่วมงาน" closedLabel="ปิดลงทะเบียนเข้าร่วมงาน" open={registrationOpen}/><SignupAction className="secondary" href="/submit" label="สมัครประกวดนวัตกรรม" closedLabel="ปิดรับสมัครประกวด" open={submissionOpen}/></div><div className="hero-event-info"><span><CalendarDays/><small>วันจัดงาน</small><b>24 สิงหาคม 2569</b></span><span><MapPin/><small>สถานที่</small><b>สโมสรตำรวจ</b></span><span><Trophy/><small>ชื่องาน</small><b>ประกวดนวัตกรรมสำนักงานตำรวจแห่งชาติ</b></span></div></div><div className="hero-values right"><span><Lightbulb/>INNOVATION<small>นวัตกรรม</small></span><span><Handshake/>COLLABORATION<small>ความร่วมมือ</small></span><span><CheckCircle2/>EFFICIENCY<small>ประสิทธิภาพ</small></span></div></div></section>
  {featuredNews&&<section className="news-section" id="news"><div className="wide"><div className="news-heading"><div><span className="eyebrow">News</span><h2>ข่าวประชาสัมพันธ์</h2></div><Newspaper/></div><div className="news-layout"><article className="featured-news"><div className="featured-news-media">{featuredNews.imageName&&<img src={`/api/news-images/${encodeURIComponent(featuredNews.imageName)}`} alt={featuredNews.title}/>}</div><div className="featured-news-copy"><span><CalendarDays/>{formatThaiDisplayDate(featuredNews.publishAt)}</span><h3>{featuredNews.title}</h3><p>{featuredNews.excerpt}</p><p>{featuredNews.body}</p></div></article>{moreNews.length>0&&<div className="news-card-grid">{moreNews.map(item=><article key={item.id}><div>{item.imageName&&<img src={`/api/news-images/${encodeURIComponent(item.imageName)}`} alt={item.title}/>}</div><span>{formatThaiDisplayDate(item.publishAt)}</span><h3>{item.title}</h3><p>{item.excerpt}</p></article>)}</div>}</div></div></section>}
  <section className="band" id="project"><div className="wide"><span className="eyebrow">Registration</span><h2>เลือกประเภทการลงทะเบียน</h2><div className="choice-grid"><article><div className="choice-card-head"><span className="choice-icon"><Users/></span><div><span>Event Attendee</span><h3>ลงทะเบียนเข้าร่วมงาน</h3></div></div><p>สำหรับผู้เข้าร่วมงาน ผู้ติดตาม และผู้ที่ต้องการรับ QR Code สำหรับเช็คอิน</p><SignupAction className="primary" href="/register" label="ลงทะเบียนเข้าร่วมงาน" closedLabel="ปิดลงทะเบียนเข้าร่วมงาน" open={registrationOpen}/></article><article><div className="choice-card-head"><span className="choice-icon"><Lightbulb/></span><div><span>Innovation Submission</span><h3>สมัครประกวดนวัตกรรม</h3></div></div><p>กรอกข้อมูลผู้สมัคร รายละเอียดผลงาน และแนบเอกสารประกอบการพิจารณา</p><SignupAction className="secondary" href="/submit" label="สมัครประกวดนวัตกรรม" closedLabel="ปิดรับสมัครประกวด" open={submissionOpen}/></article></div></div></section>
  <section className="project-section"><div className="wide"><span className="eyebrow">Contest Details</span><h2>รายละเอียดข้อมูลการประกวดนวัตกรรม</h2><div className="three-grid"><article><h3>รายละเอียดวัตถุประสงค์การประกวด</h3><p>เปิดพื้นที่ให้ข้าราชการตำรวจนำเสนอแนวคิด ผลงาน และนวัตกรรมที่ช่วยเพิ่มประสิทธิภาพการปฏิบัติงาน ยกระดับการบริการประชาชน และสร้างความปลอดภัยอย่างยั่งยืน</p></article><article><h3>นิยามนวัตกรรม</h3><p>แนวคิด กระบวนการ เครื่องมือ หรือเทคโนโลยีที่สร้างคุณค่าใหม่ สามารถนำไปใช้จริง และแก้ปัญหาได้อย่างมีประสิทธิผล</p></article><article><h3>นวัตกรรมตำรวจ</h3><p>นวัตกรรมที่สนับสนุนภารกิจป้องกันปราบปราม อำนวยความยุติธรรม บริการประชาชน หรือพัฒนาการบริหารจัดการองค์กร</p></article></div>
  <div className="detail-grid" id="awards"><article className="criteria-panel"><div className="criteria-heading"><CheckCircle2/><div><span className="eyebrow">หลักการพิจารณา</span><h3>เกณฑ์การตัดสินโครงการ</h3></div></div><CriteriaToggle rounds={criteriaRounds}/></article><article className="award-panel"><Trophy/><span className="eyebrow">Awards</span><h3>เงินรางวัลและโล่เกียรติยศ</h3><p>ประกาศผลงานดีเด่นพร้อมโล่เกียรติยศ โดยแบ่งรางวัลหลัก 3 อันดับ และรางวัลชมเชยสำหรับผลงานที่ผ่านเกณฑ์โดดเด่น</p><div className="award-grid"><div className="award-card main"><i>01</i><b>รางวัลที่ 1</b><span>ชนะเลิศ</span></div><div className="award-card"><i>02</i><b>รางวัลที่ 2</b><span>รองชนะเลิศอันดับ 1</span></div><div className="award-card"><i>03</i><b>รางวัลที่ 3</b><span>รองชนะเลิศอันดับ 2</span></div><div className="award-card honorable"><i>+</i><b>รางวัลชมเชย</b><span>สำหรับผลงานที่น่าสนใจ</span></div></div></article></div>
  {publishedWinners.length>0&&<div className="winner-board"><div className="winner-board-head"><div><span className="eyebrow">Announcement</span><h3>ประกาศผลการแข่งขัน</h3><p>แสดงผลแยกตามรอบการแข่งขัน ตั้งแต่รอบคัดเลือกเข้าสู่รอบที่ 2 จนถึงรอบประกาศรางวัล</p></div><Trophy/></div><div className="winner-rounds">{finalistWinners.length>0&&<section className="winner-round finalist-round"><div className="winner-round-title"><span>Round 1</span><h4>รายชื่อผลงานที่ผ่านเข้ารอบที่ 2</h4><p>ผู้ผ่านรอบคัดเลือกเตรียมเข้าสู่รอบนำเสนอ/แข่งขันรอบถัดไป</p></div><div className="winner-grid finalist-grid">{finalistWinners.map((winner,index)=><article key={winner.id}><b>{String(index+1).padStart(2,"0")}</b><h4>{winner.projectTitle}</h4><p>{winner.ownerName}</p><small>{winner.division}</small></article>)}</div></section>}{awardWinners.length>0&&<section className="winner-round award-round"><div className="winner-round-title"><span>Final Round</span><h4>ผลรางวัลรอบประกาศผล</h4><p>รางวัลหลัก รางวัลชมเชย และผลงานที่ได้รับการเชิดชูเกียรติ</p></div><div className="winner-grid award-winner-grid">{awardWinners.map(winner=><article className={winner.rank==="1"?"winner-first":""} key={winner.id}><b>{winner.award || formatWinnerAward(winner.rank)}</b><h4>{winner.projectTitle}</h4><p>{winner.ownerName}</p><small>{winner.division}</small></article>)}</div></section>}</div></div>}
  <div className="downloads" id="downloads"><div><span className="eyebrow">Downloads</span><h3>เอกสารและแบบฟอร์มประกวดนวัตกรรม</h3></div><a href="https://drive.google.com/drive/folders/1KityfHfI9iKvYwj91Hyn4SVrP8LnplYS?usp=sharing" target="_blank" rel="noreferrer"><Download/>ดาวน์โหลดรายละเอียดการประกวด</a><a href="https://drive.google.com/drive/folders/1sTtPB9J09CPJRDGFaGcjtiqH2DgzXFqG?usp=sharing" target="_blank" rel="noreferrer"><Download/>ดาวน์โหลดแบบฟอร์มสำหรับส่งประกวด</a></div>
  <div className="schedule" id="schedule"><div className="schedule-heading"><CalendarDays/><span className="eyebrow">Schedule</span><h2>กำหนดการประกวด</h2><p>ลำดับวันสำคัญตั้งแต่เปิดรับสมัครจนถึงวันประกาศผล</p></div><ol className="schedule-timeline">{schedule.map((item,index)=><li key={item.date}><i>{String(index+1).padStart(2,"0")}</i><div><small>{item.phase}</small><b>{item.date}</b><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}</ol></div>
  <div className="faq" id="faq"><span className="eyebrow">คำถามที่พบบ่อย FAQ</span>{faq.map(item=><details key={item.question}><summary>{item.question}<ArrowRight/></summary>{item.answer.map(line=><p key={line}>{line}</p>)}</details>)}</div>
  <div className="location"><div className="location-card-head"><span className="location-icon"><MapPin/></span><div className="location-copy"><span className="eyebrow">Location</span><h3>แผนที่การเดินทาง</h3><p>สโมสรตำรวจ ถนนวิภาวดีรังสิต แขวงตลาดบางเขน เขตหลักสี่ กรุงเทพมหานคร</p></div><a className="secondary map-link" href={mapUrl} target="_blank" rel="noreferrer">เปิดใน Google Maps</a></div><div className="map-frame"><iframe title="แผนที่การเดินทาง Police Innovation Contest 2026" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=13.8688005,100.5743178&z=17&output=embed"/></div></div>
  </div></section>
  </>}

function Prelander({title,message,openAt}:{title:string;message:string;openAt:string}){const openLabel=openAt?new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Bangkok"}).format(new Date(openAt)):"เร็ว ๆ นี้";const initialNow=Date.now();return <section className="prelander-page"><div className="prelander-light-field" aria-hidden="true"><span className="prelander-beam beam-1"/><span className="prelander-beam beam-2"/><span className="prelander-scan scan-1"/><span className="prelander-scan scan-2"/></div><header className="prelander-header"><div className="prelander-brand"><img src="/logo-3d.png" alt={title}/><span/><div><b>POLICE INNOVATION CONTEST</b><small>ROYAL THAI POLICE</small></div></div></header><div className="prelander-hero"><h1>การประกวดนวัตกรรม</h1><h2>สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ.2569</h2><p>{message || "เวทีส่งเสริม ขับเคลื่อน และเชิดชูเกียรตินวัตกรรมสร้างสรรค์เพื่อยกระดับการบริการประชาชนและการพิทักษ์สันติราษฎร์สู่อนาคต"}</p><div className="prelander-panel">{openAt&&<PrelanderCountdown target={openAt} initialNow={initialNow}/>}<div className="prelander-notice"><span><Megaphone/></span><b>กำหนดแจ้งรายละเอียดอีกครั้ง <mark>วันที่ {openLabel}</mark></b></div><a className="prelander-download" href="https://drive.google.com/file/d/1KXKwtK_FcKN6YQBJbtJIKes_GHrSPPF2/view?usp=sharing" target="_blank" rel="noreferrer"><FileText/>ดาวน์โหลดคู่มือการประกวด (PDF)</a></div></div><footer className="prelander-footer"><b>กลุ่มงานวิจัยและพัฒนานวัตกรรมทางเทคโนโลยี บก.สสท.</b><small>RESEARCH AND DEVELOPMENT INNOVATION TECHNOLOGY</small><div><a href="tel:022052193"><Phone/>0 2205 2193</a><a href="mailto:innocontest@police.go.th"><Mail/>innocontest@police.go.th</a></div><Link className="prelander-admin-link" href="/admin">Admin Login</Link><p>© 2026 สำนักงานตำรวจแห่งชาติ • Royal Thai Police. สงวนลิขสิทธิ์ทั้งหมดตามกฎหมาย</p></footer></section>}

function formatWinnerAward(rank: string) {
  return awardLabels[rank] ?? "รางวัลชมเชย";
}

function formatThaiDisplayDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function SignupAction({ className, href, label, closedLabel, open }: { className: string; href: string; label: string; closedLabel: string; open: boolean }) {
  return open
    ? <Link className={className} href={href}>{label}</Link>
    : <span className={`${className} disabled-action`} aria-disabled="true">{closedLabel}</span>;
}
