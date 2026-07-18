# คู่มือติดตั้ง Production สำหรับทีมรับช่วง

## 1. ชุดไฟล์ที่ต้องรับ

ใช้ไฟล์ `police-innovation-contest-production.zip` เพียงไฟล์เดียว แล้วตรวจค่า SHA-256 ที่ผู้ส่งมอบแจ้งให้ตรงกันก่อนแตกไฟล์

ห้ามส่งหรือรับไฟล์ต่อไปนี้ผ่านชุด source code:

- `.env.local` หรือ `.env.production` ที่มีรหัสผ่านจริง
- `node_modules`, `.next`, `.git`
- `storage` จากระบบจริง เช่น ไฟล์แนบ, การตั้งค่าหลังบ้าน, admin users, audit log และ email outbox
- MySQL data volume หรือ database dump ที่มีข้อมูลส่วนบุคคล เว้นแต่ใช้ช่องทางเข้ารหัสที่หน่วยงานอนุมัติ

## 2. สถาปัตยกรรมที่แนะนำ

```text
Internet / Intranet
       |
HTTPS Reverse Proxy หรือ Load Balancer
       |
127.0.0.1:3003 -> Next.js container
                       |
                 MySQL 8.4 container
```

เปิดสู่ภายนอกเฉพาะพอร์ต `443` ของ reverse proxy ไม่ควรเปิดพอร์ต MySQL และไม่ควรเปิดพอร์ต `3003` สู่อินเทอร์เน็ตโดยตรง

## 3. ข้อกำหนดเครื่องแม่ข่าย

- Linux Server 64-bit ที่ยังได้รับ security updates
- Docker Engine 26+ และ Docker Compose v2
- CPU ขั้นต่ำ 2 cores, RAM ขั้นต่ำ 4 GB, disk เริ่มต้น 30 GB
- DNS ของโดเมนจริงและ TLS certificate ที่ถูกต้อง
- ระบบสำรองข้อมูลที่เข้ารหัสและพื้นที่ log ตามนโยบายหน่วยงาน
- เวลาเครื่องเป็น NTP และ timezone `Asia/Bangkok`

## 4. เตรียม Environment

```bash
unzip police-innovation-contest-production.zip
cd contest-portal
cp .env.production.example .env.production
chmod 600 .env.production
```

แก้ `.env.production`:

1. สร้างรหัสผ่านแบบสุ่มอย่างน้อย 24 ตัวอักษร โดยรหัส app และ root ต้องไม่เหมือนกัน
2. หากรหัสผ่านมีอักขระพิเศษ ให้ URL-encode เฉพาะส่วน password ใน `DATABASE_URL`
3. กำหนด `NEXT_PUBLIC_BASE_URL` เป็น URL HTTPS จริง
4. คง `APP_BIND_ADDRESS=127.0.0.1` เมื่อมี reverse proxy บนเครื่องเดียวกัน

ห้าม commit `.env.production` เข้า Git

## 5. Build และเปิดระบบ

```bash
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml build --pull
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
```

ตรวจ health จากเครื่อง server:

```bash
curl --fail http://127.0.0.1:3003/api/health
```

ผลที่คาดหวังต้องมี `"status":"ready"`, `"database":"mysql"` และ HTTP 200

## 6. Reverse Proxy และ HTTPS

ตั้ง reverse proxy ไปที่ `http://127.0.0.1:3003` พร้อมข้อกำหนดต่อไปนี้:

