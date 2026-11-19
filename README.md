# 🎸 mellowchords (คลังคอร์ดกลางคืน)

**mellowchords** คือสมุดคอร์ดเพลงดิจิทัล (Progressive Web App - PWA) ที่ออกแบบมาเป็นพิเศษสำหรับนักดนตรีกลางคืน (Night Buskers & Performers) เพื่อใช้ค้นหาเพลง เล่นสดบนเวที จัด Playlist ซิงก์ข้อมูล และใช้งานออฟไลน์ได้ 100% โดยไม่ต้องพึ่งพาสัญญาณอินเทอร์เน็ต

---

## 🌟 ฟีเจอร์เด่น (Key Features)

### 1. 📲 Progressive Web App (PWA) & ใช้งานออฟไลน์ 100%
- **ติดตั้งลงมือถือ/แท็บเล็ตได้เสมือนแอปจริง:** รองรับทั้ง iOS (Add to Home Screen) และ Android / Chrome / Windows / Mac
- **Offline First:** ติดตั้ง Service Worker (`sw.js`) และ Web Manifest แคชโค้ด ฟอนต์ และรูปภาพทั้งหมดไว้ในเครื่อง เปิดแอปเล่นได้ทันทีแม้ในร้านที่ไม่มีสัญญาณเน็ต
- **💡 Screen Wake Lock (จอไม่ดับบนเวที):** ขณะเปิดดูคอร์ดเพลงหรืออยู่ในโหมดเวที ระบบจะป้องกันไม่ให้หน้าจอดับหรือล็อคอัตโนมัติ

### 2. 🔍 AI / OCR & Smart Web Scraper
- **สแกนคอร์ดจากภาพ (OCR):** มีระบบ AI / OCR (Tesseract.js สำหรับภาษาไทยและอังกฤษ) สแกนภาพถ่ายชีทคอร์ดหรือสกรีนช็อต แล้วแปลงเป็นตัวหนังสือและคอร์ดที่นำไปทดคีย์ต่อได้ทันที
- **ดึงคอร์ดจากลิงก์เว็บอัตโนมัติ (Multi-Proxy Scraper):** วางลิงก์หน้าเพลงจากเว็บคอร์ด (เช่น Chordtabs, Blog, Sanook) ระบบจะดึงเนื้อหา แยกชื่อเพลง ศิลปิน ตัดโฆษณา และจัดระเบียบท่อนเพลงให้ทันที
- **✨ จัดระเบียบเนื้อเพลง & คอร์ด (Smart Format):** ปุ่มทำความสะอาดเนื้อเพลง ปรับมาตรฐานชื่อท่อน (`[Intro]`, `[Verse]`, `[Chorus]`, `[Solo]`, `[Bridge]`, `[Outro]`) พร้อมฟังก์ชันแปลงคอร์ดสองบรรทัดเป็นรูปแบบ `[G]เนื้อเพลง` เพื่อไม่ให้คอร์ดเลื่อนเมื่อดูบนหน้าจอมือถือ

### 3. 🎭 โหมดเวที & เครื่องมือเล่นดนตรีสด (Stage Mode & Live Tools)
- **โหมดเวทีไร้สิ่งรบกวน (Stage / Focus Mode):** ซ่อนแถบเมนูที่ไม่จำเป็น ขยายเนื้อเพลงเต็มจอ
- **เลื่อนหน้าจออัตโนมัติ (Auto-Scroll):** ปรับความเร็วได้ 4 ระดับ (ช้า, กลาง, เร็ว, เร็วมาก) แตะหน้าจอเพื่อหยุดชั่วคราว
- **ระบบทดคีย์ (Smart Transpose):** ปรับคีย์ขึ้น-ลงทีละครึ่งเสียง พร้อมสลับคอร์ดแฟลต (b) / ชาร์ป (#) อัตโนมัติตามทฤษฎีดนตรี
- **ปรับขนาดตัวอักษร:** ปรับฟอนต์ให้ใหญ่สะใจ มองเห็นได้ชัดเจนในที่มืด

### 4. 🎼 Playlist & ซิงก์คลาวด์ (Cloud Sync with Supabase)
- **จัดการ Playlist (Setlist):** จัดลำดับเพลงที่จะเล่นในแต่ละคืน เรียงลำดับขึ้น-ลงได้ง่าย
- **แชร์เซ็ตเพลง:** ส่งลิงก์ Playlist ให้เพื่อนในวงเปิดดูตามได้ทันที
- **ซิงก์ข้อมูลคลาวด์:** เชื่อมต่อ Supabase สำหรับแบ็กอัปและซิงก์เพลง ข้อมูล Playlist และรูปภาพคอร์ดข้ามอุปกรณ์
- **สำรองและกู้คืน (Backup & Export):** ส่งออกไฟล์ JSON (รวมข้อมูลรูปภาพ) และนำเข้ากลับมาได้ทุกเมื่อ

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
mellowchords/
├── index.html              # หน้าเว็บหลัก Semantic HTML5
├── app.css                 # สไตล์ชีท Dark Glassmorphism, Responsive, Section Badges
├── app.js                  # สคริปต์หลัก (Parser, Scraper, OCR, Player, Sync, Storage)
├── sw.js                   # Service Worker สำหรับ Offline Caching
├── manifest.webmanifest    # PWA Web App Manifest
├── icon.svg                # ไอคอนเวกเตอร์ SVG
├── icon-192.png            # ไอคอน PWA 192x192
├── icon-512.png            # ไอคอน PWA 512x512
├── icon-maskable.png       # ไอคอน PWA Maskable สำหรับ Android
└── README.md               # เอกสารประกอบการใช้งาน
```

---

## 🚀 วิธีเปิดใช้งาน (Getting Started)

### รันบนเครื่องสำหรับทดสอบ (Local Development)
เนื่องจากเป็น Static Web App สามารถเปิดได้ผ่านเว็บเซิร์ฟเวอร์ใดก็ได้ เช่น:

```bash
# ใช้ Node.js
npx serve .

# หรือใช้ Python
python3 -m http.server 8080
```
จากนั้นเปิดเบราว์เซอร์ไปที่ `http://localhost:8080`

### การ Deploy ขึ้น Hosting
สามารถ Deploy ไปยังแพลตฟอร์ม Static Hosting ฟรีได้ทันที:
- **GitHub Pages:** ไปที่ Settings -> Pages -> Source: Deploy from branch `main`
- **Cloudflare Pages / Vercel / Netlify:** เชื่อมต่อ Repository แล้วกด Deploy ได้ทันทีโดยไม่ต้องรันคำสั่ง build