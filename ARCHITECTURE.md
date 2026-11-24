# 🏗️ สถาปัตยกรรมระบบ Mellow Chords

เอกสารนี้อธิบายโครงสร้างสถาปัตยกรรม การไหลของข้อมูล โครงสร้างฐานข้อมูล ระบบจัดการผู้ใช้และสิทธิ์การเข้าถึง (RBAC) ของโปรเจกต์ **Mellow Chords** เพื่อใช้อ้างอิงในการพัฒนาต่อยอดโดยไม่กระทบการทำงานเดิม

---

## 1. ภาพรวมระบบ (System Overview)

- **รูปแบบแอปพลิเคชัน:** Static, Zero-Build Progressive Web App (PWA) พัฒนาด้วย Vanilla HTML5 / CSS3 / ES6+ ทำงานแบบ Single-Page Application (SPA)
- **การทำงานแบบ Offline-First:**
  - แคช App Shell ผ่าน Service Worker (`sw.js`)
  - จัดเก็บคลังเพลง เซ็ตลิสต์ และการตั้งค่าใน `localStorage`
  - จัดเก็บรูปภาพชีทคอร์ด (`Blob`) ใน `IndexedDB` (`ct-img-<songId>`, `img-<id>`)
- **ระบบบัญชีแบบไฮบริด (Hybrid Local + Cloud BaaS):**
  - **Local Profile Mode:** ใช้งานออฟไลน์ในเครื่องได้ทันทีโดยไม่ต้องต่อเซิร์ฟเวอร์
  - **Supabase Cloud Mode:** ยืนยันตัวตนผ่าน Supabase Auth (`auth.users`) ตรวจสอบสิทธิ์ผ่านตาราง `public.profiles` และซิงก์ข้อมูลเพลง (`songs`), เซ็ตเพลง (`playlists`, `playlist_items`), และไฟล์ภาพ (`storage.objects` ในบัคเก็ต `chord-images`)

---

## 2. โครงสร้างไฟล์หลัก (Codebase Structure)

```text
mellowchords/
├── index.html                                              # โครงสร้าง SPA Shell, Header, Views (#editorView, #songView, #plView, #adminView), Bottom Nav
├── app.css                                                 # ระบบสไตล์ Dark Glassmorphism, Responsive 2-Pane/Mobile, Stage Mode, Admin UI & RBAC rules
├── app.js                                                  # ลอจิกหลักทั้งหมด (Music Theory, Scraper, <5s Image Pipeline, OCR, Storage, Auth/RBAC, Admin UI, Sync, Module Wiring)
├── components/
│   ├── setlist-picker/                                     # โมดูลเลือกเพลงจากคลังและค้นหาออนไลน์เข้าเซ็ตลิสต์
│   │   ├── setlist-picker.service.js                       # ลอจิกกรองคลังเพลง, ตรวจจับเพลงซ้ำ 4 ระดับ, และ Online Auto-Add
│   │   ├── setlist-picker.js                               # UI Side Panel (เดสก์ท็อป) / Bottom Drawer (มือถือ) พร้อม 2 แท็บ (คลังเพลง & ออนไลน์)
│   │   └── setlist-picker.css                              # สไตล์แบบ Scoped (.sp-*) รองรับ Responsive
│   └── chord-parser/                                       # โมดูลแกะคอร์ดจากรูปภาพและสลับโหมด Image/Text
│       ├── chord-parser.service.js                         # ระบบแกะคอร์ดจากภาพ (Canvas Preprocess + Tesseract BBox Alignment + Transpose + DB/Local Cache)
│       ├── chord-dual-view.js                              # ปุ่มสลับ Image View <-> Text View พร้อมแถบแสดงคีย์, ปุ่ม +/- ทดคีย์ และโหมด Monospace/ChordPro
│       └── chord-dual-view.css                             # สไตล์แบบ Scoped (.cdv-*) สำหรับการอ่านบนเวที
├── features/
│   └── midi/                                               # โมดูลควบคุมการเปลี่ยนเพลงด้วย MIDI Footswitch
│       ├── midi-footswitch.js                              # Hook/Controller (useMidiFootswitch) ใช้ Web MIDI API, Debounce, MIDI Learn, LocalStorage & Simulator
│       ├── midi-settings.js                                # หน้าต่างตั้งค่า MIDI Settings, ปุ่ม MIDI Learn, ปุ่มจำลองสัญญาณ และสถานะการเชื่อมต่อ
│       └── midi-settings.css                               # สไตล์แบบ Scoped (.midi-*) พร้อมแอนิเมชันสถานะ MIDI Learn
├── sw.js                                                   # Service Worker (v21) สำหรับแคช App Shell, โมดูลทั้งหมด และรูปภาพจาก Proxy
├── manifest.webmanifest                                    # PWA Web Manifest
├── supabase/
│   └── migrations/
│       ├── 20261124000000_user_approval.sql                # Migration ระบบอนุมัติผู้สมัครเริ่มต้น (profiles, status, Restrictive RLS)
│       └── 20261124010000_rbac_user_management.sql         # Migration ระบบ RBAC (role, is_active, sync trigger, self-lockout protection, RLS grants)
├── tests/
│   └── e2e.mjs                                             # ชุดทดสอบอัตโนมัติ Playwright E2E (ครอบคลุมฟีเจอร์หลัก, Latency <5s, Approval และ RBAC)
├── PROJECT.md                                              # บันทึก Milestone และสัญญาอินเทอร์เฟซของระบบ
└── README.md                                               # คู่มือเริ่มต้นใช้งานและการ Deploy
```

