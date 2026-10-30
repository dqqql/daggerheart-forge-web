export type NodeKind = 'folder' | 'file'
export type TreeNode = { id:string; parent_id:string|null; kind:NodeKind; name:string; content?:string; updated_at:string }
export type RunStep = { step:number; status:'pending'|'running'|'done'|'failed'; result:unknown|null; error:string|null }
export type Run = { id:string; file_id:string; status:string; current_step:number; error:string|null; snapshot:string; created_at:string; steps:RunStep[] }
export const STEP_NAMES = ['官方怪物数据参考','统计数据基准区间','推荐数据与基础数据块','特性匹配','术语推荐','机制复核','最终完整数据块'] as const
export const TYPES:Record<string,string> = {标准:'standard',斗士:'bruiser',集群:'horde',头目:'leader',杂兵:'minion',远程:'ranged',潜伏:'skulk',社交:'social',独狼:'solo',辅助:'support'}
