import { useState, useRef, useEffect } from "react";

// ── Supabase config ───────────────────────────────────────────────────────────
const SB_URL = "https://zqputthzhuskzqonnvox.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcHV0dGh6aHVza3pxb25udm94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjkyMjgsImV4cCI6MjA5NDgwNTIyOH0.UslOXizMcv83_dJUlrvf36oBiKKHU_Z9-s1e1VJCePg";

const sb = {
  async query(table, method="GET", body=null, filters="") {
    const res = await fetch(`${SB_URL}/rest/v1/${table}${filters}`, {
      method,
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": method==="POST"?"return=representation":"" },
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) { const e = await res.text(); throw new Error(e); }
    return res.status===204 ? null : res.json();
  },
  async uploadFile(path, file) {
    const res = await fetch(`${SB_URL}/storage/v1/object/scripts/${path}`, {
      method: "POST",
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": file.type },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return `${SB_URL}/storage/v1/object/sign/scripts/${path}`;
  },
  async signedUrl(path) {
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/scripts/${path}`, {
      method: "POST",
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return `${SB_URL}/storage/v1${data.signedURL}`;
  }
};

// ── Staff ─────────────────────────────────────────────────────────────────────
const STAFF = [
  { id:"S01", name:"Deevesh Govind",  role:"admin",     title:"Responsible Pharmacist", pin:"11111" },
  { id:"S02", name:"Munya Ngandu",    role:"admin",     title:"Owner",                  pin:"22222" },
  { id:"S03", name:"Bradley Kunene", role:"dispenser",  title:"Pharmacist Intern",      pin:"33333" },
  { id:"S04", name:"Innocent Toke",  role:"dispenser",  title:"Pharmacy Assistant",     pin:"44444" },
  { id:"S05", name:"Sheren Naidoo",  role:"dispenser",  title:"Qualified Dispenser",    pin:"55555" },
  { id:"S06", name:"Hamid Khan",     role:"locum",      title:"Locum Pharmacist",       pin:null },
  { id:"S07", name:"Farida Ahmed",   role:"locum",      title:"Locum Pharmacist",       pin:null },
  { id:"S08", name:"Priya Bhana",    role:"locum",      title:"Locum Pharmacist",       pin:null },
  { id:"S09", name:"Maria Jila",     role:"locum",      title:"Locum Pharmacist",       pin:null },
];
function dailyPin(id) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,"");
  let s=0; for(let i=0;i<id.length;i++) s+=id.charCodeAt(i);
  for(let i=0;i<today.length;i++) s=(s*31+today.charCodeAt(i))&0xfffff;
  return String(10000+(s%90000));
}
function getPin(s){ return s.role==="locum"?dailyPin(s.id):s.pin; }
const ROLE_COLOR={admin:"purple",dispenser:"teal",locum:"amber"};
const ROLE_LABEL={admin:"Admin",dispenser:"Dispenser",locum:"Locum"};
function can(u,a){ if(!u)return false; const r=u.role; if(r==="admin")return true; if(a==="upload"||a==="search")return true; if((a==="addPatient"||a==="editRecord")&&r==="dispenser")return true; return false; }
function fmtDate(d){ if(!d)return "—"; const[y,m,day]=d.split("-"); return `${day}/${m}/${y}`; }
function fullName(p){ return `${p.first_name} ${p.surname}`; }
function genPtId(pts){ const n=pts.map(p=>parseInt(p.id.replace("PT",""),10)).filter(Boolean); return "PT"+String((n.length?Math.max(...n):0)+1).padStart(3,"0"); }
function genRxId(date){ return `RX-${date.replace(/-/g,"")}-${String(Math.floor(Math.random()*900)+100)}`; }
async function toBase64(file){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.readAsDataURL(file); }); }

const emptyPt={disp_profile_no:"",first_name:"",surname:"",dob:"",id_number:"",phone:"",email:"",address:"",aid_name:"",aid_number:"",dependant_code:"",nok_name:"",nok_phone:""};
const emptyRx={patientId:"",patientLabel:"",script_date:new Date().toISOString().slice(0,10),valid_until:"",doctor:"",practice_no:"",items:"",diagnosis:"",repeats:"",is_chronic:false,changes:"",dispensed_by_name:"",total_price:"",trailerFile:null,scriptFile:null,trailerPreview:null,scriptPreview:null};

async function parseTrailerLabel(base64Img) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1000,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:base64Img }},
        { type:"text", text:`This is a South African pharmacy dispensing trailer label sticker. Extract all readable information and return ONLY a JSON object with these exact keys (null if not found):
{"patientSurname":string,"patientFirstName":string|null,"scriptNumber":string|null,"dispenserName":string|null,"medications":string,"scriptDate":string|null,"totalPrice":string|null,"doctor":string|null}
Date format: YYYY-MM-DD. Medications as comma-separated list with quantity and strength. Return ONLY the JSON, nothing else.`}
      ]}]
    })
  });
  const data = await res.json();
  const text = data.content?.find(b=>b.type==="text")?.text||"{}";
  return JSON.parse(text.replace(/```json|```/g,"").trim());
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [patients,    setPatients]    = useState([]);
  const [scripts,     setScripts]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState(0);
  const [search,      setSearch]      = useState("");
  const [selPt,       setSelPt]       = useState(null);
  const [expRx,       setExpRx]       = useState(null);
  const [newPt,       setNewPt]       = useState(emptyPt);
  const [newRx,       setNewRx]       = useState(emptyRx);
  const [ptSearch,    setPtSearch]    = useState("");
  const [toast,       setToast]       = useState(null);
  const [scanStep,    setScanStep]    = useState("idle");
  const trailerRef = useRef();
  const scriptRef  = useRef();

  useEffect(()=>{ if(currentUser) loadPatients(); },[currentUser]);

  async function loadPatients() {
    setLoading(true);
    try {
      const data = await sb.query("patients","GET",null,"?order=surname.asc");
      setPatients(data||[]);
    } catch(e){ showToast("Could not load patients","error"); }
    setLoading(false);
  }

  async function loadScripts(patientId) {
    try {
      const data = await sb.query("prescriptions","GET",null,`?patient_id=eq.${patientId}&order=script_date.desc`);
      setScripts(data||[]);
    } catch(e){ showToast("Could not load scripts","error"); }
  }

  if (!currentUser) return <LoginScreen onLogin={u=>{setCurrentUser(u);}} />;

  const TABS = ["Search", can(currentUser,"addPatient")&&"Add Patient", can(currentUser,"upload")&&"Upload Script", currentUser.role==="admin"&&"Staff"].filter(Boolean);

  function showToast(msg,type="success"){ setToast({msg,type}); setTimeout(()=>setToast(null),3500); }

  async function auditLog(action, detail) {
    try { await sb.query("audit_log","POST",{ staff_name:currentUser.name, staff_id:currentUser.id, action, detail }); }
    catch(e){ console.error("Audit log failed",e); }
  }

  const filteredPts = patients.filter(p=>{
    const q=search.toLowerCase();
    return fullName(p).toLowerCase().includes(q)||p.id?.toLowerCase().includes(q)||p.disp_profile_no?.toLowerCase().includes(q)||p.aid_number?.toLowerCase().includes(q)||p.id_number?.includes(q);
  });

  async function addPatient() {
    if(!newPt.first_name.trim()||!newPt.surname.trim()) return showToast("First name and surname required","error");
    setLoading(true);
    try {
      const id = genPtId(patients);
      const pt = {...newPt, id, created_by: currentUser.name};
      await sb.query("patients","POST",pt);
      setPatients(p=>[...p,pt].sort((a,b)=>a.surname.localeCompare(b.surname)));
      await auditLog("Added patient",`${newPt.first_name} ${newPt.surname} (${id})`);
      setNewPt(emptyPt);
      showToast(`${newPt.first_name} ${newPt.surname} added (${id})`);
    } catch(e){ showToast("Failed to save patient","error"); }
    setLoading(false);
  }

  async function addScript() {
    if(!newRx.patientId) return showToast("Patient not matched — search and select below","error");
    if(!newRx.items.trim()) return showToast("Medications are required","error");
    setLoading(true);
    try {
      const id = genRxId(newRx.script_date);
      const ts = Date.now();
      let trailer_img_path=null, script_img_path=null;

      if(newRx.scriptFile){
        const ext = newRx.scriptFile.name.split(".").pop();
        script_img_path = `${newRx.patientId}/${id}_script.${ext}`;
        await sb.uploadFile(script_img_path, newRx.scriptFile);
      }
      if(newRx.trailerFile){
        const ext = newRx.trailerFile.name.split(".").pop();
        trailer_img_path = `${newRx.patientId}/${id}_trailer.${ext}`;
        await sb.uploadFile(trailer_img_path, newRx.trailerFile);
      }

      const rx = {
        id, patient_id:newRx.patientId,
        script_date:newRx.script_date||null,
        valid_until:newRx.valid_until||null,
        doctor:newRx.doctor, practice_no:newRx.practice_no,
        items:newRx.items, diagnosis:newRx.diagnosis,
        is_chronic:newRx.is_chronic,
        repeats:parseInt(newRx.repeats)||0,
        changes:newRx.changes,
        dispensed_by_name:newRx.dispensed_by_name||currentUser.name,
        dispensed_by_id:currentUser.id,
        total_price:newRx.total_price,
        trailer_img_path, script_img_path
      };
      await sb.query("prescriptions","POST",rx);

      if(selPt?.id===newRx.patientId) setScripts(s=>[{...rx,trailerPreview:newRx.trailerPreview,scriptPreview:newRx.scriptPreview},...s]);
      await auditLog("Uploaded script",`${id} for ${ptSearch}`);
      resetScan(); setPtSearch("");
      showToast(`Script ${id} saved`);
      setTab(0);
    } catch(e){ showToast("Failed to save script: "+e.message,"error"); }
    setLoading(false);
  }

  async function onScriptPhoto(file) {
    if(!file) return;
    setNewRx(r=>({...r, scriptFile:file, scriptPreview:URL.createObjectURL(file)}));
    setScanStep("scanning_script");
  }

  async function onTrailerPhoto(file) {
    if(!file) return;
    const preview = URL.createObjectURL(file);
    setNewRx(r=>({...r, trailerFile:file, trailerPreview:preview}));
    setScanStep("parsing");
    try {
      const b64 = await toBase64(file);
      const parsed = await parseTrailerLabel(b64);
      const matched = patients.find(p=>parsed.patientSurname&&p.surname.toLowerCase().includes(parsed.patientSurname.toLowerCase()));
      setNewRx(r=>({...r,
        patientId:      matched?matched.id:"",
        script_date:    parsed.scriptDate||r.script_date,
        items:          parsed.medications||"",
        dispensed_by_name: parsed.dispenserName||currentUser.name,
        total_price:    parsed.totalPrice||"",
        doctor:         parsed.doctor||"",
      }));
      setPtSearch(matched?`${fullName(matched)} (${matched.id})`:(parsed.patientSurname||""));
      setScanStep("verify");
    } catch(e){
      showToast("Could not read label — fill in manually","error");
      setScanStep("verify");
    }
  }

  function resetScan(){ setScanStep("idle"); setNewRx(emptyRx); setPtSearch(""); }

  // ── Styles ──
  const inp={width:"100%",padding:"8px 10px",fontSize:14,border:"1px solid var(--color-border-secondary)",borderRadius:8,background:"var(--color-background-primary)",color:"var(--color-text-primary)",boxSizing:"border-box",outline:"none"};
  const lbl={fontSize:12,color:"var(--color-text-secondary)",marginBottom:3,display:"block"};
  const sec=t=><div style={{fontSize:11,fontWeight:500,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.06em",margin:"14px 0 8px",borderBottom:"1px solid var(--color-border-tertiary)",paddingBottom:4}}>{t}</div>;
  const fld=(label,key,val,set,type="text",ph="",req=false)=>(<div style={{marginBottom:10}}><label style={lbl}>{label}{req&&<span style={{color:"var(--color-text-danger)"}}> *</span>}</label><input style={inp} type={type} value={val[key]} placeholder={ph} onChange={e=>set({...val,[key]:e.target.value})}/></div>);
  const row2=(a,b)=><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{a}{b}</div>;
  const badge=(label,color)=>(<span style={{fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20,background:`var(--color-background-${color})`,color:`var(--color-text-${color})`,border:`1px solid var(--color-border-${color})`}}>{label}</span>);

  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:700,margin:"0 auto",padding:"12px 16px",color:"var(--color-text-primary)"}}>
      {toast&&<div style={{position:"fixed",top:16,right:16,zIndex:999,padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:500,background:toast.type==="error"?"var(--color-background-danger)":"var(--color-background-success)",color:toast.type==="error"?"var(--color-text-danger)":"var(--color-text-success)",border:`1px solid var(--color-border-${toast.type==="error"?"danger":"success"})`,boxShadow:"0 2px 12px rgba(0,0,0,.12)"}}>{toast.msg}</div>}
      {loading&&<div style={{position:"fixed",top:0,left:0,right:0,height:3,background:"var(--color-text-info)",zIndex:9999,animation:"progress 1s ease-in-out infinite"}}/>}
      <style>{`@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:34,height:34,borderRadius:8,background:"var(--color-background-info)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-pill" style={{fontSize:18,color:"var(--color-text-info)"}}/></div>
        <div><div style={{fontSize:16,fontWeight:500}}>PharmaSave</div><div style={{fontSize:12,color:"var(--color-text-secondary)"}}>Prescription Manager</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:500}}>{currentUser.name}</div><div style={{fontSize:11}}>{badge(ROLE_LABEL[currentUser.role],ROLE_COLOR[currentUser.role])}</div></div>
          <button onClick={()=>{setCurrentUser(null);setTab(0);setSelPt(null);resetScan();setPatients([]);setScripts([]);}} style={{padding:"6px 12px",fontSize:12,borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",cursor:"pointer"}}>Sign out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid var(--color-border-tertiary)"}}>
        {TABS.map((t,i)=>(<button key={t} onClick={()=>{setTab(i);if(t!=="Upload Script")resetScan();}} style={{padding:"8px 12px",fontSize:13,fontWeight:tab===i?500:400,border:"none",borderBottom:tab===i?"2px solid var(--color-text-info)":"2px solid transparent",background:"transparent",color:tab===i?"var(--color-text-info)":"var(--color-text-secondary)",cursor:"pointer",marginBottom:-1}}>{t}</button>))}
      </div>

      {/* ── SEARCH ── */}
      {TABS[tab]==="Search"&&!selPt&&(<>
        <div style={{position:"relative",marginBottom:14}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:16,color:"var(--color-text-tertiary)"}}/>
          <input style={{...inp,paddingLeft:34}} placeholder="Search by name, patient ID, dispensing profile, SA ID or medical aid no…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
        </div>
        {!search&&<div style={{textAlign:"center",color:"var(--color-text-tertiary)",padding:"32px 0",fontSize:14}}>{patients.length===0?"Loading patients…":"Start typing to search."}</div>}
        {filteredPts.map(p=>{
          const rxCount=scripts.filter(s=>s.patient_id===p.id).length;
          return(<div key={p.id} onClick={async()=>{setSelPt(p);await loadScripts(p.id);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"1px solid var(--color-border-tertiary)",borderRadius:10,marginBottom:8,cursor:"pointer",background:"var(--color-background-secondary)"}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"var(--color-background-info)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-user" style={{fontSize:18,color:"var(--color-text-info)"}}/></div>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:500,fontSize:14}}>{fullName(p)}</div><div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{p.id} · Disp: {p.disp_profile_no||"—"} · {p.aid_name||"No medical aid"}</div></div>
            <i className="ti ti-chevron-right" style={{color:"var(--color-text-tertiary)"}}/>
          </div>);
        })}
      </>)}

      {/* ── PATIENT DETAIL ── */}
      {TABS[tab]==="Search"&&selPt&&(<div>
        <button onClick={()=>{setSelPt(null);setExpRx(null);setScripts([]);}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"var(--color-text-info)",cursor:"pointer",fontSize:13,padding:0,marginBottom:14}}><i className="ti ti-arrow-left"/> Back</button>
        <div style={{background:"var(--color-background-secondary)",border:"1px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"var(--color-background-info)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-user" style={{fontSize:22,color:"var(--color-text-info)"}}/></div>
            <div><div style={{fontSize:17,fontWeight:500}}>{fullName(selPt)}</div><div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>ID: {selPt.id} {selPt.disp_profile_no&&<>· Dispensing profile: <strong>{selPt.disp_profile_no}</strong></>}</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 20px",fontSize:13}}>
            {[["DOB",fmtDate(selPt.dob)],["SA ID",selPt.id_number],["Phone",selPt.phone],["Email",selPt.email],["Medical aid",selPt.aid_name],["Aid number",selPt.aid_number],["Dependant code",selPt.dependant_code],["Address",selPt.address],["Next of kin",selPt.nok_name?`${selPt.nok_name} · ${selPt.nok_phone}`:""]].filter(([,v])=>v).map(([l,v])=>(<div key={l}><span style={{color:"var(--color-text-tertiary)",fontSize:11}}>{l} </span><span>{v}</span></div>))}
          </div>
        </div>
        <div style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-secondary)"}}>{scripts.length} prescription{scripts.length!==1?"s":""} on file</div>
        {scripts.length===0&&!loading&&<div style={{textAlign:"center",color:"var(--color-text-tertiary)",padding:"24px 0",fontSize:14}}>No scripts on file yet.</div>}
        {scripts.map(rx=>{
          const isOpen=expRx===rx.id; const isExpired=rx.valid_until&&new Date(rx.valid_until)<new Date();
          return(<div key={rx.id} style={{border:"1px solid var(--color-border-tertiary)",borderRadius:10,marginBottom:8,overflow:"hidden",background:"var(--color-background-primary)"}}>
            <div onClick={()=>setExpRx(isOpen?null:rx.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",cursor:"pointer"}}>
              <i className="ti ti-file-text" style={{fontSize:20,color:"var(--color-text-info)",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontWeight:500,fontSize:13}}>{rx.id}</span>{rx.is_chronic&&badge("Chronic","warning")}{isExpired&&badge("Expired","danger")}{rx.repeats>0&&badge(`${rx.repeats} repeat${rx.repeats>1?"s":""}`, "info")}</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{fmtDate(rx.script_date)} · {rx.doctor||"Doctor not recorded"}</div>
              </div>
              <i className={`ti ti-chevron-${isOpen?"up":"down"}`} style={{color:"var(--color-text-tertiary)"}}/>
            </div>
            {isOpen&&(<div style={{borderTop:"1px solid var(--color-border-tertiary)",padding:"12px 14px"}}>
              {[["Script date",fmtDate(rx.script_date)],["Valid until",fmtDate(rx.valid_until)],["Doctor",rx.doctor],["Medications",rx.items],["Diagnosis",rx.diagnosis],["Dispensed by",rx.dispensed_by_name],["Total price",rx.total_price?`R${rx.total_price}`:""]].map(([l,v])=>v?(<div key={l} style={{marginBottom:8,fontSize:13}}><div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:2}}>{l}</div><div>{v}</div></div>):null)}
              {rx.is_chronic&&rx.changes&&(<div style={{marginBottom:8,padding:"8px 12px",background:"var(--color-background-warning)",borderRadius:8,border:"1px solid var(--color-border-warning)"}}><div style={{fontSize:11,color:"var(--color-text-warning)",marginBottom:2}}>Changes from previous script</div><div style={{fontSize:13,color:"var(--color-text-warning)"}}>{rx.changes}</div></div>)}
              {(rx.script_img_path||rx.trailer_img_path)&&(
                <ScriptImages scriptPath={rx.script_img_path} trailerPath={rx.trailer_img_path}/>
              )}
            </div>)}
          </div>);
        })}
      </div>)}

      {/* ── ADD PATIENT ── */}
      {TABS[tab]==="Add Patient"&&(<div style={{maxWidth:480}}>
        {sec("Identity")}
        {row2(fld("First name","first_name",newPt,setNewPt,"text","e.g. Thandi",true),fld("Surname","surname",newPt,setNewPt,"text","e.g. Dlamini",true))}
        {row2(fld("Date of birth","dob",newPt,setNewPt,"date"),fld("SA ID number","id_number",newPt,setNewPt,"text","13-digit ID"))}
        {sec("Contact")}
        {row2(fld("Phone","phone",newPt,setNewPt,"tel","071 234 5678"),fld("Email","email",newPt,setNewPt,"email","optional"))}
        {fld("Physical address","address",newPt,setNewPt,"text","Street, suburb, postal code")}
        {sec("Medical aid")}
        {row2(fld("Medical aid name","aid_name",newPt,setNewPt,"text","e.g. Discovery Health"),fld("Medical aid number","aid_number",newPt,setNewPt,"text","e.g. DH-8821334"))}
        {fld("Dependant code","dependant_code",newPt,setNewPt,"text","00 = main, 01 = first dependant")}
        {sec("System reference")}
        {fld("Dispensing system profile number","disp_profile_no",newPt,setNewPt,"text","e.g. DISP-4421")}
        {sec("Emergency contact")}
        {row2(fld("Next of kin name","nok_name",newPt,setNewPt,"text","Full name"),fld("Next of kin phone","nok_phone",newPt,setNewPt,"tel","e.g. 082 111 2222"))}
        <button onClick={addPatient} disabled={loading} style={{marginTop:8,padding:"10px 20px",fontSize:14,fontWeight:500,borderRadius:8,width:"100%",background:"var(--color-background-info)",color:"var(--color-text-info)",border:"1px solid var(--color-border-info)",cursor:"pointer",opacity:loading?.6:1}}>
          {loading?"Saving…":"Add patient"}
        </button>
      </div>)}

      {/* ── UPLOAD SCRIPT ── */}
      {TABS[tab]==="Upload Script"&&(<div style={{maxWidth:500}}>

        {scanStep==="idle"&&(<div>
          <div style={{textAlign:"center",padding:"20px 0 8px"}}>
            <div style={{width:56,height:56,borderRadius:14,background:"var(--color-background-info)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><i className="ti ti-file-text" style={{fontSize:28,color:"var(--color-text-info)"}}/></div>
            <div style={{fontSize:16,fontWeight:500,marginBottom:6}}>Step 1 of 3 — Scan prescription</div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:24,lineHeight:1.5}}>Take a clear photo of the physical prescription.<br/>This is the primary document that gets saved.</div>
            <button onClick={()=>scriptRef.current?.click()} style={{padding:"12px 28px",fontSize:14,fontWeight:500,borderRadius:10,background:"var(--color-background-info)",color:"var(--color-text-info)",border:"1px solid var(--color-border-info)",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8}}><i className="ti ti-camera"/> Open camera</button>
            <input ref={scriptRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>onScriptPhoto(e.target.files[0])}/>
          </div>
          <div style={{marginTop:20,padding:"12px 14px",background:"var(--color-background-secondary)",borderRadius:10,fontSize:12,color:"var(--color-text-secondary)"}}><strong>Tips:</strong> Lay script flat · All text visible · Good lighting · Hold steady</div>
          <button onClick={()=>setScanStep("scanning_script")} style={{marginTop:12,width:"100%",padding:"9px",fontSize:13,borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"transparent",color:"var(--color-text-secondary)",cursor:"pointer"}}>Skip — proceed to trailer label scan</button>
        </div>)}

        {scanStep==="scanning_script"&&(<div>
          <div style={{textAlign:"center",padding:"20px 0 16px"}}>
            {newRx.scriptPreview&&<img src={newRx.scriptPreview} alt="Script" style={{width:90,height:"auto",borderRadius:8,marginBottom:14,border:"1px solid var(--color-border-tertiary)"}}/>}
            {newRx.scriptPreview&&<div style={{fontSize:13,fontWeight:500,color:"var(--color-text-success)",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><i className="ti ti-circle-check" style={{fontSize:16}}/> Prescription scanned</div>}
            <div style={{width:56,height:56,borderRadius:14,background:"var(--color-background-warning)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><i className="ti ti-scan" style={{fontSize:28,color:"var(--color-text-warning)"}}/></div>
            <div style={{fontSize:16,fontWeight:500,marginBottom:6}}>Step 2 of 3 — Scan trailer label</div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:24,lineHeight:1.5}}>Now photograph the small sticker label.<br/>The app will read it and fill the form automatically.</div>
            <button onClick={()=>trailerRef.current?.click()} style={{padding:"12px 28px",fontSize:14,fontWeight:500,borderRadius:10,background:"var(--color-background-warning)",color:"var(--color-text-warning)",border:"1px solid var(--color-border-warning)",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8}}><i className="ti ti-camera"/> Open camera</button>
            <input ref={trailerRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>onTrailerPhoto(e.target.files[0])}/>
          </div>
          <button onClick={()=>setScanStep("verify")} style={{width:"100%",padding:"9px",fontSize:13,borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"transparent",color:"var(--color-text-secondary)",cursor:"pointer"}}>Skip — fill in manually</button>
          <button onClick={()=>setScanStep("idle")} style={{marginTop:8,width:"100%",padding:"9px",fontSize:13,borderRadius:8,border:"none",background:"transparent",color:"var(--color-text-tertiary)",cursor:"pointer"}}>← Rescan prescription</button>
        </div>)}

        {scanStep==="parsing"&&(<div style={{textAlign:"center",padding:"40px 0"}}>
          {newRx.trailerPreview&&<img src={newRx.trailerPreview} alt="Label" style={{width:100,height:"auto",borderRadius:8,marginBottom:16,border:"1px solid var(--color-border-tertiary)"}}/>}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
            <div style={{width:20,height:20,border:"2px solid var(--color-border-secondary)",borderTopColor:"var(--color-text-info)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <span style={{fontSize:15,fontWeight:500}}>Reading label…</span>
          </div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>This takes about 3 seconds</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>)}

        {scanStep==="verify"&&(<div>
          {newRx.trailerPreview&&(<div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:14,padding:"10px 12px",background:"var(--color-background-success)",border:"1px solid var(--color-border-success)",borderRadius:10}}>
            <img src={newRx.trailerPreview} alt="Trailer label" style={{width:56,height:"auto",borderRadius:6,flexShrink:0,border:"1px solid var(--color-border-secondary)"}}/>
            <div><div style={{fontSize:13,fontWeight:500,color:"var(--color-text-success)"}}>Label scanned — verify the fields below</div><div style={{fontSize:12,color:"var(--color-text-success)",marginTop:2}}>Correct anything that doesn't look right.</div></div>
          </div>)}
          {sec("Patient")}
          <div style={{marginBottom:10,position:"relative"}}>
            <label style={lbl}>Patient <span style={{color:"var(--color-text-danger)"}}>*</span></label>
            <input style={{...inp,borderColor:newRx.patientId?"var(--color-border-success)":"var(--color-border-secondary)"}} placeholder="Type name, patient ID or dispensing profile no…" value={ptSearch} onChange={e=>{setPtSearch(e.target.value);setNewRx(r=>({...r,patientId:""}));}}/>
            {ptSearch&&!newRx.patientId&&(<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--color-background-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:8,maxHeight:160,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,.1)"}}>
              {patients.filter(p=>fullName(p).toLowerCase().includes(ptSearch.toLowerCase())||p.id?.toLowerCase().includes(ptSearch.toLowerCase())||p.surname.toLowerCase().includes(ptSearch.toLowerCase())).map(p=>(<div key={p.id} onClick={()=>{setNewRx(r=>({...r,patientId:p.id}));setPtSearch(`${fullName(p)} (${p.id})`);}} style={{padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--color-border-tertiary)"}}><span style={{fontWeight:500}}>{fullName(p)}</span><span style={{color:"var(--color-text-tertiary)"}}> {p.id} · {p.disp_profile_no}</span></div>))}
              {patients.filter(p=>fullName(p).toLowerCase().includes(ptSearch.toLowerCase())||p.surname.toLowerCase().includes(ptSearch.toLowerCase())).length===0&&(<div style={{padding:"10px 12px",fontSize:13,color:"var(--color-text-tertiary)"}}>No match — <span style={{color:"var(--color-text-info)",cursor:"pointer"}} onClick={()=>setTab(TABS.indexOf("Add Patient"))}>add new patient</span></div>)}
            </div>)}
          </div>
          {sec("Script details")}
          {row2(fld("Script date","script_date",newRx,setNewRx,"date"),fld("Valid until","valid_until",newRx,setNewRx,"date"))}
          {row2(fld("Doctor name","doctor",newRx,setNewRx,"text","e.g. Dr. A. Mokoena"),fld("Practice number","practice_no",newRx,setNewRx,"text","optional"))}
          {sec("Medications")}
          <div style={{marginBottom:10}}><label style={lbl}>Medications dispensed <span style={{color:"var(--color-text-danger)"}}>*</span></label><textarea style={{...inp,minHeight:68,resize:"vertical"}} value={newRx.items} onChange={e=>setNewRx(r=>({...r,items:e.target.value}))} placeholder="Will be filled from label scan"/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Dispensed by</label><input style={inp} value={newRx.dispensed_by_name} onChange={e=>setNewRx(r=>({...r,dispensed_by_name:e.target.value}))}/></div>
          {row2(<div style={{marginBottom:10}}><label style={lbl}>Total price (R)</label><input style={inp} value={newRx.total_price} onChange={e=>setNewRx(r=>({...r,total_price:e.target.value}))} placeholder="e.g. 245.00"/></div>,
                <div style={{marginBottom:10}}><label style={lbl}>Diagnosis / notes</label><input style={inp} value={newRx.diagnosis} onChange={e=>setNewRx(r=>({...r,diagnosis:e.target.value}))} placeholder="optional"/></div>)}
          <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:10}}><input type="checkbox" id="chronic" checked={newRx.is_chronic} onChange={e=>setNewRx(r=>({...r,is_chronic:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/><label htmlFor="chronic" style={{fontSize:13,cursor:"pointer"}}>Chronic (repeat) script</label></div>
          {newRx.is_chronic&&<>{fld("Repeats remaining","repeats",newRx,setNewRx,"number","e.g. 5")}<div style={{marginBottom:10}}><label style={lbl}>Changes from previous script</label><textarea style={{...inp,minHeight:52,resize:"vertical"}} value={newRx.changes} onChange={e=>setNewRx(r=>({...r,changes:e.target.value}))} placeholder="Leave blank if unchanged"/></div></>}
          <button onClick={()=>setScanStep("ready")} style={{marginTop:6,padding:"11px",fontSize:14,fontWeight:500,borderRadius:10,width:"100%",background:"var(--color-background-info)",color:"var(--color-text-info)",border:"1px solid var(--color-border-info)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <i className="ti ti-circle-check"/> Step 3 — Review &amp; Save
          </button>
        </div>)}

        {scanStep==="ready"&&(<div>
          <div style={{marginBottom:14,padding:"12px 14px",background:"var(--color-background-success)",border:"1px solid var(--color-border-success)",borderRadius:10,fontSize:13,color:"var(--color-text-success)",display:"flex",alignItems:"center",gap:8}}><i className="ti ti-circle-check" style={{fontSize:18}}/><span>Ready to save. Review scans then tap Save.</span></div>
          <div style={{display:"grid",gridTemplateColumns:newRx.trailerPreview&&newRx.scriptPreview?"1fr 1fr":"1fr",gap:10,marginBottom:16}}>
            {newRx.scriptPreview&&(<div style={{borderRadius:10,overflow:"hidden",border:"1px solid var(--color-border-tertiary)"}}><div style={{fontSize:11,padding:"5px 10px",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",fontWeight:500}}>Prescription</div><img src={newRx.scriptPreview} alt="Prescription" style={{width:"100%",display:"block",maxHeight:200,objectFit:"contain",background:"#fff"}}/></div>)}
            {newRx.trailerPreview&&(<div style={{borderRadius:10,overflow:"hidden",border:"1px solid var(--color-border-tertiary)"}}><div style={{fontSize:11,padding:"5px 10px",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",fontWeight:500}}>Trailer label</div><img src={newRx.trailerPreview} alt="Trailer label" style={{width:"100%",display:"block",maxHeight:200,objectFit:"contain",background:"#fff"}}/></div>)}
          </div>
          <div style={{fontSize:13,marginBottom:12,padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8}}>
            <div style={{fontWeight:500,marginBottom:4}}>{ptSearch||"Patient not set"}</div>
            <div style={{color:"var(--color-text-secondary)"}}>{newRx.items||"No medications recorded"}</div>
            <div style={{color:"var(--color-text-tertiary)",fontSize:12,marginTop:2}}>{fmtDate(newRx.script_date)} · {newRx.dispensed_by_name||currentUser.name}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button onClick={()=>setScanStep("verify")} style={{padding:"11px",fontSize:14,borderRadius:10,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",cursor:"pointer"}}>← Edit fields</button>
            <button onClick={addScript} disabled={loading} style={{padding:"11px",fontSize:14,fontWeight:500,borderRadius:10,background:"var(--color-background-success)",color:"var(--color-text-success)",border:"1px solid var(--color-border-success)",cursor:"pointer",opacity:loading?.6:1}}>{loading?"Saving…":"Save script"}</button>
          </div>
          <button onClick={resetScan} style={{marginTop:8,width:"100%",padding:"8px",fontSize:12,borderRadius:8,border:"none",background:"transparent",color:"var(--color-text-tertiary)",cursor:"pointer"}}>Start over</button>
        </div>)}
      </div>)}

      {/* ── STAFF ── */}
      {TABS[tab]==="Staff"&&(<div>
        <div style={{fontSize:14,color:"var(--color-text-secondary)",marginBottom:16}}>Locum PINs are auto-generated daily and expire at midnight.</div>
        {["admin","dispenser","locum"].map(role=>(<div key={role} style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{ROLE_LABEL[role]}</div>
          {STAFF.filter(s=>s.role===role).map(s=>(<div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"1px solid var(--color-border-tertiary)",borderRadius:10,marginBottom:6,background:"var(--color-background-secondary)"}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:`var(--color-background-${ROLE_COLOR[role]})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-user" style={{fontSize:16,color:`var(--color-text-${ROLE_COLOR[role]})`}}/></div>
            <div style={{flex:1}}><div style={{fontWeight:500,fontSize:14}}>{s.name}</div><div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{s.title}</div></div>
            <PinDisplay role={role} pin={getPin(s)}/>
          </div>))}
        </div>))}
      </div>)}
    </div>
  );
}

function ScriptImages({ scriptPath, trailerPath }) {
  const [scriptUrl, setScriptUrl] = useState(null);
  const [trailerUrl, setTrailerUrl] = useState(null);
  useEffect(()=>{
    if(scriptPath) sb.signedUrl(scriptPath).then(setScriptUrl);
    if(trailerPath) sb.signedUrl(trailerPath).then(setTrailerUrl);
  },[]);
  if(!scriptUrl&&!trailerUrl) return null;
  return (
    <div style={{marginTop:10}}>
      <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:6}}>Scanned documents</div>
      <div style={{display:"grid",gridTemplateColumns:scriptUrl&&trailerUrl?"1fr 1fr":"1fr",gap:8}}>
        {scriptUrl&&(<div style={{borderRadius:8,overflow:"hidden",border:"1px solid var(--color-border-tertiary)"}}><div style={{fontSize:11,padding:"4px 8px",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)"}}>Prescription</div><img src={scriptUrl} alt="Prescription" style={{width:"100%",display:"block",maxHeight:180,objectFit:"contain",background:"#fff"}}/></div>)}
        {trailerUrl&&(<div style={{borderRadius:8,overflow:"hidden",border:"1px solid var(--color-border-tertiary)"}}><div style={{fontSize:11,padding:"4px 8px",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)"}}>Trailer label</div><img src={trailerUrl} alt="Trailer label" style={{width:"100%",display:"block",maxHeight:180,objectFit:"contain",background:"#fff"}}/></div>)}
      </div>
    </div>
  );
}

function PinDisplay({ role, pin }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{role==="locum"?"Today's PIN":"PIN"}</div><div style={{fontFamily:"var(--font-mono)",fontSize:15,fontWeight:500,letterSpacing:"0.1em",color:show?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{show?pin:"• • • • •"}</div></div>
      <button onClick={()=>setShow(s=>!s)} style={{padding:"6px 8px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",cursor:"pointer",fontSize:14}}><i className={`ti ti-eye${show?"-off":""}`}/></button>
      {role==="locum"&&show&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"var(--color-background-warning)",color:"var(--color-text-warning)",border:"1px solid var(--color-border-warning)"}}>Expires midnight</span>}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [selStaff, setSelStaff] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const today = new Date().toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  function pressKey(k) {
    if(k==="del"){setPin(p=>p.slice(0,-1));setErr("");}
    else if(pin.length<5){const next=pin+k;setPin(next);if(next.length===5){setTimeout(()=>{if(getPin(selStaff)===next)onLogin(selStaff);else{setErr("Incorrect PIN. Try again.");setPin("");}},120);}}
  }
  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:400,margin:"0 auto",padding:"32px 20px",color:"var(--color-text-primary)"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{width:52,height:52,borderRadius:12,background:"var(--color-background-info)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><i className="ti ti-pill" style={{fontSize:26,color:"var(--color-text-info)"}}/></div>
        <div style={{fontSize:20,fontWeight:500}}>PharmaSave</div>
        <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:4}}>{today}</div>
      </div>
      {!selStaff?(<>
        <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:14,textAlign:"center"}}>Select your name to sign in</div>
        {["admin","dispenser","locum"].map(role=>(<div key={role} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{ROLE_LABEL[role]}</div>
          {STAFF.filter(s=>s.role===role).map(s=>(<button key={s.id} onClick={()=>{setSelStaff(s);setPin("");setErr("");}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"11px 14px",border:"1px solid var(--color-border-tertiary)",borderRadius:10,marginBottom:6,cursor:"pointer",background:"var(--color-background-secondary)",textAlign:"left"}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:`var(--color-background-${ROLE_COLOR[role]})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-user" style={{fontSize:16,color:`var(--color-text-${ROLE_COLOR[role]})`}}/></div>
            <div><div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{s.name}</div><div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{s.title}</div></div>
          </button>))}
        </div>))}
      </>):(
        <>
          <button onClick={()=>{setSelStaff(null);setPin("");setErr("");}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"var(--color-text-info)",cursor:"pointer",fontSize:13,padding:0,marginBottom:20}}><i className="ti ti-arrow-left"/> Back</button>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:`var(--color-background-${ROLE_COLOR[selStaff.role]})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}><i className="ti ti-user" style={{fontSize:24,color:`var(--color-text-${ROLE_COLOR[selStaff.role]})`}}/></div>
            <div style={{fontSize:16,fontWeight:500}}>{selStaff.name}</div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>{selStaff.title}</div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:8}}>
            {[0,1,2,3,4].map(i=>(<div key={i} style={{width:16,height:16,borderRadius:"50%",background:pin.length>i?"var(--color-text-info)":"var(--color-border-secondary)",transition:"background .15s"}}/>))}
          </div>
          {err&&<div style={{textAlign:"center",fontSize:13,color:"var(--color-text-danger)",marginBottom:8}}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:260,margin:"16px auto 0"}}>
            {["1","2","3","4","5","6","7","8","9","","0","del"].map(k=>(k===""?<div key="empty"/>:<button key={k} onClick={()=>pressKey(k)} style={{padding:"16px 0",fontSize:k==="del"?20:18,fontWeight:500,borderRadius:12,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:k==="del"?"var(--color-text-secondary)":"var(--color-text-primary)",cursor:"pointer"}}>{k==="del"?<i className="ti ti-backspace"/>:k}</button>))}
          </div>
        </>
      )}
    </div>
  );
}
