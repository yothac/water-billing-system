import type { Metadata } from "next"; import "./globals.css"; import SessionWatcher from "./_components/SessionWatcher";
export const metadata: Metadata = { title:"ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน", description:"ระบบจดมิเตอร์ คิดเงิน รับชำระ และรายงาน" };
export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="th"><body><SessionWatcher />{children}</body></html>; }
