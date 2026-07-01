# Phase 3 Step 1 - middleware.ts to proxy.ts

## สิ่งที่ต้องทำ

1. วางไฟล์ `proxy.ts` ไว้ที่ root โปรเจกต์

ตำแหน่ง:
proxy.ts

2. ลบไฟล์เก่าออก

ลบ:
middleware.ts

3. ปิด dev server เดิม

Windows:
taskkill /IM node.exe /F

4. รันใหม่

npm run dev

5. เช็ก typecheck/build

npm run typecheck
npm run build

## ผลที่ต้องได้

- ไม่มี warning เรื่อง middleware deprecated
- login ยังทำงาน
- ถ้ายังไม่ login แล้วเข้า /reports ต้องเด้งไป /login
- login แล้วเข้าเมนูต่าง ๆ ได้ปกติ
- npm run build ผ่านเหมือนเดิม
