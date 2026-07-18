import { createHash, randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { code } from "../../../lib/codes";
import { getAdminSettings, isContestSubmissionOpen } from "../../../lib/admin-store";
import { db, transaction } from "../../../lib/db";
import { isDatabaseUnavailable } from "../../../lib/local-registrations";
import { createLocalSubmission, findLocalSubmissionByCode } from "../../../lib/local-submissions";
import { participantSessionMaxAge, participantSubmissionCookie } from "../../../lib/participant-session";
import { sendSubmissionConfirmation } from "../../../lib/submission-artifacts";
import { isThaiCitizenId } from "../../../lib/validation";
import { recordAuditEvent } from "../../../lib/audit-log";
export const runtime = "nodejs";

const fields = z.object({
  email:z.string().email(), submissionType:z.enum(["individual","team"]), teamName:z.string().max(255).optional(),
  title:z.string().min(1), firstName:z.string().min(2), lastName:z.string().min(2), citizenId:z.string().regex(/^\d{13}$/).refine(isThaiCitizenId,"หมายเลขบัตรประชาชนไม่ถูกต้อง"), phone:z.string().regex(/^0[689]\d{8}$/,"กรุณากรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09"), position:z.string().min(1), division:z.string().min(2), bureau:z.string().min(2),
  titleTh:z.string().min(2).max(255), titleEn:z.string().max(255).optional(), summary:z.string().min(20).max(500), videoUrl:z.union([z.string().url(),z.literal("")]).optional(),
  consentRules:z.literal("true"), consentPdpa:z.literal("true")
});
const fileTypes = ["ownership","concept","prototype","implementation"] as const;
const memberSchema=z.object({title:z.string().min(1),firstName:z.string().min(2),lastName:z.string().min(2),citizenId:z.string().regex(/^\d{13}$/).refine(isThaiCitizenId,"หมายเลขบัตรประชาชนของสมาชิกไม่ถูกต้อง"),phone:z.string().regex(/^0[689]\d{8}$/,"กรุณากรอกเบอร์มือถือสมาชิก 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09"),email:z.string().email(),position:z.string().min(1),division:z.string().min(2),bureau:z.string().min(2)});
export async function POST(request:Request){
  try{
    if(!isContestSubmissionOpen(await getAdminSettings()))return NextResponse.json({error:"ขณะนี้ระบบปิดรับสมัครส่งผลงานประกวดนวัตกรรม"},{status:403});
    const form=await request.formData(); const data=fields.parse(Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==="string")));
    if(data.submissionType==="team"&&!data.teamName?.trim())throw new Error("กรุณาระบุชื่อทีม");
    const teamMembers=z.array(memberSchema).max(2).parse(JSON.parse(String(form.get("teamMembers")||"[]")));
    const files=fileTypes.map(type=>({type,file:form.get(type)}));
    for(const item of files) if(!(item.file instanceof File)||item.file.type!=="application/pdf"||item.file.size<1||item.file.size>10*1024*1024) throw new Error(`กรุณาแนบ ${item.type} เป็น PDF ขนาดไม่เกิน 10 MB`);
    const submissionId=randomUUID(),submissionCode=code("SUB"),uploadRoot=path.join(process.cwd(),"storage","uploads",submissionId);
    await mkdir(uploadRoot,{recursive:true});
    const stored=[] as Array<{id:string;type:string;original:string;stored:string;mime:string;size:number;hash:string;bytes:Uint8Array}>;
    for(const {type,file} of files){const pdf=file as File,bytes=new Uint8Array(await pdf.arrayBuffer()),storedName=`${type}-${randomUUID()}.pdf`;if(Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")throw new Error(`${pdf.name} ไม่ใช่ไฟล์ PDF ที่ถูกต้อง`);stored.push({id:randomUUID(),type,original:pdf.name.slice(0,255),stored:storedName,mime:pdf.type,size:pdf.size,hash:createHash("sha256").update(bytes).digest("hex"),bytes});}
    for(const item of stored)await writeFile(path.join(uploadRoot,item.stored),item.bytes);
    try{await transaction(async connection=>{
      const candidateUserId=randomUUID();
      await connection.execute("INSERT INTO users(id,email,provider,display_name) VALUES(?,?,'local',?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),updated_at=CURRENT_TIMESTAMP(3)",[candidateUserId,data.email,`${data.firstName} ${data.lastName}`]);
      const [userRows]=await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1",[data.email]);
      const userId=(userRows as Array<{id:string}>)[0].id;
      await connection.execute("INSERT INTO submissions(id,submission_code,user_id,submission_type,team_name,title_th,title_en,summary,video_url,consent_rules,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[submissionId,submissionCode,userId,data.submissionType,data.teamName||null,data.titleTh,data.titleEn||null,data.summary,data.videoUrl||null,true,true]);
      await connection.execute("INSERT INTO submission_members(id,submission_id,member_order,title,first_name,last_name,citizen_id,phone,email,position,division,bureau) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),submissionId,1,data.title,data.firstName,data.lastName,data.citizenId,data.phone,data.email,data.position,data.division,data.bureau]);
      for(const [index,member] of teamMembers.entries())await connection.execute("INSERT INTO submission_members(id,submission_id,member_order,title,first_name,last_name,citizen_id,phone,email,position,division,bureau) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),submissionId,index+2,member.title,member.firstName,member.lastName,member.citizenId,member.phone,member.email,member.position,member.division,member.bureau]);
      for(const item of stored)await connection.execute("INSERT INTO submission_files(id,submission_id,document_type,original_name,stored_name,mime_type,byte_size,sha256) VALUES(?,?,?,?,?,?,?,?)",[item.id,submissionId,item.type,item.original,item.stored,item.mime,item.size,item.hash]);
      await connection.execute("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES(?,?,?,?,?)",[userId,"submission.created","submission",submissionId,JSON.stringify({submissionCode,type:data.submissionType})]);
    });}catch(error){if(isDatabaseUnavailable(error)){await createLocalSubmission({submissionId,submissionCode,data,teamMembers,files:stored});}else{await rm(uploadRoot,{recursive:true,force:true});throw error;}}
    const email=await sendSubmissionConfirmation({submission_code:submissionCode,submission_type:data.submissionType,team_name:data.teamName||null,title_th:data.titleTh,title_en:data.titleEn||null,email:data.email,title:data.title,first_name:data.firstName,last_name:data.lastName,phone:data.phone,position:data.position,division:data.division,bureau:data.bureau});
    await recordAuditEvent({
      actor:{type:"public",email:data.email},
      action:"submission.created",
      entityType:"submission",
      entityId:submissionCode,
      summary:`สมัครประกวดนวัตกรรม ${submissionCode}`,
      payload:{submissionCode,submissionType:data.submissionType,titleTh:data.titleTh},
    },request.headers);
    return submissionResponse(submissionCode,email.status,201);
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:"ไม่สามารถส่งผลงานได้"},{status:422});}
}

export async function GET(request:Request){const codeValue=new URL(request.url).searchParams.get("code");if(!codeValue)return NextResponse.json({error:"code is required"},{status:400});let row:unknown;try{const [rows]=await db.execute("SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.video_url,s.status,s.submitted_at,u.email,m.title,m.first_name,m.last_name,m.citizen_id,m.phone,m.position,m.division,m.bureau FROM submissions s JOIN users u ON u.id=s.user_id JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1 WHERE s.submission_code=? LIMIT 1",[codeValue]);row=(rows as unknown[])[0];}catch(error){if(!isDatabaseUnavailable(error))throw error;row=await findLocalSubmissionByCode(codeValue);}return row?NextResponse.json(row):NextResponse.json({error:"not found"},{status:404});}

function submissionResponse(submissionCode:string,emailStatus:string,status:number){
  const response=NextResponse.json({submissionCode,emailStatus},{status});
  response.cookies.set(participantSubmissionCookie,submissionCode,{
    httpOnly:true,
    sameSite:"lax",
    path:"/",
    maxAge:participantSessionMaxAge,
  });
  return response;
}