---

## 3. มุมมองและการนำทาง (SPA Views & Routing)

แอปพลิเคชันควบคุมการแสดงผลผ่าน `document.body.dataset.view` และฟังก์ชัน `show(name, push)` ร่วมกับ Hash/History Router (`route()`):

| View (`data-view`) | DOM Container | URL / Route | สิทธิ์การเข้าถึง | คำอธิบาย |
|---|---|---|---|---|
| `home` | `#side` + `#placeholder` | `/` | ทุกคน | ค้นหาเพลง (ในคลัง + เว็บคอร์ด) และแสดงคลังเพลงส่วนตัว |
| `playlists` | `#side` (`#plSection`) | (State `playlists`) | ทุกคน | รายการเซ็ตเพลง (Setlist) ทั้งหมด |
| `playlist` | `#plView` | `#/p/<token>`, `#/s/<payload>` | ทุกคน | รายละเอียดเซ็ตเพลง จัดลำดับเพลง และเปิดลิงก์แชร์เซ็ตเพลง |
| `editor` | `#editorView` | (State `editor`) | ทุกคน | เพิ่ม/แก้ไขเพลง ดึงคอร์ดจาก URL จัดโครงสร้างท่อน และสแกนภาพด้วย OCR |
| `song` | `#songView` | (State `song`) | ทุกคน | หน้าแสดงคอร์ดสำหรับเล่นสด ทดคีย์ Capo Metronome Auto-Scroll และโหมดเวที |
| `admin` | `#adminView` | `#/admin` | **เฉพาะ `admin` ที่ `is_active = true` และ `status = 'approved'`** | หน้าจัดการผู้ใช้งานทั้งหมด ค้นหา กรอง สลับ Role และเปิด/ปิดบัญชี |

---

## 4. ระบบจัดการผู้ใช้และสิทธิ์ Admin (Authentication, Approval & RBAC)

### 4.1 โครงสร้างตาราง `public.profiles` (Database Schema)

เชื่อมโยงแบบ `1:1` กับ `auth.users` ผ่าน Foreign Key `id`:

| คอลัมน์ | ชนิดข้อมูล | ค่าเริ่มต้น / เงื่อนไข | คำอธิบาย |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` | รหัสผู้ใช้จาก Supabase Auth |
| `email` | `text` | `NOT NULL` | อีเมลผู้ใช้ (หรือ `<username>@mellowchords.local`) |
| `username` | `text` | `NULL` | ชื่อที่แสดงผล (ค่าเริ่มต้นตัดจากส่วนหน้า `@`) |
| `role` | `text` | `NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'))` | บทบาทผู้ใช้ในระบบ RBAC (`admin` หรือ `user`) |
| `is_active` | `boolean` | `NOT NULL DEFAULT true` | สถานะเปิดใช้งานบัญชี (`true` = ใช้งานปกติ, `false` = ระงับการใช้งาน) |
| `status` | `text` | `NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))` | สถานะการอนุมัติผู้สมัครใหม่ |
| `is_admin` | `boolean` | `NOT NULL DEFAULT false` | ฟิลด์เดิมที่ถูกซิงก์อัตโนมัติกับ `role = 'admin'` เพื่อความเข้ากันได้ย้อนหลัง |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | วันเวลาที่สร้างบัญชี |
| `approved_at` | `timestamptz` | `NULL` | วันเวลาที่ได้รับการอนุมัติ |
| `approved_by` | `uuid` | `REFERENCES auth.users(id) ON DELETE SET NULL` | รหัสแอดมินผู้อนุมัติ |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | วันเวลาที่แก้ไขข้อมูลโปรไฟล์ล่าสุด |

