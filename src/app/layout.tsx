import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Agent Atlas · Agent 技术图谱', description: '以问题为起点，探索 AI Agent 的技术演进与工程实践。' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>; }
