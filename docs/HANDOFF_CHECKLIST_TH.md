# Production Handoff Checklist

## ผู้ส่งมอบ

- [ ] ส่ง ZIP และ SHA-256 ผ่านคนละช่องทางเมื่อเหมาะสม
- [ ] ยืนยันว่า ZIP ไม่มี `.env*`, ข้อมูล MySQL, uploads, logs หรือข้อมูลส่วนบุคคล
- [ ] ระบุ Git commit ที่ใช้สร้างชุดส่งมอบ
- [ ] ส่งรายการฟังก์ชันและข้อจำกัดที่ทราบ
- [ ] สาธิต registration, QR, individual submission และ team submission

## ทีมรับช่วง

- [ ] ตรวจ SHA-256 ก่อนแตก ZIP
- [ ] สร้างรหัสผ่าน production ใหม่เอง
- [ ] ตั้ง DNS, HTTPS, firewall และ reverse proxy
- [ ] ตรวจข้อความโครงการกับเจ้าของข้อมูล
- [ ] รัน acceptance test ครบ 10 รายการ
- [ ] ตั้ง backup database และ uploads
- [ ] ทดสอบ restore และ rollback
- [ ] ตั้ง monitoring/alert และผู้รับผิดชอบ on-call
- [ ] ให้ฝ่ายความมั่นคงปลอดภัยและ DPO อนุมัติก่อน Go-live

## ข้อมูลส่งมอบ

- Source commit: บันทึกใน `RELEASE_MANIFEST.txt` ภายใน ZIP
- Health endpoint: `/api/health`
- Application port ภายใน container: `3003`
- Database: MySQL 8.4 / schema `police_innovation`
- Upload limit: PDF 4 ไฟล์ ไม่เกิน 10 MB ต่อไฟล์
- Data volumes: `mysql-production-data`, `uploads-production-data`