- บังคับ redirect HTTP ไป HTTPS
- ใช้ TLS 1.2 หรือใหม่กว่า
- จำกัด request body อย่างน้อย 45 MB เพื่อรองรับ PDF 4 ไฟล์
- ตั้ง proxy timeout อย่างน้อย 120 วินาที
- ส่ง `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- เพิ่ม HSTS หลังตรวจว่า HTTPS ทำงานถูกต้องทุก subdomain ที่เกี่ยวข้อง
- ไม่ cache เส้นทาง `/api/*`, `/register/success*`, `/submit/success*`

ตัวอย่าง Nginx location:

```nginx
client_max_body_size 45m;

location / {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

## 7. Acceptance Test ก่อนเปิดใช้

ตรวจอย่างน้อยรายการต่อไปนี้:

1. หน้าแรก, Privacy และ PDPA ตอบ HTTP 200
2. ลงทะเบียนด้วยเลขบัตรที่ checksum ถูกต้องและได้รับ QR Code
3. อีเมลหรือเลขบัตรซ้ำถูกปฏิเสธ
4. ส่งผลงานเดี่ยวพร้อม PDF จริง 4 ไฟล์สำเร็จ
5. ส่งผลงานทีมรวม 3 คนสำเร็จ
6. ไฟล์เกิน 10 MB, ไฟล์ไม่ใช่ PDF และเลขบัตรผิดถูกปฏิเสธ
7. ตรวจ desktop, tablet และ mobile โดยไม่มีข้อความหรือปุ่มล้น
8. รีสตาร์ต containers แล้วข้อมูลเดิม ไฟล์แนบ การตั้งค่าหลังบ้าน และบัญชีแอดมินยังอยู่
9. ตรวจว่า MySQL ไม่เปิดพอร์ตสาธารณะ
10. ตรวจ server/container logs ว่าไม่มี error หรือข้อมูลส่วนบุคคลที่ไม่ควรบันทึก

## 8. สำรองและกู้คืน

สำรองฐานข้อมูล โดยใช้ช่องทางจัดเก็บที่เข้ารหัส:

```bash
docker compose --env-file .env.production -f compose.production.yml exec -T mysql \
  sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction "$MYSQL_DATABASE"' \
  | gzip > police_innovation_$(date +%Y%m%d_%H%M%S).sql.gz
```

Docker volumes `app-storage-production-data` และ `uploads-production-data` ต้องสำรองพร้อมฐานข้อมูลใน recovery point เดียวกัน ทดสอบ restore ในเครื่องแยกอย่างน้อยรายไตรมาส และกำหนด retention ตามนโยบาย PDPA ของหน่วยงาน

## 9. อัปเดตเวอร์ชัน

```bash
docker compose --env-file .env.production -f compose.production.yml build --pull web
docker compose --env-file .env.production -f compose.production.yml up -d --no-deps web
curl --fail http://127.0.0.1:3003/api/health
```

ก่อนอัปเดตต้องสำรองข้อมูลและไฟล์แนบ เก็บ image/version เดิมไว้สำหรับ rollback และทดสอบ Set A ซึ่งเป็น flow ที่เคยถูกต้องทั้งหมด

## 10. Rollback

1. หยุดรับรายการใหม่ชั่วคราวที่ reverse proxy
2. ตรวจว่าไม่มี request อัปโหลดค้าง
3. นำ source/image รุ่นก่อนกลับมา build หรือ deploy
4. หาก schema หรือข้อมูลเปลี่ยน ให้ restore database และ uploads จาก recovery point เดียวกัน
5. เปิดระบบและรัน acceptance test อีกครั้ง

## 11. Security ก่อน Go-live

- ยืนยันข้อความ วันเวลา รางวัล อีเมล และนโยบายกับเจ้าของโครงการ
- ทำ vulnerability scan ของ container images และ dependencies
- จำกัดสิทธิ์ผู้ดูแล Docker และไฟล์ `.env.production`
- ตั้ง firewall, rate limit, monitoring, alert และ log retention
- จัดทำ incident response และผู้รับผิดชอบกรณีข้อมูลส่วนบุคคลรั่วไหล
- ให้ DPO/ฝ่ายกฎหมายตรวจ Privacy และ PDPA ฉบับสุดท้าย
- ระบบปัจจุบันใช้การลงทะเบียนด้วยอีเมลโดยตรง ไม่ได้เปิด Google/Microsoft OAuth

## 12. คำสั่งดูแลประจำวัน

```bash
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 web
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 mysql
docker compose --env-file .env.production -f compose.production.yml restart web
```
