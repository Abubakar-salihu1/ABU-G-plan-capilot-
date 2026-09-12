import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { createRequire } from "module";
import mammoth from "mammoth";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
const conversations = new Map();
app.use(cors({origin: process.env.CLIENT_ORIGIN || "*"}));
app.use(express.json({limit:"2mb"}));

const upload = multer({storage: multer.memoryStorage(), limits:{fileSize:10*1024*1024, files:5}});

/* ---------- MongoDB (user accounts) ---------- */
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let usersCollection;
async function connectDB(){
  await mongoClient.connect();
  const db = mongoClient.db();
  usersCollection = db.collection("users");
  await usersCollection.createIndex({email:1},{unique:true});
  console.log("Connected to MongoDB");
}
connectDB().catch(err=>console.error("MongoDB connection error:", err.message));

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me_in_render_env_vars";

function signToken(user){
  return jwt.sign({sub:user._id.toString(), email:user.email}, JWT_SECRET, {expiresIn:"30d"});
}

function authMiddleware(req,res,next){
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if(!token) return res.status(401).json({error:"Please log in to continue."});
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {id:payload.sub, email:payload.email};
    next();
  }catch(e){
    return res.status(401).json({error:"Your session has expired. Please log in again."});
  }
}

/* ---------- Auth routes ---------- */
app.post("/api/auth/signup", async(req,res)=>{
  try{
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    if(!email||!email.includes("@")) return res.status(400).json({error:"A valid email is required."});
    if(password.length<6) return res.status(400).json({error:"Password must be at least 6 characters."});
    if(!usersCollection) return res.status(503).json({error:"Database is not ready yet. Try again in a moment."});
    const existing = await usersCollection.findOne({email});
    if(existing) return res.status(409).json({error:"An account with this email already exists."});
    const passwordHash = await bcrypt.hash(password,10);
    const result = await usersCollection.insertOne({email,passwordHash,createdAt:new Date()});
    const token = signToken({_id:result.insertedId, email});
    res.status(201).json({token,email});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Signup failed. Please try again."});
  }
});

app.post("/api/auth/login", async(req,res)=>{
  try{
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    if(!usersCollection) return res.status(503).json({error:"Database is not ready yet. Try again in a moment."});
    const user = await usersCollection.findOne({email});
    if(!user) return res.status(401).json({error:"Incorrect email or password."});
    const ok = await bcrypt.compare(password, user.passwordHash);
    if(!ok) return res.status(401).json({error:"Incorrect email or password."});
    const token = signToken(user);
    res.json({token,email:user.email});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Login failed. Please try again."});
  }
});

app.get("/api/auth/me", authMiddleware, (req,res)=>{
  res.json({email:req.user.email});
});

app.get("/api/health", (_req,res)=>res.json({ok:true,name:"Abu Gplan AI Copilot",time:new Date().toISOString()}));

/* ---------- Conversations (now user-scoped) ---------- */
app.get("/api/conversations", authMiddleware, (req,res)=>{
  res.json([...conversations.values()].filter(c=>c.userId===req.user.id).map(({id,title,updatedAt})=>({id,title,updatedAt})));
});
app.get("/api/conversations/:id", authMiddleware, (req,res)=>{
  const c=conversations.get(req.params.id);
  if(!c || c.userId!==req.user.id) return res.status(404).json({error:"Conversation not found"});
  res.json(c);
});
app.post("/api/conversations", authMiddleware, (req,res)=>{
  const id=crypto.randomUUID();
  const c={id,userId:req.user.id,title:String(req.body?.title||"New conversation").slice(0,100),updatedAt:Date.now(),messages:[]};
  conversations.set(id,c); res.status(201).json(c);
});
app.delete("/api/conversations/:id", authMiddleware, (req,res)=>{
  const c=conversations.get(req.params.id);
  if(c && c.userId===req.user.id) conversations.delete(req.params.id);
  res.status(204).end();
});

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

app.post("/api/chat", authMiddleware, upload.array("files", 5), async(req,res)=>{
  try{
    const message=String(req.body?.message||"").trim();
    const files=req.files||[];
    if(!message && files.length===0) return res.status(400).json({error:"Message is required."});

    let c=conversations.get(req.body?.conversationId);
    if(!c || c.userId!==req.user.id){
      c={id:req.body?.conversationId||crypto.randomUUID(),userId:req.user.id,title:(message||files[0]?.originalname||"New conversation").slice(0,60),updatedAt:Date.now(),messages:[]};
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
