import { encrypt, equal, now, passwordHash, random, randomToken, sha256 } from '../../shared/security'
import type { RunStep, TreeNode } from '../../shared/types'

type Env = { DB:D1Database; ENCRYPTION_KEY:string; FORGE_WORKER:Fetcher; REGISTRATION_ENABLED?:string }
type Ctx = { request:Request; env:Env; params:{path?:string[]} }
const json = (value:unknown,status=200,headers:HeadersInit={}) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}})
const fail = (message:string,status=400) => json({error:message},status)
const cookie = (token:string,maxAge:number,secure=true) => `forge_session=${token}; HttpOnly; ${secure?'Secure; ':''}SameSite=Strict; Path=/; Max-Age=${maxAge}`
async function body(request:Request) { const value=await request.json(); if(!value || typeof value!=='object' || Array.isArray(value))throw Error('请求格式错误'); return value as Record<string,unknown> }
async function owner(request:Request,env:Env) { const token=request.headers.get('cookie')?.match(/(?:^|;\s*)forge_session=([^;]+)/)?.[1]; if(!token)return null; const hash=await sha256(token); const row=await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').bind(hash,now()).first<{user_id:string}>(); return row?.user_id||null }
function validName(s:unknown) { return typeof s==='string' && s.trim().length>0 && s.trim().length<=100 && !/[\\/\x00-\x1f]/.test(s) }
function sameOrigin(req:Request) { const origin=req.headers.get('origin'); return !origin || origin===new URL(req.url).origin }
async function throttle(db:D1Database,scope:string,failed=false) { const row=await db.prepare('SELECT attempts,window_start FROM auth_attempts WHERE scope=?').bind(scope).first<{attempts:number;window_start:string}>();const active=row&&Date.now()-Date.parse(row.window_start)<15*60*1000;if(active&&row.attempts>=10)throw Error('尝试次数过多，请稍后再试');if(failed)await db.prepare('INSERT INTO auth_attempts VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET attempts=?,window_start=?').bind(scope,active?row.attempts+1:1,active?row.window_start:now(),active?row.attempts+1:1,active?row.window_start:now()).run() }
async function getNode(db:D1Database,user:string,id:string) { return db.prepare('SELECT * FROM nodes WHERE id=? AND user_id=?').bind(id,user).first<TreeNode>() }
async function runView(db:D1Database,user:string,id:string) { const run=await db.prepare('SELECT id,file_id,status,current_step,error,snapshot,created_at FROM runs WHERE id=? AND user_id=?').bind(id,user).first(); if(!run)return null; const steps=(await db.prepare('SELECT step,status,result,error FROM run_steps WHERE run_id=? ORDER BY step').bind(id).all()).results.map((x:any)=>({...x,result:x.result?JSON.parse(x.result):null})) as RunStep[]; return {...run,steps} }
async function startBackground(env:Env,id:string){try{const result=await env.FORGE_WORKER.fetch('https://forge-internal/start',{method:'POST',body:JSON.stringify({runId:id})});if(!result.ok)throw Error('worker rejected start');return true}catch{await env.DB.prepare("UPDATE runs SET status='failed',error='后台任务启动失败',updated_at=? WHERE id=?").bind(now(),id).run();return false}}

export async function onRequest({request,env,params}:Ctx) {
  try {
    if(request.method!=='GET' && !sameOrigin(request))return fail('请求来源无效',403)
    const p=Array.isArray(params.path)?params.path:[]; const method=request.method
    if(p[0]==='auth' && p[1]==='register' && method==='POST') {
      if(env.REGISTRATION_ENABLED==='false')return fail('注册暂未开放',403)
      await throttle(env.DB,'register:'+String(request.headers.get('CF-Connecting-IP')||'unknown'))
      const x=await body(request), username=String(x.username||'').trim(), password=String(x.password||'')
      if(!/^[\p{L}\p{N}_-]{3,32}$/u.test(username)||password.length<12||password.length>256)return fail('用户名需为 3–32 个字符；密码至少 12 位')
      const exists=await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first(); if(exists)return fail('用户名已被使用',409)
      await throttle(env.DB,'register:'+String(request.headers.get('CF-Connecting-IP')||'unknown'),true)
      const id=random(),salt=randomToken(),hash=await passwordHash(password,salt),token=randomToken(),expiry=new Date(Date.now()+30*86400000).toISOString()
      await env.DB.batch([env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id,username,hash,salt,now()),env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(token),id,expiry)])
      return json({user:{id,username}},201,{'set-cookie':cookie(token,30*86400,new URL(request.url).protocol==='https:')})
    }
    if(p[0]==='auth' && p[1]==='login' && method==='POST') {
      const x=await body(request),username=String(x.username||''),password=String(x.password||'')
      const scope='login:'+String(request.headers.get('CF-Connecting-IP')||'unknown')+':'+username;await throttle(env.DB,scope)
      const row=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first<any>()
      if(!row || !equal(await passwordHash(password,row.password_salt),row.password_hash)){await throttle(env.DB,scope,true);return fail('账号或密码错误',401)}
      await env.DB.prepare('DELETE FROM auth_attempts WHERE scope=?').bind(scope).run()
      const token=randomToken(),expiry=new Date(Date.now()+30*86400000).toISOString()
      await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(token),row.id,expiry).run()
      return json({user:{id:row.id,username:row.username}},200,{'set-cookie':cookie(token,30*86400,new URL(request.url).protocol==='https:')})
    }
    const user=await owner(request,env); if(!user)return fail('请先登录',401)
    if(p[0]==='auth' && p[1]==='me' && method==='GET') { const row=await env.DB.prepare('SELECT id,username FROM users WHERE id=?').bind(user).first(); return json({user:row}) }
    if(p[0]==='auth' && p[1]==='logout' && method==='POST') { const token=request.headers.get('cookie')?.match(/forge_session=([^;]+)/)?.[1]; if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run(); return json({ok:true},200,{'set-cookie':cookie('',0,new URL(request.url).protocol==='https:')}) }
    if(p[0]==='key') {
      if(method==='GET') {const row=await env.DB.prepare('SELECT updated_at FROM api_keys WHERE user_id=?').bind(user).first(); return json({configured:!!row,updated_at:row?.updated_at||null})}
      if(method==='DELETE') {await env.DB.prepare('DELETE FROM api_keys WHERE user_id=?').bind(user).run();return json({configured:false})}
      if(method==='PUT') {const x=await body(request),key=String(x.key||'').trim();if(key.length<16||key.length>256)return fail('API Key 格式不正确');const v=await encrypt(key,env.ENCRYPTION_KEY);await env.DB.prepare('INSERT INTO api_keys VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_at=excluded.updated_at').bind(user,v.ciphertext,v.iv,now()).run();return json({configured:true})}
    }
    if(p[0]==='nodes') {
      if(p.length===1 && method==='GET') {const rows=await env.DB.prepare('SELECT id,parent_id,kind,name,updated_at FROM nodes WHERE user_id=? ORDER BY kind,name').bind(user).all();return json({nodes:rows.results})}
      if(p.length===1 && method==='POST') {const x=await body(request);if(!validName(x.name)||!['folder','file'].includes(String(x.kind)))return fail('名称或类型无效');const parent=x.parent_id?await getNode(env.DB,user,String(x.parent_id)):null;if(x.parent_id && (!parent||parent.kind!=='folder'))return fail('目标文件夹不存在');const id=random(),date=now();await env.DB.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').bind(id,user,x.parent_id||null,x.kind,String(x.name).trim(),'',date,date).run();return json({id},201)}
      const id=p[1],node=id?await getNode(env.DB,user,id):null;if(!node)return fail('文件不存在',404)
      if(p.length===2 && method==='GET')return json({node})
      if(p.length===2 && method==='PATCH') {const x=await body(request);if(x.name!==undefined && !validName(x.name))return fail('名称无效');if(x.content!==undefined && (node.kind!=='file'||typeof x.content!=='string'||x.content.length>200000))return fail('文件内容无效');let parent=node.parent_id;if(x.parent_id!==undefined) {parent=x.parent_id?String(x.parent_id):null;if(parent===id)return fail('不能移入自身');if(parent){const target=await getNode(env.DB,user,parent);if(!target||target.kind!=='folder')return fail('目标文件夹不存在');let cursor:TreeNode|null=target;while(cursor){if(cursor.id===id)return fail('不能移入子文件夹');cursor=cursor.parent_id?await getNode(env.DB,user,cursor.parent_id):null}}}await env.DB.prepare('UPDATE nodes SET name=?,content=?,parent_id=?,updated_at=? WHERE id=? AND user_id=?').bind(x.name===undefined?node.name:String(x.name).trim(),x.content===undefined?node.content:x.content,parent,now(),id,user).run();return json({ok:true})}
      if(p.length===2 && method==='DELETE') {const ids=[id];for(let i=0;i<ids.length;i++){const children=await env.DB.prepare('SELECT id FROM nodes WHERE user_id=? AND parent_id=?').bind(user,ids[i]).all<{id:string}>();ids.push(...children.results.map(x=>x.id))}for(const item of ids.reverse())await env.DB.prepare('DELETE FROM nodes WHERE user_id=? AND id=?').bind(user,item).run();return json({ok:true})}
    }
    if(p[0]==='runs') {
      if(p.length===1 && method==='GET') {const file=new URL(request.url).searchParams.get('file');if(!file)return fail('缺少文件');const rows=await env.DB.prepare('SELECT id,status,current_step,error,created_at FROM runs WHERE user_id=? AND file_id=? ORDER BY created_at DESC LIMIT 20').bind(user,file).all();return json({runs:rows.results})}
      if(p.length===1 && method==='POST') {const x=await body(request),file=await getNode(env.DB,user,String(x.file_id||''));if(!file||file.kind!=='file')return fail('文件不存在',404);const key=await env.DB.prepare('SELECT ciphertext FROM api_keys WHERE user_id=?').bind(user).first();if(!key)return fail('请先设置 DeepSeek API Key');const id=random(),date=now();await env.DB.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)').bind(id,user,file.id,file.content,'queued',0,null,date,date).run();for(let step=1;step<=7;step++)await env.DB.prepare('INSERT INTO run_steps VALUES(?,?,?,?,?,?)').bind(id,step,'pending',null,null,date).run();if(!await startBackground(env,id))return fail('后台任务启动失败',502);return json({id},202)}
      const id=p[1];if(!id)return fail('缺少任务');const run=await runView(env.DB,user,id);if(!run)return fail('任务不存在',404)
      if(p.length===2 && method==='GET')return json({run})
      if(p[2]==='retry' && method==='POST') {if((run as any).status!=='failed')return fail('只有失败任务可以重试');await env.DB.prepare("UPDATE runs SET status='queued',error=NULL,updated_at=? WHERE id=?").bind(now(),id).run();if(!await startBackground(env,id))return fail('后台任务启动失败',502);return json({ok:true},202)}
    }
    return fail('接口不存在',404)
  } catch(error) {const message=error instanceof Error?error.message:'未知错误';return fail(message,message.includes('尝试次数过多')?429:500)}
}
