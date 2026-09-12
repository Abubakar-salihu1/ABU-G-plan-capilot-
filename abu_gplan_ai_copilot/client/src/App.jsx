import React,{useEffect,useState,useRef} from "react";
import {Bot,Menu,Plus,Send,Sparkles,Trash2,User,X,Code2,Lightbulb,FileText,Brain,Mic,ChevronDown,LogOut} from "lucide-react";
const API=import.meta.env.VITE_API_URL||"http://localhost:5000/api";

const MODELS=[
 {id:"openai/gpt-oss-20b",label:"Fast"},
 {id:"openai/gpt-oss-120b",label:"Powerful"},
 {id:"qwen/qwen3.6-27b",label:"Vision"}
];

function AuthScreen({onAuthenticated}){
 const [mode,setMode]=useState("login");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);

 async function submit(e){
  e.preventDefault();
  setError("");
  setLoading(true);
  try{
   const r=await fetch(`${API}/auth/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||"Something went wrong.");
   localStorage.setItem("abuGplanToken",data.token);
   onAuthenticated(data.token,data.email);
  }catch(err){
   setError(err.message);
  }finally{
   setLoading(false);
  }
 }

 return <div className="authScreen">
  <div className="authCard">
   <img src="/logo.png" className="authLogo"/>
   <h1>Abu Gplan AI Copilot</h1>
   <p className="authSub">{mode==="login"?"Log in to continue":"Create your account"}</p>
   <form onSubmit={submit}>
    <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/>
    <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/>
    {error&&<div className="authError">{error}</div>}
    <button type="submit" disabled={loading}>{loading?"Please wait...":(mode==="login"?"Log in":"Sign up")}</button>
   </form>
   <button type="button" className="authSwitch" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("")}}>
    {mode==="login"?"Don't have an account? Sign up":"Already have an account? Log in"}
   </button>
  </div>
 </div>
}

export default function App(){
 const [authToken,setAuthToken]=useState(null);
 const [authEmail,setAuthEmail]=useState("");
 const [authChecked,setAuthChecked]=useState(false);

 const [messages,setMessages]=useState([]),[input,setInput]=useState(""),[conversationId,setConversationId]=useState(null),[history,setHistory]=useState([]),[loading,setLoading]=useState(false),[sidebar,setSidebar]=useState(false);
 const [listening,setListening]=useState(false);
 const [attachments,setAttachments]=useState([]);
 const [model,setModel]=useState(MODELS[0].id);
 const [modelMenuOpen,setModelMenuOpen]=useState(false);
 const recognitionRef=useRef(null);
 const fileInputRef=useRef(null);

 useEffect(()=>{
  const stored=localStorage.getItem("abuGplanToken");
  if(!stored){setAuthChecked(true);return}
  fetch(`${API}/auth/me`,{headers:{Authorization:`Bearer ${stored}`}})
   .then(r=>{if(!r.ok) throw new Error(); return r.json()})
   .then(data=>{setAuthToken(stored);setAuthEmail(data.email)})
   .catch(()=>{localStorage.removeItem("abuGplanToken")})
   .finally(()=>setAuthChecked(true));
 },[]);

 function handleAuthenticated(token,email){
  setAuthToken(token);
  setAuthEmail(email);
 }
 function handleLogout(){
  localStorage.removeItem("abuGplanToken");
  setAuthToken(null);
  setAuthEmail("");
  setMessages([]);setConversationId(null);setHistory([]);setSidebar(false);
 }
 function authHeaders(){return authToken?{Authorization:`Bearer ${authToken}`}:{}}

 async function loadHistory(){
  if(!authToken) return;
  try{const r=await fetch(`${API}/conversations`,{headers:authHeaders()});if(r.ok)setHistory(await r.json())}catch{}
 }
 useEffect(()=>{if(authToken) loadHistory()},[authToken]);

 function toggleMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert("Voice input is not supported on this browser.");return}
  if(listening){recognitionRef.current&&recognitionRef.current.stop();setListening(false);return}
  const rec=new SR();
  rec.lang="en-US";
  rec.interimResults=false;
  rec.maxAlternatives=1;
  rec.onresult=function(e){const text=e.results[0][0].transcript;setInput(function(prev){return prev+" "+text})};
  rec.onend=function(){setListening(false)};
  rec.onerror=function(){setListening(false)};
  recognitionRef.current=rec;
  rec.start();
  setListening(true);
 }

 function openFilePicker(){fileInputRef.current&&fileInputRef.current.click()}
 function onFilesSelected(e){
  const picked=Array.from(e.target.files||[]);
  const withPreview=picked.map(file=>({
   file,
   id:crypto.randomUUID(),
   isImage:file.type.startsWith("image/"),
   previewUrl:file.type.startsWith("image/")?URL.createObjectURL(file):null
  }));
  setAttachments(prev=>[...prev,...withPreview].slice(0,5));
  e.target.value="";
 }
 function removeAttachment(id){
  setAttachments(prev=>{
   const found=prev.find(a=>a.id===id);
   if(found&&found.previewUrl) URL.revokeObjectURL(found.previewUrl);
   return prev.filter(a=>a.id!==id);
  });
 }

 function newChat(){setConversationId(null);setMessages([]);setInput("");setSidebar(false);setAttachments([])}
 async function openChat(id){try{const r=await fetch(`${API}/conversations/${id}`,{headers:authHeaders()});if(!r.ok)return;const c=await r.json();setConversationId(id);setMessages(c.messages||[]);setSidebar(false)}catch{} }

 async function sendMessage(e){
  e?.preventDefault();
  const text=input.trim();
  if((!text&&attachments.length===0)||loading) return;
  setInput("");
  const attachedNow=attachments;
  setAttachments([]);
  setMessages(m=>[...m,{role:"user",content:text+(attachedNow.length?("\n\n"+attachedNow.map(a=>`[Attached ${a.isImage?"image":"file"}: ${a.file.name}]`).join("\n")):"")}]);
  setLoading(true);
  try{
   const form=new FormData();
   form.append("message",text);
   form.append("model",model);
   if(conversationId) form.append("conversationId",conversationId);
   attachedNow.forEach(a=>form.append("files",a.file));
   const r=await fetch(`${API}/chat`,{method:"POST",headers:authHeaders(),body:form});
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||"Request failed");
   setConversationId(data.conversationId);
   setMessages(m=>[...m,{role:"assistant",content:data.answer}]);
   loadHistory();
  }catch(err){
   setMessages(m=>[...m,{role:"assistant",content:`I couldn't complete that request. ${err.message}`}]);
  }finally{
   setLoading(false);
  }
 }

 async function deleteChat(id){await fetch(`${API}/conversations/${id}`,{method:"DELETE",headers:authHeaders()});if(id===conversationId)newChat();loadHistory()}
 const examples=[{icon:<Code2/>,text:"Build a professional website for my business"},{icon:<Lightbulb/>,text:"Help me solve a difficult problem"},{icon:<FileText/>,text:"Write a professional business proposal"},{icon:<Brain/>,text:"Explain a difficult topic step by step"}];
 const currentModelLabel=MODELS.find(m=>m.id===model)?.label||"Fast";

 if(!authChecked){
  return <div className="authScreen"><div className="authLoading">Loading...</div></div>;
 }
 if(!authToken){
  return <AuthScreen onAuthenticated={handleAuthenticated}/>;
 }

 return <div className="app">
  <aside className={`sidebar ${sidebar?"open":""}`}>
   <div className="brand"><img src="/logo.png"/><div><strong>Abu Gplan</strong><span>AI Copilot</span></div><button className="close" onClick={()=>setSidebar(false)}><X/></button></div>
   <button className="newChat" onClick={newChat}><Plus size={19}/> New conversation</button>
   <div className="label">Recent conversations</div><div className="history">{history.map(c=><div className="row" key={c.id}><button className="item" onClick={()=>openChat(c.id)}>{c.title}</button><button className="delete" onClick={()=>deleteChat(c.id)}><Trash2 size={15}/></button></div>)}</div>
   <div className="bottom">
    <div className="accountRow">
     <div><b>{authEmail}</b><small>Signed in</small></div>
     <button className="logoutBtn" onClick={handleLogout} title="Log out"><LogOut size={16}/></button>
    </div>
   </div>
  </aside>
  <main className="main">
   <header><button className="menu" onClick={()=>setSidebar(true)}><Menu/></button><div className="title"><Sparkles size={18}/> Abu Gplan AI Copilot</div><div className="online"><i/> Online</div></header>
   <section className="chatArea">{messages.length===0?<div className="welcome"><img className="heroLogo" src="/logo.png"/><div className="eyebrow"><Sparkles size={15}/> YOUR AI WORKSPACE</div><h1>What can I help you solve?</h1><p>Ask Abu Gplan to plan, explain, code, analyze, write, brainstorm or work through a problem with you.</p><div className="examples">{examples.map((x,i)=><button key={i} onClick={()=>setInput(x.text)}><span>{x.icon}</span>{x.text}</button>)}</div></div>:<div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><div className="avatar">{m.role==="user"?<User size={17}/>:<Bot size={17}/>}</div><div className="bubble">{m.content}</div></div>)}{loading&&<div className="message assistant"><div className="avatar"><Bot size={17}/></div><div className="bubble thinking"><span/><span/><span/></div></div>}</div>}</section>

   <div className="composerWrap">
    <div className="modelPicker">
     <button type="button" className="modelPickerBtn" onClick={()=>setModelMenuOpen(o=>!o)}>
      {currentModelLabel}<ChevronDown size={14}/>
     </button>
     {modelMenuOpen&&<div className="modelMenu">
      {MODELS.map(m=><button type="button" key={m.id} className={`modelOption ${m.id===model?"active":""}`} onClick={()=>{setModel(m.id);setModelMenuOpen(false)}}>{m.label}</button>)}
     </div>}
    </div>

    {attachments.length>0&&<div className="attachments">
     {attachments.map(a=><div className="attachmentChip" key={a.id}>
      {a.isImage?<img src={a.previewUrl} className="attachmentThumb"/>:<FileText size={16}/>}
      <span className="attachmentName">{a.file.name}</span>
      <button type="button" className="attachmentRemove" onClick={()=>removeAttachment(a.id)}><X size={13}/></button>
     </div>)}
    </div>}

    <form className="composer" onSubmit={sendMessage}>
     <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.txt,.docx" style={{display:"none"}} onChange={onFilesSelected}/>
     <button type="button" className="composerIcon plus" onClick={openFilePicker}><Plus size={20}/></button>
     <textarea value={input} rows="1" placeholder="Message Abu Gplan AI..." onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(e)}}}/>
     <button type="button" className={`composerIcon mic ${listening?"listening":""}`} onClick={toggleMic}><Mic size={19}/></button>
     <button className="composerIcon sendBtn" disabled={(!input.trim()&&attachments.length===0)||loading}><Send size={18}/></button>
    </form>
   </div>
   <div className="notice">Abu Gplan AI can make mistakes. Verify important information.</div>
  </main>
 </div>
}