### 4.2 Database Triggers & RLS Policies (Backend Guard)

1. **`public.handle_new_user()` (`AFTER INSERT ON auth.users`):**
   - สร้างแถวใน `public.profiles` อัตโนมัติเมื่อสมัครสมาชิก ตั้งค่า `role = 'user'`, `status = 'pending'`, `is_active = true` (ยกเว้นบัญชีแอดมินตั้งต้น `bierbebad@mellowchords.local` ที่ได้ `role = 'admin'`, `status = 'approved'`)
2. **`public.sync_profile_rbac_fields()` (`BEFORE INSERT OR UPDATE ON public.profiles`):**
   - ซิงก์ค่า `role` <-> `is_admin` แบบสองทางอัตโนมัติ เพื่อให้โค้ดเดิมและโค้ดใหม่ทำงานร่วมกันได้ 100%
   - อัปเดต `updated_at = now()` ทุกครั้งที่มีการแก้ไข
   - **Self-Lockout Protection:** ป้องกันไม่ให้ Admin ลดสิทธิ์ตัวเอง (`role -> 'user'`), ปิดการใช้งานบัญชีตัวเอง (`is_active -> false`), หรือยกเลิกการอนุมัติบัญชีตัวเองในระดับ Database
3. **SECURITY DEFINER Helper Functions:**
   - `public.is_user_active()` — ตรวจสอบว่าผู้ใช้ปัจจุบันมี `is_active = true`
   - `public.is_admin()` — ตรวจสอบว่าผู้ใช้ปัจจุบันมี `role = 'admin'` (หรือ `is_admin = true`), `is_active = true`, และ `status = 'approved'`
   - `public.is_approved()` — ตรวจสอบว่าผู้ใช้ปัจจุบันมี `status = 'approved'` **และ** `is_active = true`
4. **Row-Level Security (RLS) & Grants:**
   - `public.profiles`:
     - `SELECT`: อ่านแถวของตัวเองได้ (`id = auth.uid()`) หรืออ่านได้ทั้งหมดหากผ่าน `public.is_admin()`
     - `UPDATE`: อนุญาตเฉพาะ `public.is_admin()` เท่านั้น และจำกัดสิทธิ์ระดับคอลัมน์ (`status`, `approved_at`, `approved_by`, `role`, `is_admin`, `is_active`, `updated_at`)
   - ตารางข้อมูล (`songs`, `playlists`, `playlist_items`) และ Storage (`chord-images`):
     - ใช้ **Restrictive Policy** บังคับ `public.is_approved()` ทำให้ผู้ใช้ที่ยังรออนุมัติ (`pending`), ถูกปฏิเสธ (`rejected`), หรือถูกปิดบัญชี (`is_active = false`) ไม่สามารถอ่านหรือเขียนข้อมูลบนคลาวด์ได้ทันที

### 4.3 Frontend RBAC Helpers & Route Protection (`app.js` & `app.css`)

- **ฟังก์ชันตรวจสอบสิทธิ์หลัก:**
  - `getUserRole(p)` — คืนค่า `'admin'` หรือ `'user'` (รองรับ Fallback จาก `p.is_admin` หากฐานข้อมูลยังไม่ได้รัน Migration ใหม่)
  - `isUserActive(p)` — คืนค่า `true` เมื่อ `p.is_active !== false`
  - `isAdminUser()` — คืนค่า `true` เฉพาะเมื่อล็อกอินด้วยบัญชีคลาวด์, `getUserRole() === 'admin'`, `isUserActive() === true`, และ `approval === 'approved'`
  - `cloudOn()` — อนุญาตซิงก์คลาวด์เฉพาะเมื่อ `isUserActive() === true` และสถานะผ่านการอนุมัติ
  - `requireAdmin()` & `redirectUnauthorizedAdmin()` — Guard สำหรับตรวจสอบสิทธิ์ก่อนเปิดหน้าหรือทำรายการของ Admin
