
const COOKIE="tachibana_session";
const allowedImageKinds=new Set(["campus_map","inside_map","stage_schedule","shop_map"]);

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    try{
      if(url.pathname==="/api/public" && request.method==="GET") return json(await publicData(env));
      if(url.pathname==="/api/login" && request.method==="POST") return login(request,env);
      if(url.pathname==="/api/logout" && request.method==="POST") return new Response(null,{status:204,headers:{"Set-Cookie":`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}});
      if(url.pathname.startsWith("/media/") && request.method==="GET") return media(url,env);
      if(url.pathname.startsWith("/api/admin/")){
        if(!(await authed(request,env))) return json({error:"ログインが必要です"},401);
        return admin(request,url,env);
      }
      return env.ASSETS.fetch(request);
    }catch(e){return json({error:e?.message||"サーバーエラー"},500)}
  }
};

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}})}
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sessionToken(secret){return sha256("tachibana:"+secret)}
async function login(req,env){
  const body=await req.json(); if(!env.ADMIN_PASSWORD) return json({error:"ADMIN_PASSWORDが未設定です"},500);
  if(String(body.password)!==String(env.ADMIN_PASSWORD)) return json({error:"パスワードが違います"},401);
  const token=await sessionToken(env.SESSION_SECRET||env.ADMIN_PASSWORD);
  return json({ok:true},200,{"Set-Cookie":`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`});
}
async function authed(req,env){
  const cookie=req.headers.get("cookie")||""; const got=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.split("=")[1];
  if(!got)return false; return got===await sessionToken(env.SESSION_SECRET||env.ADMIN_PASSWORD||"");
}
async function ensure(env){
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS stages (id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, name TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', joinable INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_no TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, sells TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)")
  ]);
  const defaults={intro:"九州国際大学の大学祭「橘祭」。学生と地域がつながり、ステージ・出店・企画を楽しめる2日間です。",day1:"1日目",day2:"2日目",campus_map:"",inside_map:"",stage_schedule:"",shop_map:""};
  for(const [k,v] of Object.entries(defaults)) await env.DB.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").bind(k,v).run();
}
async function publicData(env){
  await ensure(env);
  const rows=await env.DB.prepare("SELECT key,value FROM settings").all(); const settings=Object.fromEntries(rows.results.map(x=>[x.key,x.value]));
  const stages=(await env.DB.prepare("SELECT id,day,name,time,joinable FROM stages ORDER BY day,sort_order,id").all()).results.map(x=>({...x,joinable:!!x.joinable}));
  const shops=(await env.DB.prepare("SELECT id,shop_no,name,sells FROM shops ORDER BY sort_order,id").all()).results;
  return {settings,stages,shops};
}
async function admin(req,url,env){
  await ensure(env);
  if(url.pathname==="/api/admin/data" && req.method==="GET") return json(await publicData(env));
  if(url.pathname==="/api/admin/settings" && req.method==="PUT"){
    const b=await req.json(); for(const k of ["intro","day1","day2"]) if(k in b) await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k,String(b[k]??"")).run(); return json({ok:true});
  }
  if(url.pathname==="/api/admin/stages" && req.method==="POST"){
    const b=await req.json(); if(!b.name?.trim())return json({error:"ステージ名を入力してください"},400);
    await env.DB.prepare("INSERT INTO stages(day,name,time,joinable) VALUES(?,?,?,?)").bind(Number(b.day)===2?2:1,b.name.trim(),String(b.time||""),b.joinable?1:0).run(); return json({ok:true});
  }
  if(url.pathname.startsWith("/api/admin/stages/") && req.method==="DELETE"){await env.DB.prepare("DELETE FROM stages WHERE id=?").bind(Number(url.pathname.split("/").pop())).run();return json({ok:true})}
  if(url.pathname==="/api/admin/shops" && req.method==="POST"){
    const b=await req.json(); if(!b.name?.trim())return json({error:"店名を入力してください"},400);
    await env.DB.prepare("INSERT INTO shops(shop_no,name,sells) VALUES(?,?,?)").bind(String(b.shop_no||""),b.name.trim(),String(b.sells||"")).run();return json({ok:true});
  }
  if(url.pathname.startsWith("/api/admin/shops/") && req.method==="DELETE"){await env.DB.prepare("DELETE FROM shops WHERE id=?").bind(Number(url.pathname.split("/").pop())).run();return json({ok:true})}
  if(url.pathname.startsWith("/api/admin/image/") && req.method==="PUT"){
    const kind=url.pathname.split("/").pop(); if(!allowedImageKinds.has(kind))return json({error:"画像種別が不正です"},400);
    const type=req.headers.get("content-type")||"application/octet-stream"; if(!type.startsWith("image/"))return json({error:"画像ファイルを選んでください"},400);
    const buf=await req.arrayBuffer(); if(buf.byteLength>10*1024*1024)return json({error:"画像は10MB以下にしてください"},413);
    const ext=(type.split("/")[1]||"bin").replace("jpeg","jpg").replace(/[^a-z0-9]/g,""); const key=`${kind}-${Date.now()}.${ext}`;
    const old=(await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(kind).first())?.value;
    await env.IMAGES.put(key,buf,{httpMetadata:{contentType:type}});
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(kind,key).run();
    if(old) await env.IMAGES.delete(old); return json({ok:true,key});
  }
  return json({error:"Not found"},404);
}
async function media(url, env) {
  const key = decodeURIComponent(url.pathname.slice("/media/".length));

  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await env.IMAGES.get(key);

  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();

  if (obj.httpMetadata?.contentType) {
    headers.set("content-type", obj.httpMetadata.contentType);
  }

  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");

  return new Response(obj.body, {
    status: 200,
    headers
  });
}
