"use client";

import { useState, type FormEvent } from "react";
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
  const [regPosition, setRegPosition] = useState("");
  const [regDepartment, setRegDepartment] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regPw2, setRegPw2] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPw,
    });

    if (authError) {
      const m = authError.message.toLowerCase();
      if (m.includes("email not confirmed") || m.includes("email not verified")) {
        setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ");
      } else if (m.includes("invalid login credentials")) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง หากเคยสมัครอีเมลเดิมไว้แล้วให้กดลืมรหัสผ่าน");
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role_id, roles(name)")
      .eq("id", data.user.id)
      .single();

    const roleName = profile?.roles?.name;
    if (roleName === "admin" || roleName === "super_admin") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (regPw !== regPw2) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (regPw.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    setLoading(true);
    const emailRedirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: regEmail,
      password: regPw,
      options: {
        emailRedirectTo,
        data: {
          full_name: `${regFname} ${regLname}`,
          phone: regPhone,
          position: regPosition,
          department: regDepartment,
        },
      },
    });

    if (signUpError) {
      const m = signUpError.message.toLowerCase();
      if (m.includes("email not confirmed") || m.includes("email not verified")) {
        setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ");
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    const identities = (signUpData?.user as { identities?: unknown[] } | null)?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      setError("อีเมลนี้มีบัญชีอยู่แล้ว ระบบไม่ได้เปลี่ยนรหัสผ่านให้ กรุณาใช้ปุ่มลืมรหัสผ่าน");
      setActiveTab("login");
      setLoading(false);
      return;
    }

    alert("สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันก่อนใช้งาน KYC");
    setActiveTab("login");
    setLoading(false);
  }

  async function handleForgotPassword() {
    setError("");
    const email = loginEmail.trim();
    if (!email) {
      setError("กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน");
      return;
    }

    setResetSending(true);
    try {
      const redirectTo = typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      alert("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจอีเมล");
    } finally {
      setResetSending(false);
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-md text-sm focus:border-navy-3 focus:ring-2 focus:ring-navy-3/10 outline-none transition-all";

  const departmentOptions = [
    "à¸à¹ˆà¸²à¸¢à¸šà¸£à¸´à¸«à¸²à¸£", 
    "à¸ªà¸³à¸™à¸±à¸à¸›à¸¥à¸±à¸”",
    "à¸à¸­à¸‡à¸„à¸¥à¸±à¸‡",
    "à¸à¸­à¸‡à¸Šà¹ˆà¸²à¸‡",
    "à¸à¸­à¸‡à¸à¸²à¸£à¸¨à¸¶à¸à¸©à¸² à¸¨à¸²à¸ªà¸™à¸²à¹à¸¥à¸°à¸§à¸±à¸’à¸™à¸˜à¸£à¸£à¸¡",
    "à¸à¸­à¸‡à¸ªà¸²à¸˜à¸²à¸£à¸“à¸ªà¸¸à¸‚à¹à¸¥à¸°à¸ªà¸´à¹ˆà¸‡à¹à¸§à¸”à¸¥à¹‰à¸­à¸¡",
  ];

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex w-[52%] bg-gradient-to-br from-navy via-navy-2 to-navy-3 p-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.08)_0%,transparent_70%)] -top-[100px] -right-[100px]" />
        <div className="absolute w-[300px] h-[300px] rounded-full border border-gold/10 bottom-20 -left-20" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-gradient-to-br from-gold to-gold-2 rounded-xl flex items-center justify-center text-navy font-bold text-lg shadow-gold">à¸¥à¸šà¸ª</div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">à¸­à¸‡à¸„à¹Œà¸à¸²à¸£à¸šà¸£à¸´à¸«à¸²à¸£à¸ªà¹ˆà¸§à¸™à¸•à¸³à¸šà¸¥à¸¥à¸¸à¹‚à¸šà¸°à¸ªà¸²à¸§à¸­</h1>
            <p className="text-gold text-xs mt-0.5 opacity-90">à¸£à¸°à¸šà¸šà¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™à¸”à¸´à¸ˆà¸´à¸—à¸±à¸¥ Digital Identity</p>
          </div>
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-gold/15 border border-gold/35 rounded-full px-3.5 py-1.5 text-gold-2 text-xs font-semibold tracking-wide mb-6">
            <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse-gold" />
            KYC Level 2.1
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œà¸•à¸±à¸§à¸•à¸™<br />à¸­à¸¢à¹ˆà¸²à¸‡<span className="text-gold-2">à¸™à¹ˆà¸²à¹€à¸Šà¸·à¹ˆà¸­à¸–à¸·à¸­</span></h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-md">à¸£à¸°à¸šà¸šà¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™à¸œà¹ˆà¸²à¸™à¸šà¸±à¸•à¸£à¸›à¸£à¸°à¸Šà¸²à¸Šà¸™à¹à¸¥à¸°à¸à¸²à¸£à¸ˆà¸”à¸ˆà¸³à¹ƒà¸šà¸«à¸™à¹‰à¸² à¹€à¸žà¸·à¹ˆà¸­à¸à¸²à¸£à¹€à¸‚à¹‰à¸²à¹ƒà¸Šà¹‰à¸šà¸£à¸´à¸à¸²à¸£à¸£à¸°à¸šà¸šà¸ªà¸²à¸£à¸šà¸£à¸£à¸“à¸­à¸´à¹€à¸¥à¹‡à¸à¸—à¸£à¸­à¸™à¸´à¸à¸ªà¹Œà¸­à¸¢à¹ˆà¸²à¸‡à¸›à¸¥à¸­à¸”à¸ à¸±à¸¢</p>
          <div className="mt-10 flex flex-col gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">ðŸ’³</div>
              <div><strong className="text-white text-sm block">à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸šà¸±à¸•à¸£à¸›à¸£à¸°à¸Šà¸²à¸Šà¸™</strong><span className="text-white/50 text-xs">à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¸ à¸²à¸žà¸šà¸±à¸•à¸£à¸«à¸™à¹‰à¸²-à¸«à¸¥à¸±à¸‡ à¸žà¸£à¹‰à¸­à¸¡à¸­à¹ˆà¸²à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥</span></div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">ðŸ“¸</div>
              <div><strong className="text-white text-sm block">Selfie + Liveness Check</strong><span className="text-white/50 text-xs">à¸–à¹ˆà¸²à¸¢à¸£à¸¹à¸›à¹ƒà¸šà¸«à¸™à¹‰à¸²à¹€à¸žà¸·à¹ˆà¸­à¹€à¸›à¸£à¸µà¸¢à¸šà¹€à¸—à¸µà¸¢à¸šà¸à¸±à¸šà¸šà¸±à¸•à¸£</span></div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-lg shrink-0">âœ…</div>
              <div><strong className="text-white text-sm block">à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹‚à¸”à¸¢à¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆ</strong><span className="text-white/50 text-xs">à¸—à¸µà¸¡à¸‡à¸²à¸™à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹à¸¥à¸°à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸ à¸²à¸¢à¹ƒà¸™ 1-2 à¸§à¸±à¸™</span></div>
            </div>
          </div>
        </div>
        <div className="text-white/30 text-xs relative z-10">Â© 2569 à¸­à¸‡à¸„à¹Œà¸à¸²à¸£à¸šà¸£à¸´à¸«à¸²à¸£à¸ªà¹ˆà¸§à¸™à¸•à¸³à¸šà¸¥à¸¥à¸¸à¹‚à¸šà¸°à¸ªà¸²à¸§à¸­ Â· Product by Alif Doloh</div>
      </div>
      <div className="flex-1 bg-white flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[420px]">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-8">
            {[{k:"login",l:"à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸š"},{k:"register",l:"à¸ªà¸¡à¸±à¸„à¸£à¸ªà¸¡à¸²à¸Šà¸´à¸"},{k:"officer",l:"à¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆ"}].map((t)=>(
              <button key={t.k} onClick={()=>{setActiveTab(t.k);setError("");}}
                className={"flex-1 py-2.5 rounded-md text-sm font-semibold transition-all "+(activeTab===t.k?"bg-white text-navy shadow-sm":"text-gray-500 hover:text-gray-700")}>{t.l}</button>
            ))}
          </div>
          {error && <div className="mb-4 p-3 bg-status-red-light border border-status-red/30 rounded-lg text-status-red text-xs font-semibold">{error}</div>}
          {activeTab==="login" && (
            <form onSubmit={handleLogin} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">à¸¢à¸´à¸™à¸”à¸µà¸•à¹‰à¸­à¸™à¸£à¸±à¸š</h2>
              <p className="text-gray-400 text-sm mb-7">à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸šà¹€à¸žà¸·à¹ˆà¸­à¸ˆà¸±à¸”à¸à¸²à¸£à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸²à¸£à¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™</p>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸­à¸µà¹€à¸¡à¸¥ <span className="text-status-red">*</span></label>
                <input type="email" value={loginEmail} onChange={(e)=>setLoginEmail(e.target.value)} placeholder="example@email.com" className={inputCls} required />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™ <span className="text-status-red">*</span></label>
                <div className="relative">
                  <input type={showPw?"text":"password"} value={loginPw} onChange={(e)=>setLoginPw(e.target.value)} placeholder="à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™ 8 à¸•à¸±à¸§à¸­à¸±à¸à¸©à¸£à¸‚à¸¶à¹‰à¸™à¹„à¸›" className={inputCls+" pr-10"} required />
                  <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">{showPw?"ðŸ™ˆ":"ðŸ‘ï¸"}</button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<>ðŸ” à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸š</>}
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetSending}
                className="w-full mt-2 py-2.5 border border-gray-200 text-gray-600 rounded-md text-xs font-semibold hover:border-navy-3 hover:text-navy-3 transition-all disabled:opacity-60"
              >
                {resetSending ? "à¸à¸³à¸¥à¸±à¸‡à¸ªà¹ˆà¸‡à¸¥à¸´à¸‡à¸à¹Œ..." : "à¸¥à¸·à¸¡à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™"}
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸šà¸±à¸à¸Šà¸µ? <button type="button" onClick={()=>setActiveTab("register")} className="text-navy-3 font-bold hover:underline">à¸ªà¸¡à¸±à¸„à¸£à¸ªà¸¡à¸²à¸Šà¸´à¸</button></p>
            </form>
          )}
          {activeTab==="register" && (
            <form onSubmit={handleRegister} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">à¸ªà¸¡à¸±à¸„à¸£à¸ªà¸¡à¸²à¸Šà¸´à¸</h2>
              <p className="text-gray-400 text-sm mb-7">à¸ªà¸£à¹‰à¸²à¸‡à¸šà¸±à¸à¸Šà¸µà¹€à¸žà¸·à¹ˆà¸­à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™à¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™</p>
              <div className="flex gap-2.5 mb-4">
                <div className="flex-1"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸Šà¸·à¹ˆà¸­ <span className="text-status-red">*</span></label><input type="text" value={regFname} onChange={(e)=>setRegFname(e.target.value)} placeholder="à¸Šà¸·à¹ˆà¸­à¸ˆà¸£à¸´à¸‡" className={inputCls} required /></div>
                <div className="flex-1"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸™à¸²à¸¡à¸ªà¸à¸¸à¸¥ <span className="text-status-red">*</span></label><input type="text" value={regLname} onChange={(e)=>setRegLname(e.target.value)} placeholder="à¸™à¸²à¸¡à¸ªà¸à¸¸à¸¥" className={inputCls} required /></div>
              </div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸­à¸µà¹€à¸¡à¸¥ <span className="text-status-red">*</span></label><input type="email" value={regEmail} onChange={(e)=>setRegEmail(e.target.value)} placeholder="example@email.com" className={inputCls} required /></div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¹€à¸šà¸­à¸£à¹Œà¹‚à¸—à¸£ <span className="text-status-red">*</span></label><input type="tel" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)} placeholder="08x-xxx-xxxx" className={inputCls} required /></div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡ <span className="text-status-red">*</span></label><input type="text" value={regPosition} onChange={(e)=>setRegPosition(e.target.value)} placeholder="à¹€à¸Šà¹ˆà¸™ à¸™à¸±à¸à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸™à¹‚à¸¢à¸šà¸²à¸¢à¹à¸¥à¸°à¹à¸œà¸™" className={inputCls} required /></div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸ªà¸±à¸‡à¸à¸±à¸”/à¸à¸­à¸‡ <span className="text-status-red">*</span></label>
                <select value={regDepartment} onChange={(e)=>setRegDepartment(e.target.value)} className={inputCls} required>
                  <option value="">-- à¹€à¸¥à¸·à¸­à¸à¸ªà¸±à¸‡à¸à¸±à¸” --</option>
                  {departmentOptions.map((d)=>(<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™ <span className="text-status-red">*</span></label><input type="password" value={regPw} onChange={(e)=>setRegPw(e.target.value)} placeholder="8 à¸•à¸±à¸§à¸­à¸±à¸à¸©à¸£à¸‚à¸¶à¹‰à¸™à¹„à¸›" className={inputCls} required /></div>
              <div className="mb-6"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™ <span className="text-status-red">*</span></label><input type="password" value={regPw2} onChange={(e)=>setRegPw2(e.target.value)} placeholder="à¸à¸£à¸­à¸à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™à¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡" className={inputCls} required /></div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:"à¸ªà¸¡à¸±à¸„à¸£à¸ªà¸¡à¸²à¸Šà¸´à¸"}
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">à¸¡à¸µà¸šà¸±à¸à¸Šà¸µà¹à¸¥à¹‰à¸§? <button type="button" onClick={()=>setActiveTab("login")} className="text-navy-3 font-bold hover:underline">à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸š</button></p>
            </form>
          )}
          {activeTab==="officer" && (
            <form onSubmit={handleLogin} className="animate-fade-up">
              <h2 className="text-[22px] font-bold text-navy mb-1.5">à¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸š</h2>
              <p className="text-gray-400 text-sm mb-7">à¸ªà¸³à¸«à¸£à¸±à¸šà¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š KYC</p>
              <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸­à¸µà¹€à¸¡à¸¥à¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆ</label><input type="email" value={loginEmail} onChange={(e)=>setLoginEmail(e.target.value)} placeholder="officer@lubosawo.go.th" className={inputCls} required /></div>
              <div className="mb-6"><label className="block text-xs font-semibold text-gray-500 mb-1.5">à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™</label><input type="password" value={loginPw} onChange={(e)=>setLoginPw(e.target.value)} placeholder="à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™" className={inputCls} required /></div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md font-bold text-sm shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading?<span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<>ðŸ” à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸šà¹€à¸ˆà¹‰à¸²à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆ</>}
              </button>
            </form>
          )}
          <div className="lg:hidden flex items-center justify-center gap-3 mt-8 pt-6 border-t border-gray-100">
            <div className="w-9 h-9 bg-gradient-to-br from-gold to-gold-2 rounded-lg flex items-center justify-center text-navy font-bold text-xs shadow-gold">à¸¥à¸šà¸ª</div>
            <span className="text-xs text-gray-400">à¸­à¸šà¸•.à¸¥à¸¸à¹‚à¸šà¸°à¸ªà¸²à¸§à¸­</span>
          </div>
        </div>
      </div>
    </div>
  );
}