- **การซ่อนเมนูและปุ่มเฉพาะ Admin (`syncAdminUI()`):**
  - ปุ่ม `#adminNavBtn` บน Header, แท็บ `#bottomAdminTab` ในแถบนำทางด้านล่าง, และปุ่ม `👥 จัดการผู้ใช้ทั้งหมด` ในหน้าตั้งค่าบัญชี จะถูกตั้ง `hidden = true` เป็นค่าเริ่มต้น และเสริมด้วยกฎ CSS `body:not(.is-admin) .adminOnly, body:not(.is-admin) #adminView { display: none !important; }`
- **การป้องกันการเข้าถึงผ่าน URL โดยตรง:**
  - ดักจับทั้ง `#/admin`, `?view=admin`, `/admin`, การเรียก `show('admin')`, `popstate`, และการออกจากระบบ (`doSignOut()`)
  - หากเปิดลิงก์ `#/admin` ตอนโหลดหน้าใหม่ ระบบจะรอ `authReadyPromise` / `loadProfile()` ให้เสร็จก่อนตัดสินใจ หากผู้ใช้ไม่มีสิทธิ์ `admin` ระบบจะล้าง URL กลับสู่หน้าหลัก (`history.replaceState`), สลับกลับมุมมอง `home`, และแจ้งเตือนผ่าน Toast ทันที
- **กรณีบัญชีถูกระงับ (`is_active = false`):**
  - ปิดการซิงก์คลาวด์ทันที แสดงหน้าต่างแจ้งเตือนสถานะบัญชีถูกระงับ (`#pendingGate`) แต่ยังคงอนุญาตให้เปิดดูคอร์ดที่บันทึกไว้ในเครื่องแบบออฟไลน์ได้เพื่อไม่ให้กระทบการเล่นสดบนเวที

### 4.4 แถบจัดการผู้ใช้สำหรับ Admin (`#adminView`)

เข้าถึงได้ผ่านปุ่ม Header `🛡️ จัดการผู้ใช้`, แท็บเมนูด้านล่าง `จัดการผู้ใช้`, ปุ่มในโมดอลบัญชีผู้ใช้, หรือ URL `#/admin`:
1. **การ์ดสรุปสถิติ (`#adminStatsBar`):** แสดงจำนวนผู้ใช้ทั้งหมด, Admin, บัญชีที่เปิดใช้งาน, บัญชีที่ปิดใช้งาน, และผู้สมัครรออนุมัติ
2. **ค้นหาและตัวกรอง (`#adminSearchInput`, `#adminFilterBar`):** ค้นหาแบบ Real-time จากชื่อผู้ใช้หรืออีเมล พร้อมตัวกรอง (`ทั้งหมด`, `Admin`, `User`, `เปิดใช้งาน`, `ปิดใช้งาน`, `รออนุมัติ`)
3. **การจัดการรายบุคคล (`#adminUserList`):**
   - เปลี่ยน Role (`admin` <-> `user`) พร้อมกล่องยืนยันก่อนบันทึก (`confirmAdminRoleChange`)
   - เปิด/ปิดการใช้งานบัญชี (`is_active` toggle)
   - อนุมัติหรือปฏิเสธผู้สมัครใหม่ได้ทันทีจากรายการเดียวกัน
   - ปิดปุ่มแก้ไข Role และปุ่มระงับบัญชีของแถวตัวเอง (`isSelf`) เพื่อป้องกัน Admin เผลอล็อกตัวเอง

### 4.5 ระบบสมัครสมาชิกแบบง่ายและกระบวนการอนุมัติ (Simplified Registration & Sync)

1. **การแยกแท็บ เข้าสู่ระบบ (`signin`) และ สมัครสมาชิก (`signup`):**
   - หน้าต่างบัญชีมีแท็บชัดเจน ไม่สับสน
   - หน้าสมัครสมาชิกให้กรอก: **ชื่อเล่น/ชื่อเรียกในวง (Display Name)** เช่น โต้ง กีตาร์, **ชื่อผู้ใช้/อีเมล**, และ **รหัสผ่าน**
