import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
const conversations = new Map();
app.use(cors({origin: process.env.CLIENT_ORIGIN || "*"}));
app.use(express.json({limit:"2mb"}));

app.get("/api/health", (_req,res)=>res.json({ok:true,name:"Abu Gplan AI Copilot",time:new Date().toISOString()}));
app.get("/api/conversations", (_req,res)=>res.json([...conversations.values()].map(({id,title,updatedAt})=>({id,title,updatedAt}))));
app.get("/api/conversations/:id", (req,res)=>{
  const c=conversations.get(req.params.id);
  if(!c) return res.status(404).json({error:"Conversation not found"});
  res.json(c);
});
app.post("/api/conversations", (req,res)=>{
  const id=crypto.randomUUID();
  const c={id,title:String(req.body?.title||"New conversation").slice(0,100),updatedAt:Date.now(),messages:[]};
  conversations.set(id,c); res.status(201).json(c);
});
app.delete("/api/conversations/:id", (req,res)=>{conversations.delete(req.params.id);res.status(204).end();});

async function callAI(messages){
  const {AI_API_URL,AI_API_KEY,AI_MODEL}=process.env;
  if(!AI_API_URL||!AI_API_KEY||!AI_MODEL||AI_API_KEY==="your_api_key_here")
    return "Abu Gplan AI Copilot is ready, but the AI provider is not configured yet. Add AI_API_URL, AI_API_KEY and AI_MODEL to server/.env and restart the server.";
  const system={role:"system",content:"You are Abu Gplan AI Copilot, a capable general-purpose AI assistant. Help solve problems, write and debug code, analyze information, plan projects, draft documents, explain difficult topics, and brainstorm. Be accurate, practical, and honest about uncertainty. Do not claim access to systems or information you do not have."};
  const r=await fetch(AI_API_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${AI_API_KEY}`},body:JSON.stringify({model:AI_MODEL,messages:[system,...messages],temperature:0.3})});
  if(!r.ok) throw new Error(`AI provider returned HTTP ${r.status}`);
  const data=await r.json();
  return data?.choices?.[0]?.message?.content || "No response was returned by the AI provider.";
}

app.post("/api/chat",async(req,res)=>{
  try{
    const message=String(req.body?.message||"").trim();
    if(!message) return res.status(400).json({error:"Message is required."});
    let c=conversations.get(req.body?.conversationId);
    if(!c){c={id:req.body?.conversationId||crypto.randomUUID(),title:message.slice(0,60),updatedAt:Date.now(),messages:[]};conversations.set(c.id,c);}
    c.messages.push({role:"user",content:message});
    const answer=await callAI(c.messages);
    c.messages.push({role:"assistant",content:answer}); c.updatedAt=Date.now();
    res.json({conversationId:c.id,answer});
  }catch(e){console.error(e);res.status(500).json({error:e.message||"Server error"});}
});
app.listen(port,()=>console.log(`Abu Gplan AI Copilot backend: http://localhost:${port}`));
