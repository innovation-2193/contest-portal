# Police Innovation Contest 2026

เว็บลงทะเบียนเข้าร่วมงานและส่งผลงานประกวดนวัตกรรม พัฒนาด้วย Next.js 16, React 19 และ MySQL 8.4 ตามหน้าต้นแบบ 6 หน้าจาก Google Drive

## เปิดใช้งานบนเครื่องนี้

- เว็บไซต์: http://127.0.0.1:3003
- ตรวจระบบ: http://127.0.0.1:3003/api/health
- MySQL: `127.0.0.1:3307`, database `police_innovation`

```powershell
cd C:\contest-portal
powershell -ExecutionPolicy Bypass -File .\scripts\manage.ps1 start
powershell -ExecutionPolicy Bypass -File .\scripts\manage.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\manage.ps1 restart
powershell -ExecutionPolicy Bypass -File .\scripts\manage.ps1 stop
```

MySQL ทำงานใน Docker และตั้ง `restart: unless-stopped` ข้อมูลฐานข้อมูลเก็บใน Docker volume `contest-portal_mysql-data` ส่วน PDF อยู่ใน `storage/uploads`.

## พัฒนาและ build

```powershell
npm.cmd install
docker compose up -d mysql
npm.cmd run dev
npm.cmd run build
```

`npm run build` จะเตรียมไฟล์สำหรับ standalone deployment ให้อัตโนมัติ และ `npm run start` เปิด production ที่พอร์ต 3003

## โครงสร้างข้อมูล

- `users` บัญชีอีเมลผู้ใช้
- `registrations` การลงทะเบียนและรหัส QR
- `submissions` ใบสมัครผลงานเดี่ยวหรือทีม
- `submission_members` ผู้สมัครหลักและสมาชิก สูงสุดรวม 3 คน
- `submission_files` ข้อมูล PDF, ขนาด และ SHA-256
- `audit_logs` ประวัติรายการสำคัญ
- `site_content` รองรับเนื้อหาที่จัดการจากระบบหลังบ้านในอนาคต

## ก่อนนำออกเครือข่ายจริง

เปลี่ยนรหัสผ่าน MySQL ใน `.env.local` และ `docker-compose.yml`, ตั้ง `ADMIN_PASSWORD` และ `ADMIN_SESSION_SECRET` ให้เป็นค่าสุ่มยาวคนละชุด, วาง reverse proxy ที่มี HTTPS, จำกัดสิทธิ์โฟลเดอร์ `storage/uploads`, กำหนดนโยบายสำรองข้อมูล และตรวจข้อความ/วันเวลา/รางวัลกับประกาศทางการอีกครั้ง

ระบบหลังบ้านมีการจำกัดการลองรหัสผ่านผิดซ้ำจาก IP/อุปกรณ์เดียวกัน โดยปรับค่าได้ผ่าน `ADMIN_LOGIN_MAX_FAILURES`, `ADMIN_LOGIN_WINDOW_SECONDS` และ `ADMIN_LOGIN_LOCK_SECONDS`.
