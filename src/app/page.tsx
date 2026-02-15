"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [regFname, setRegFname] = useState("");
  const [regLname, setRegLname] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regPw2, setRegPw2] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: loginPw,
    });
    if (authError) { setError(authError.message); setLoading(false); return; }
    const { data: profile } = await supabase.from("user_profiles").select("role_id, roles(name)").eq("id", data.user.id).single();
    const roleName = profile?.roles?.name;
    if (roleName === "admin" || roleName === "super_admin") { router.push("/admin"); } else { router.push("/dashboard"); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (regPw !== regPw2) { setError("รหัสผ่านไม่ตรงกัน"); return; }
    if (regPw.length < 8) { setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: regEmail, password: regPw,
      options: { data: { full_name: regFname + " " + regLname, phone: regPhone } },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    alert("สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยัน");
    setActiveTab("login");
    setLoading(false);
  }

  const inputCls = "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-md text-sm focus:border-navy-3 focus:ring-2 focus:ring-navy-3/10 outline-none transition-all";

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex w-[52%] bg-gradient-to-br from-navy via-navy-2 to-navy-3 p-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.08)_0%,transparent_70%)] -top-[100px] -right-[100px]" />
        <div className="absolute w-[300px] h-[300px] rounded-full border border-gold/10 bottom-20 -left-20" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-gradient-to-br from-gold to-gold-2 rounded-xl flex items-center justify-center text-navy font-bold text-lg shadow-gold">ลบส</div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">องค์การบริหารส่วนตำบลลุโบะสาวอ</h1>
            <p className="text-gold text-xs mt-0.5 opacity-90">ระบบยืนยันตัวตนดิจิทัล Digital Identity</p>
          </div>
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-gold/15 border border-gold/35 rounded-full px-3.5 py-1.5 text-gold-2 text-xs font-semibold tracking-wide mb-6">
            <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse-gold" />
            KYC Level 2
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">พิสูจน์ตัวตน<br />อย่าง<span className="text-gold-2">น่าเชื่อถือ</span></h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-md">ระบบยืนยันตัวตนผ่านบัตรประชาชนและการจดจำใบหน้า เพื่อการเข้าใช้บริการระบบสารบรรณอิเล็กทรอนิกส์อย่างปลอดภัย</p>
          <div className="mt-10 flex flex-col gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">💳</div>
              <div><strong className="text-white text-sm block">ตรวจสอบบัตรประชาชน</strong><span className="text-white/50 text-xs">อัปโหลดภาพบัตรหน้า-หลัง พร้อมอ่านข้อมูล</span></div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">📸</div>
              <div><strong className="text-white text-sm block">Selfie + Liveness Check</strong><span className="text-white/50 text-xs">ถ่ายรูปใบหน้าเพื่อเปรียบเทียบกับบัตร</span></div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">✅</div>
              <div><strong className="text-white text-sm block">ตรวจสอบโดยเจ้าหน้าที่</strong><span className="text-white/50 text-xs">ทีมงานตรวจสอบและอนุมัติภายใน 1-2 วัน</span></div>
            </div>
          </div>
        </div>
        <div className="text-white/30 text-xs relative z-10">© 2569 องค์การบริหารส่วนตำบลลุโบะสาวอ · Product by Alif Doloh</div>
      </div>
      <div className="flex-1 bg-white flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[420px]">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-8">
            {[{k:"login",l:"เข้าสู่ระบบ"},{k:"register",l:"สมัครสมาชิก"},{k:"officer",l:"เจ้าหน้าที่"}].map((t)=>(
              <button key={t.k} onClick={()=>{setActiveTab(t.k);setError("");}}
                className={"flex-1 py-2.5 rounded-md text-sm font-semibold transition-all "+(activeTab===t.k?"bg-white text-navy shadow-sm":"text-gray-500 hover:text-gray-700")}>{t.l}</button>
            ))}
          </div>
          {error && <div className="mb-4 p-3 bg-status-red-light border border-status-red/30 rounded-lg text-status-red text-xs font-semibold">{error}</div>}
          {activeTab==="login" && (
            <form onSubmit={handleLogin} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">ยินดีต้อนรับ</h2>
              <p className="text-gray-400 text-sm mb-7">เข้าสู่ระบบเพื่อจัดการข้อมูลการยืนยันตัวตน</p>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">อีเมล <span className="text-status-red">*</span></label>
                <input type="email" value={loginEmail} onChange={(e)=>setLoginEmail(e.target.value)} placeholder="example@email.com" className={inputCls} required />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">รหัสผ่าน <span className="text-status-red">*</span></label>
                <div className="relative">
                  <input type={showPw?"text":"password"} value={loginPw} onChange={(e)=>setLoginPw(e.target.value)} placeholder="รหัสผ่าน 8 ตัวอักษรขึ้นไป" className={inputCls+" pr-10"} required />
                  <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">{showPw?"🙈":"👁️"}</button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<>🔐 เข้าสู่ระบบ</>}
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">ยังไม่มีบัญชี? <button type="button" onClick={()=>setActiveTab("register")} className="text-navy-3 font-bold hover:underline">สมัครสมาชิก</button></p>
            </form>
          )}
          {activeTab==="register" && (
            <form onSubmit={handleRegister} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">สมัครสมาชิก</h2>
              <p className="text-gray-400 text-sm mb-7">สร้างบัญชีเพื่อเริ่มต้นยืนยันตัวตน</p>
              <div className="flex gap-2.5 mb-4">
                <div className="flex-1"><label className="block text-xs font-semibold text-gray-500 mb-1.5">ชื่อ <span className="text-status-red">*</span></label><input type="text" value={regFname} onChange={(e)=>setRegFname(e.target.value)} placeholder="ชื่อจริง" className={inputCls} required /></div>
                <div className="flex-1"><label className="block text-xs font-semibold text-gray-500 mb-1.5">นามสกุล <span className="text-status-red">*</span></label><input type="text" value={regLname} onChange={(e)=>setRegLname(e.target.value)} placeholder="นามสกุล" className={inputCls} required /></div>
              </div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">อีเมล <span className="text-status-red">*</span></label><input type="email" value={regEmail} onChange={(e)=>setRegEmail(e.target.value)} placeholder="example@email.com" className={inputCls} required /></div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">เบอร์โทร <span className="text-status-red">*</span></label><input type="tel" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)} placeholder="08x-xxx-xxxx" className={inputCls} required /></div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">รหัสผ่าน <span className="text-status-red">*</span></label><input type="password" value={regPw} onChange={(e)=>setRegPw(e.target.value)} placeholder="8 ตัวอักษรขึ้นไป" className={inputCls} required /></div>
              <div className="mb-6"><label className="block text-xs font-semibold text-gray-500 mb-1.5">ยืนยันรหัสผ่าน <span className="text-status-red">*</span></label><input type="password" value={regPw2} onChange={(e)=>setRegPw2(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" className={inputCls} required /></div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:"สมัครสมาชิก"}
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">มีบัญชีแล้ว? <button type="button" onClick={()=>setActiveTab("login")} className="text-navy-3 font-bold hover:underline">เข้าสู่ระบบ</button></p>
            </form>
          )}
          {activeTab==="officer" && (
            <form onSubmit={handleLogin} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">เจ้าหน้าที่เข้าสู่ระบบ</h2>
              <p className="text-gray-400 text-sm mb-7">สำหรับเจ้าหน้าที่ตรวจสอบ KYC</p>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">อีเมลเจ้าหน้าที่</label><input type="email" value={loginEmail} onChange={(e)=>setLoginEmail(e.target.value)} placeholder="officer@lubosawo.go.th" className={inputCls} required /></div>
              <div className="mb-6"><label className="block text-xs font-semibold text-gray-500 mb-1.5">รหัสผ่าน</label><input type="password" value={loginPw} onChange={(e)=>setLoginPw(e.target.value)} placeholder="รหัสผ่าน" className={inputCls} required /></div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<>🔐 เข้าสู่ระบบเจ้าหน้าที่</>}
              </button>
            </form>
          )}
          <div className="lg:hidden flex items-center justify-center gap-3 mt-8 pt-6 border-t border-gray-100">
            <div className="w-9 h-9 bg-gradient-to-br from-gold to-gold-2 rounded-lg flex items-center justify-center text-navy font-bold text-xs shadow-gold">ลบส</div>
            <span className="text-xs text-gray-400">อบต.ลุโบะสาวอ</span>
          </div>
        </div>
      </div>
    </div>
  );
}

