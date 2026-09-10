import React,{useEffect,useState} from "react";
import {Bot,Menu,Plus,Send,Sparkles,Trash2,User,X,Code2,Lightbulb,FileText,Brain} from "lucide-react";
const API=import.meta.env.VITE_API_URL||"http://localhost:5000/api";

export default function App(){
 const [messages,setMessages]=useState([]),[input,setInput]=useState(""),[conversationId,setConversationId]=useState(null),[history,setHistory]=useState([]),[loading,setLoading]=useState(false),[sidebar,setSidebar]=useState(false);
 async function loadHistory(){try{const r=await fetch(`${API}/conversations`);if(r.ok)setHistory(await r.json())}catch{}}
 useEffect(()=>{loadHistory()},[]);
 function newChat(){setConversationId(null);setMessages([]);setInput("");setSidebar(false)}
 async function openChat(id){try{const r=await fetch(`${API}/conversations/${id}`);if(!r.ok)return;const c=await r.json();setConversationId(id);setMessages(c.messages||[]);setSidebar(false)}catch{} }
 async function sendMessage(e){e?.preventDefault();const text=input.trim();if(!text||loading)return;setInput("");setMessages(m=>[...m,{role:"user",content:text}]);setLoading(true);try{const r=await fetch(`${API}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId,message:text})});const data=await r.json();if(!r.ok)throw new Error(data.error||"Request failed");setConversationId(data.conversationId);setMessages(m=>[...m,{role:"assistant",content:data.answer}]);loadHistory()}catch(err){setMessages(m=>[...m,{role:"assistant",content:`I couldn't complete that request. ${err.message}`}])}finally{setLoading(false)}}
 async function deleteChat(id){await fetch(`${API}/conversations/${id}`,{method:"DELETE"});if(id===conversationId)newChat();loadHistory()}
 const examples=[{icon:<Code2/>,text:"Build a professional website for my business"},{icon:<Lightbulb/>,text:"Help me solve a difficult problem"},{icon:<FileText/>,text:"Write a professional business proposal"},{icon:<Brain/>,text:"Explain a difficult topic step by step"}];
 return <div className="app">
  <aside className={`sidebar ${sidebar?"open":""}`}>
   <div className="brand"><img src="/logo.png"/><div><strong>Abu Gplan</strong><span>AI Copilot</span></div><button className="close" onClick={()=>setSidebar(false)}><X/></button></div>
   <button className="newChat" onClick={newChat}><Plus size={19}/> New conversation</button>
   <div className="label">Recent conversations</div><div className="history">{history.map(c=><div className="row" key={c.id}><button className="item" onClick={()=>openChat(c.id)}>{c.title}</button><button className="delete" onClick={()=>deleteChat(c.id)}><Trash2 size={15}/></button></div>)}</div>
   <div className="bottom"><b>Abu Gplan AI Copilot</b><small>General-purpose AI workspace</small></div>
  </aside>
  <main className="main">
   <header><button className="menu" onClick={()=>setSidebar(true)}><Menu/></button><div className="title"><Sparkles size={18}/> Abu Gplan AI Copilot</div><div className="online"><i/> Online</div></header>
   <section className="chatArea">{messages.length===0?<div className="welcome"><img className="heroLogo" src="/logo.png"/><div className="eyebrow"><Sparkles size={15}/> YOUR AI WORKSPACE</div><h1>What can I help you solve?</h1><p>Ask Abu Gplan to plan, explain, code, analyze, write, brainstorm or work through a problem with you.</p><div className="examples">{examples.map((x,i)=><button key={i} onClick={()=>setInput(x.text)}><span>{x.icon}</span>{x.text}</button>)}</div></div>:<div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><div className="avatar">{m.role==="user"?<User size={17}/>:<Bot size={17}/>}</div><div className="bubble">{m.content}</div></div>)}{loading&&<div className="message assistant"><div className="avatar"><Bot size={17}/></div><div className="bubble thinking"><span/><span/><span/></div></div>}</div>}</section>
   <form className="composer" onSubmit={sendMessage}><textarea value={input} rows="1" placeholder="Message Abu Gplan AI Copilot..." onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(e)}}}/><button disabled={!input.trim()||loading}><Send size={19}/></button></form><div className="notice">Abu Gplan AI can make mistakes. Verify important information.</div>
  </main>
 </div>
}
