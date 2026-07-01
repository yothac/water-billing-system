# FINAL SYSTEM CHECK - Water Billing System

## Phase 2 Final Check

### 1. Restart Dev Server
เปิด Terminal ที่โฟลเดอร์โปรเจกต์ แล้วรัน:

taskkill /IM node.exe /F
npm run dev

หลังแก้ package.json แล้ว คำสั่ง npm run dev จะใช้ Webpack:
next dev --webpack

### 2. Main Pages
ตรวจหน้าเหล่านี้:
- http://localhost:3000
- http://localhost:3000/meter-reading
- http://localhost:3000/payments
- http://localhost:3000/reports
- http://localhost:3000/receipt
- http://localhost:3000/receipts-bulk
- http://localhost:3000/print-report
- http://localhost:3000/exports
- http://localhost:3000/backup
- http://localhost:3000/data-doctor

### 3. Data Link Check
ข้อมูลต้องไหลตามนี้:

users -> readings -> payments -> reports -> receipt -> backup -> exports

เช็ก:
- Backup users ต้องไม่เป็น []
- Reports แสดงชื่อผู้ใช้น้ำครบ
- Payments รับชำระแล้ว Reports ต้องเปลี่ยนเป็น "ชำระแล้ว"
- ยกเลิกชำระแล้ว Reports ต้องกลับเป็น "ค้างชำระ"
- Receipt ต้องเปิดถูกคน ถูกยอด
- Receipts bulk ต้องพิมพ์ A4 ได้ 6 ใบต่อหน้า
- Print report ต้องพิมพ์ตาราง A4 ได้
- Exports CSV ต้องเปิด Excel แล้วภาษาไทยไม่เพี้ยน

### 4. Data Doctor
เปิด:
http://localhost:3000/data-doctor

กด:
- ซ่อมข้อมูลแบบปลอดภัย
- Backup ตอนนี้

จากนั้นเปิด:
http://localhost:3000/backup

ตรวจ:
- users ไม่เป็น 0
- readings หา user เจอ
- payments คนละรอบมีได้ถ้าเป็นข้อมูลเก่า แต่รอบปัจจุบันต้องตรง

### 5. Build Check
รัน:

npm run typecheck
npm run build

ถ้า build ผ่าน ถือว่า Phase 2 พร้อมใช้งานระดับ localStorage MVP

### 6. Print Setting
เวลา Print:
- Layout: Landscape
- Paper size: A4
- Margins: None หรือ Default
- Scale: 100
- Headers and footers: ปิด
- Background graphics: เปิด