2. **การบันทึก Display Name และ Client Fallback Upsert:**
   - ส่งชื่อเล่นผ่าน `options.data.username` ในคำสั่ง `sb.auth.signUp()`
   - มี Client Fallback Upsert ไปยังตาราง `public.profiles` ทันที (`status: 'pending'`, `is_active: true`) เพื่อรับประกันว่าข้อมูลผู้สมัครจะมีชื่อและสถานะรออนุมัติในฐานข้อมูลเสมอ แม้ Trigger จะยังไม่ได้ทำงานหรือมีข้อจำกัดด้านเครือข่าย
3. **ความยืดหยุ่นของ Supabase Auth & RLS:**
   - ฟังก์ชัน `public.is_admin()` ตรวจสอบอีเมล Super Admin จาก JWT Token เพื่อให้ Admin มองเห็นรายชื่อผู้สมัครได้เสมอโดยไม่ถูก RLS บล็อก
   - มีสคริปต์ `supabase/fix_and_sync_users.sql` สำหรับนำผู้ใช้ทั้งหมดจาก `auth.users` มาซิงก์เข้า `public.profiles` อัตโนมัติ (Backfill)

---

## 5. ไปป์ไลน์โหลดคอร์ดและรูปภาพความเร็วสูง (< 5s Image Pipeline)

- การค้นหา (`searchRealWebChords`) แคชผลลัพธ์ในหน่วยความจำและ `sessionStorage` (TTL 5–10 นาที) พร้อมรวม Promise ที่กำลังโหลดซ้ำและยกเลิกคำค้นเก่าด้วย `AbortController`
- การเปิดเพลงจาก Chordtabs (`loadRealWebChordResult` / `loadGallery`):
  1. ตรวจสอบรูปใน `IndexedDB` (`ct-img-<songId>`) ก่อน (เปิดซ้ำ/ออฟไลน์ใน `< 50ms`)
  2. แสดงรูปตรงพร้อม `referrerPolicy="no-referrer"` ควบคู่กับการดึงชื่อไฟล์จริงผ่าน `r.jina.ai` (`X-Engine: direct`) และมีลำดับ Fallback อัตโนมัติผ่าน `wsrv.nl` / `images.weserv.nl` ก่อนบันทึกลง `IndexedDB` เบื้องหลัง

---

## 6. โมดูลฟีเจอร์เสริมแบบแยกส่วน (Modular Feature Architecture)

ระบบแบ่งฟีเจอร์ใหม่เป็นโมดูลอิสระ (Vanilla ES6 IIFE + Scoped CSS) ที่โหลดผ่าน `index.html`, แคชออฟไลน์ใน `sw.js` (`mellowchords-v21`), และเชื่อมเข้ากับหน้าหลักผ่านส่วน `14B) Modular Feature Integration` ใน `app.js`:

### 6.1 Songbook Picker & Online Auto-Add (`components/setlist-picker/`)
- **Namespace:** `window.MellowSetlistPickerService`, `window.MellowSetlistPicker`
- **จุดเชื่อมต่อ:** ปุ่ม `➕ เพิ่มเพลงเข้าเซ็ต` (`#plAddSongPickerBtn`) ในหน้า Setlist (`#plView`)
- **การทำงาน:**
  - แสดงผลแบบ Responsive: **Side Panel** ด้านขวา (`420px`) บนเดสก์ท็อป (`>= 960px`) และ **Bottom Drawer** บนมือถือ (`< 960px`)
  - **แท็บคลังเพลง:** ค้นหา/กรอง (`ทั้งหมด`, `ยังไม่ในเซ็ต`, `อยู่ในเซ็ตแล้ว`, `⭐ โปรด`) และแสดง Badge `✓ อยู่ในเซ็ตแล้ว` พร้อมเพิ่ม/นำออกได้ทันที
  - **แท็บค้นหาออนไลน์:** ดึงคอร์ด/รูปภาพจากเว็บ -> ตรวจจับเพลงซ้ำ 4 ระดับ (`id`, `chordtabsId`, `url`, `title+artist`) -> บันทึกเข้าคลังเพลงอัตโนมัติ -> เพิ่มเข้าเซ็ตเพลงทันที

