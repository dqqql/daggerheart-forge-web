export const now = () => new Date().toISOString()
const enc = new TextEncoder()
const b64 = (a:Uint8Array) => btoa(String.fromCharCode(...a))
const unb64 = (s:string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0))
export const random = () => crypto.randomUUID()
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
export async function sha256(value:string) { const bytes = await crypto.subtle.digest('SHA-256',enc.encode(value)); return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('') }
export async function passwordHash(password:string,salt:string) { const key = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']); const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:310000,hash:'SHA-256'},key,256); return b64(new Uint8Array(bits)) }
export function equal(a:string,b:string) { if(a.length!==b.length)return false; let n=0; for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i); return n===0 }
async function aes(secret:string) { const bytes=unb64(secret); if(bytes.length!==32)throw Error('ENCRYPTION_KEY must be 32 bytes in base64'); return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']) }
export async function encrypt(value:string,secret:string) { const iv=crypto.getRandomValues(new Uint8Array(12)); const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(secret),enc.encode(value)); return {iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))} }
export async function decrypt(ciphertext:string,iv:string,secret:string) { const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await aes(secret),unb64(ciphertext)); return new TextDecoder().decode(plain) }
