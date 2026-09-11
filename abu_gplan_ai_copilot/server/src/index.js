import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
const conversations = new Map();
app.use(cors({origin: process.env.CLIENT_ORIGIN || "*"}));
app.use(express.json({limit:"2mb"}));

const upload = multer({storage: multer.memoryStorage(), limits:{fileSize:10*1024*1024, files:5}});

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

async function extractFileContent(file){
  const {mimetype, originalname, buffer} = file;
  if(mimetype && mimetype.startsWith("image/")){
    return {type:"image", name:originalname, dataUrl:`data:${mimetype};base64,${buffer.toString("base64")}`};
  }
  if(mimetype === "application/pdf"){
    try{
      const data = await pdfParse(buffer);
      return {type:"text", name:originalname, text:data.text.slice(0,15000)};
    }catch(e){
      return {type:"text", name:originalname, text:`[Could not read PDF file: ${originalname}]`};
    }
  }
  if(mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    try{
      const {value} = await mammoth.extractRawText({buffer});
      return {type:"text", name:originalname, text:value.slice(0,15000)};
    }catch(e){
      return {type:"text", name:originalname, text:`[Could not read Word document: ${originalname}]`};
    }
  }
  if(mimetype === "text/plain"){
    return {type:"text", name:originalname, text:buffer.toString("utf-8").slice(0,15000)};
  }
  return {type:"text", name:originalname, text:`[Unsupported file type: ${originalname}]`};
}

async function callAI(messages, model){
  const {AI_API_URL,AI_API_KEY}=process.env;
  const useModel = model || process.env.AI_MODEL;
  if(!AI_API_URL||!AI_API_KEY||!useModel||AI_API_KEY==="your_api_key_here")
    return "Abu Gplan AI Copilot is ready, but the AI provider is not configured yet. Add AI_API_URL, AI_API_KEY and AI_MODEL to server/.env and restart the server.";
  const system={role:"system",content:"You are Abu Gplan AI Copilot, a capable general-purpose AI assistant. Help solve problems, write and debug code, analyze information, plan projects, draft documents, explain difficult topics, and brainstorm. Be accurate, practical, and honest about uncertainty. Do not claim access to systems or information you do not have. When the user attaches images or documents, use their content to inform your answer."};
  const r=await fetch(AI_API_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${AI_API_KEY}`},body:JSON.stringify({model:useModel,messages:[system,...messages],temperature:0.3})});
  if(!r.ok) throw new Error(`AI provider returned HTTP ${r.status}`);
  const data=await r.json();
  return data?.choices?.[0]?.message?.content || "No response was returned by the AI provider.";
}

app.post("/api/chat", upload.array("files", 5), async(req,res)=>{
  try{
    const message=String(req.body?.message||"").trim();
    const files=req.files||[];
    if(!message && files.length===0) return res.status(400).json({error:"Message is required."});

    let c=conversations.get(req.body?.conversationId);
    if(!c){
      c={id:req.body?.conversationId||crypto.randomUUID(),title:(message||files[0]?.originalname||"New conversation").slice(0,60),updatedAt:Date.now(),messages:[]};
      conversations.set(c.id,c);
    }

    const extracted = await Promise.all(files.map(extractFileContent));
    const images = extracted.filter(f=>f.type==="image");
    const textFiles = extracted.filter(f=>f.type==="text");
    const textFilesBlock = textFiles.length ? textFiles.map(f=>`[Attached file: ${f.name}]\n${f.text}`).join("\n\n") : "";

    let displayContent = message;
    if(textFilesBlock) displayContent += (displayContent?"\n\n":"") + textFilesBlock;
    if(images.length) displayContent += (displayContent?"\n\n":"") + images.map(f=>`[Attached image: ${f.name}]`).join("\n");

    c.messages.push({role:"user",content:displayContent});

    let apiMessages = c.messages.map(m=>({role:m.role,content:m.content}));
    let model = req.body?.model || process.env.AI_MODEL;

    if(images.length){
      model = process.env.AI_VISION_MODEL || "qwen/qwen3.6-27b";
      const lastIdx = apiMessages.length-1;
      const contentArr=[{type:"text", text: (message||"") + (textFilesBlock? "\n\n"+textFilesBlock : "")}];
      images.forEach(img=>contentArr.push({type:"image_url", image_url:{url:img.dataUrl}}));
      apiMessages[lastIdx] = {role:"user", content:contentArr};
    }

    const answer=await callAI(apiMessages, model);
    c.messages.push({role:"assistant",content:answer}); c.updatedAt=Date.now();
    res.json({conversationId:c.id,answer});
  }catch(e){console.error(e);res.status(500).json({error:e.message||"Server error"});}
});
app.listen(port,()=>console.log(`Abu Gplan AI Copilot backend: http://localhost:${port}`));