### 6.2 Image-to-Text Chord Parser & Dual View (`components/chord-parser/`)
- **Namespace:** `window.MellowChordParser`, `window.MellowChordDualView`
- **จุดเชื่อมต่อ:** คอนเทนเนอร์ `#chordDualViewToolbar` และ `#chordDualViewText` ในหน้าดูคอร์ด (`#songView`)
- **การทำงาน:**
  - แกะเนื้อเพลงและคอร์ดจากภาพด้วย `<canvas>` Preprocessing + Tesseract.js (`tha+eng`) พร้อม Spatial BBox Alignment จัดตำแหน่งคอร์ดให้ตรงกับคำร้อง (รองรับสระลอย/วรรณยุกต์ภาษาไทย)
  - สร้างข้อมูลทั้งแบบ **Monospace** และ **ChordPro**, วิเคราะห์ `originalKey` อัตโนมัติ, และบันทึกลงอ็อบเจกต์เพลง (`song.parsedChordSheet`) + แคช `localStorage` (`mellowchords.parsedChords.v1`) เพื่อไม่ต้องแกะซ้ำ
  - ปุ่มสลับ **🖼️ แบบรูปภาพ (Image View)** <-> **📝 แบบข้อความ (Text View)** พร้อมตัวแสดงคีย์และปุ่มทดคีย์ `−` / `รีเซ็ต` / `+` ที่ซิงก์กับ Floating Dock

### 6.3 MIDI Footswitch Hook & Settings UI (`features/midi/`)
- **Namespace:** `window.MellowMidi` (`useMidiFootswitch`, `openSettingsModal`, `renderSettingsPanel`, `createStatusBadge`)
- **จุดเชื่อมต่อ:** ปุ่มสถานะ `🎹 MIDI` บน Header (`#midiHeaderSlot`), เมนูในหน้าตั้งค่าบัญชี (`openAcct()`), และ Callback เปลี่ยนเพลง (`navigateSongByMidi`) ในหน้าเล่นเพลง (`#songView`)
- **การทำงาน:**
  - ใช้ **Web MIDI API** ตรวจจับและ Hot-plug อุปกรณ์อัตโนมัติ รองรับข้อความ **CC**, **PC**, และ **Note On** พร้อม **Debounce** ป้องกันเหยียบเบิ้ล
  - มีโหมด **MIDI Learn** สำหรับกดตั้งค่าแล้วเหยียบแป้นเพื่อจำปุ่ม บันทึกลง `localStorage` (`mellowchords.midi.settings.v1`)
  - มี **MIDI Event Simulator** (ปุ่มจำลองเพลงก่อนหน้า/ถัดไป และส่งสัญญาณกำหนดเอง) สำหรับทดสอบเมื่อไม่มีอุปกรณ์จริง

---

## 7. การตรวจสอบและชุดทดสอบอัตโนมัติ (Verification)

1. **ตรวจไวยากรณ์ JavaScript ทั้งหมด:**
   ```bash
   node --check app.js && node --check sw.js && node --check tests/e2e.mjs \
     && node --check components/setlist-picker/setlist-picker.service.js \
     && node --check components/setlist-picker/setlist-picker.js \
     && node --check components/chord-parser/chord-parser.service.js \
     && node --check components/chord-parser/chord-dual-view.js \
     && node --check features/midi/midi-footswitch.js \
     && node --check features/midi/midi-settings.js
   ```
2. **รันชุดทดสอบ E2E ทั้งหมด (Playwright):**
   ```bash
   node tests/e2e.mjs
   ```
   ครอบคลุมการทดสอบ:
   - การเรนเดอร์คลังเพลง, เซ็ตลิสต์, การทดคีย์, Lightbox, Editor/OCR, และความเร็วโหลดภาพคอร์ด `< 5000ms` (Tests 1–8)
   - ระบบอนุมัติผู้สมัครและ Graceful Degradation กรณียังไม่รัน Migration (Tests 9a–9d)
   - ระบบ RBAC: การซ่อนเมนูจาก Guest/User, การพิมพ์ URL `#/admin` ตรงๆ แล้วถูก Redirect กลับหน้าหลัก, การบล็อกบัญชีที่ `is_active = false`, และการจัดการผู้ใช้โดย Admin (ค้นหา, กรอง, เปลี่ยน Role, เปิด/ปิดบัญชี, ป้องกันแก้สิทธิ์ตัวเอง, และออกจากระบบ) (Tests 10a–10c)
   - โมดูลเสริมทั้ง 3 ส่วน: Setlist Picker + Online Auto-Add Deduplication, Image-to-Text Chord Parser + Dual View + Cache + Transpose, และ MIDI Footswitch Settings + MIDI Learn + Debounce + Simulator Navigation
